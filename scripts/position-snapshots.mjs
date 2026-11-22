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
