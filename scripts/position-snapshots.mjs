/**
 * Per-security position rows behind the net worth range breakdown. One row per
 * (snapshot_date, market, ticker): the month-end backfill writes the past dates
 * and the ingest writes today's, both through writePositionSnapshots.
 */

export const POSITION_SNAPSHOTS_DDL = `
create table if not exists position_snapshots (
  id integer primary key,
  snapshot_date text not null,
  market text not null,
  ticker text not null,
  name text,
  quantity real not null,
  cost_krw real not null,
  market_value_krw real,
  unique(snapshot_date, market, ticker)
)`

/**
 * Sum per-account valued positions into one row per security. The market value
 * is null when any contributing account row is unpriced: a partial sum would
 * read as the whole holding.
 */
export function aggregatePositions(valued, names) {
  const bySecurity = new Map()
  for (const position of valued) {
    const key = `${position.market}:${position.ticker}`
    const row = bySecurity.get(key) ?? {
      market: position.market,
      ticker: position.ticker,
      name: names.get(key) || position.ticker,
      quantity: 0,
      cost_krw: 0,
      market_value_krw: 0,
    }
    row.quantity += Number(position.quantity || 0)
    row.cost_krw += Number(position.cost || 0)
    row.market_value_krw =
      row.market_value_krw === null || position.marketValue == null ? null : row.market_value_krw + position.marketValue
    bySecurity.set(key, row)
  }
  return [...bySecurity.values()]
}

export function writePositionSnapshots(db, date, rows) {
  const insert = db.prepare(`
    insert or replace into position_snapshots
      (snapshot_date, market, ticker, name, quantity, cost_krw, market_value_krw)
    values (?, ?, ?, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(date, row.market, row.ticker, row.name, row.quantity, row.cost_krw, row.market_value_krw)
  }
}

/**
 * Today's per-security rows. Value comes from the holdings so it matches the
 * Total assets card; cost comes from the open lots because the past rows use
 * lot cost, and a broker's average cost would show up as a phantom purchase.
 *
 * The row key is the LOT market, because the backfill keys history by
 * tax_lots.market. A Toss US holding carries market US while its sheet-derived
 * lots are KR, so a holding with no lots under its own market takes the one
 * other market that has lots for its ticker.
 *
 * When a ticker held under one market has open lots under more than one market
 * (Toss: sheet lots KR, bridge lots US), and some of those markets hold nothing
 * of their own, the holding is split: one row per lot market, valued at the
 * holding's per-share value times that market's open lot quantity, with that
 * market's lot cost. Quantity no lot covers stays under the holding's own key.
 *
 * `uncosted` lists the quantity left without lot cost: rows with no lot cost,
 * and the uncovered remainder of a split holding. `orphanLots` lists the lot
 * keys whose cost no row picked up. Both are counted by validation checks,
 * never named.
 */
export function buildTodayPositions(holdings, lots) {
  const costByKey = new Map()
  const qtyByKey = new Map()
  const marketsByTicker = new Map()
  const openMarketsByTicker = new Map()
  for (const lot of lots) {
    const key = `${lot.market}:${lot.ticker}`
    costByKey.set(key, (costByKey.get(key) ?? 0) + Number(lot.cost_basis_krw || 0))
    const markets = marketsByTicker.get(lot.ticker) ?? new Set()
    markets.add(lot.market)
    marketsByTicker.set(lot.ticker, markets)
    const quantity = Number(lot.open_quantity || 0)
    if (quantity > 0) {
      qtyByKey.set(key, (qtyByKey.get(key) ?? 0) + quantity)
      const open = openMarketsByTicker.get(lot.ticker) ?? new Set()
      open.add(lot.market)
      openMarketsByTicker.set(lot.ticker, open)
    }
  }

  const holdingMarketsByTicker = new Map()
  for (const row of holdings) {
    const markets = holdingMarketsByTicker.get(row.ticker) ?? new Set()
    markets.add(row.market)
    holdingMarketsByTicker.set(row.ticker, markets)
  }
  // Split a ticker when it is held under exactly one market and its open lots
  // sit under more than one market, at least one of which holds nothing itself.
  const splitTickers = new Set()
  for (const [ticker, open] of openMarketsByTicker) {
    const held = holdingMarketsByTicker.get(ticker)
    if (!held || held.size !== 1 || open.size < 2) continue
    if ([...open].some((market) => !held.has(market))) splitTickers.add(ticker)
  }

  const names = new Map()
  const valued = []
  const remainders = []
  const splitHoldings = new Map()
  for (const row of holdings) {
    if (splitTickers.has(row.ticker)) {
      const group = splitHoldings.get(row.ticker) ?? []
      group.push(row)
      splitHoldings.set(row.ticker, group)
      continue
    }
    let market = row.market
    if (!costByKey.has(`${market}:${row.ticker}`)) {
      const others = [...(marketsByTicker.get(row.ticker) ?? [])].filter((m) => m !== market)
      if (others.length === 1) market = others[0]
    }
    names.set(`${market}:${row.ticker}`, row.name)
    valued.push({ market, account: row.account, ticker: row.ticker, quantity: row.quantity, cost: 0, marketValue: row.base_market_value })
  }

  for (const [ticker, group] of splitHoldings) {
    const ownMarket = group[0].market
    const heldQty = group.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
    const heldValue = group.some((row) => row.base_market_value == null)
      ? null
      : group.reduce((sum, row) => sum + Number(row.base_market_value), 0)
    const lotMarkets = [...openMarketsByTicker.get(ticker)].sort()
    const lotQty = lotMarkets.reduce((sum, market) => sum + qtyByKey.get(`${market}:${ticker}`), 0)
    // Lots covering more than the holding share the whole value by quantity.
    const scale = lotQty > heldQty && lotQty > 0 ? heldQty / lotQty : 1
    const perShare = heldQty > 0 && heldValue !== null ? heldValue / heldQty : null
    for (const market of lotMarkets) {
      const quantity = qtyByKey.get(`${market}:${ticker}`) * scale
      names.set(`${market}:${ticker}`, group[0].name)
      valued.push({ market, account: null, ticker, quantity, cost: 0, marketValue: perShare === null ? null : perShare * quantity })
    }
    const remainder = heldQty - lotQty * scale
    if (remainder > 1e-9) {
      names.set(`${ownMarket}:${ticker}`, group[0].name)
      valued.push({ market: ownMarket, account: null, ticker, quantity: remainder, cost: 0, marketValue: perShare === null ? null : perShare * remainder })
      remainders.push({ market: ownMarket, ticker, quantity: remainder })
    }
  }

  const positions = aggregatePositions(valued, names).map((row) => ({
    ...row,
    cost_krw: costByKey.get(`${row.market}:${row.ticker}`) ?? 0,
  }))
  const uncosted = [
    ...positions.filter((row) => row.quantity > 0 && !costByKey.has(`${row.market}:${row.ticker}`)),
    // A split remainder under a key that does carry lot cost is still uncosted quantity.
    ...remainders.filter((r) => costByKey.has(`${r.market}:${r.ticker}`)),
  ]
  const written = new Set(positions.map((row) => `${row.market}:${row.ticker}`))
  const orphanLots = [...costByKey.entries()]
    .filter(([key, cost]) => cost !== 0 && !written.has(key))
    .map(([key, cost]) => ({ key, cost }))
  return { positions, uncosted, orphanLots }
}
