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
 * other market that has lots for its ticker. `uncosted` lists the rows left
 * without any lot cost (counted by a validation check, never named).
 */
export function buildTodayPositions(holdings, lots) {
  const costByKey = new Map()
  const marketsByTicker = new Map()
  for (const lot of lots) {
    const key = `${lot.market}:${lot.ticker}`
    costByKey.set(key, (costByKey.get(key) ?? 0) + Number(lot.cost_basis_krw || 0))
    const markets = marketsByTicker.get(lot.ticker) ?? new Set()
    markets.add(lot.market)
    marketsByTicker.set(lot.ticker, markets)
  }
  const names = new Map()
  const valued = holdings.map((row) => {
    let market = row.market
    if (!costByKey.has(`${market}:${row.ticker}`)) {
      const others = [...(marketsByTicker.get(row.ticker) ?? [])].filter((m) => m !== market)
      if (others.length === 1) market = others[0]
    }
    names.set(`${market}:${row.ticker}`, row.name)
    return {
      market,
      account: row.account,
      ticker: row.ticker,
      quantity: row.quantity,
      cost: 0,
      marketValue: row.base_market_value,
    }
  })
  const positions = aggregatePositions(valued, names).map((row) => ({
    ...row,
    cost_krw: costByKey.get(`${row.market}:${row.ticker}`) ?? 0,
  }))
  const uncosted = positions.filter((row) => row.quantity > 0 && !costByKey.has(`${row.market}:${row.ticker}`))
  return { positions, uncosted }
}
