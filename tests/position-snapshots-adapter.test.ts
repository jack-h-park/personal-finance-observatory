import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

// The adapter reads one database, fixed when it is first imported, so each test
// rebuilds the tables it needs in that single scratch file.
const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'position-snapshots-adapter-')), 'portfolio.db')
process.env.STOCK_DB_PATH = dbPath

function reset(sql: string) {
  const db = new Database(dbPath)
  db.exec('drop table if exists position_snapshots; drop table if exists realized_lots')
  db.exec(sql)
  db.close()
}

test('missing table returns null', async () => {
  reset('create table unrelated (x integer)')
  const { getPositionSnapshots } = await import('../lib/adapters/portfolio-db')
  assert.equal(getPositionSnapshots(['2026-10-31']), null)
})

test('snapshots are read for the requested dates only', async () => {
  reset(`create table position_snapshots (id integer primary key, snapshot_date text, market text, ticker text, name text, quantity real, cost_krw real, market_value_krw real);
    insert into position_snapshots (snapshot_date, market, ticker, name, quantity, cost_krw, market_value_krw) values
      ('2026-09-30', 'KR', 'AAA', 'Alpha', 2, 100, 150),
      ('2026-10-31', 'US', 'BBB', 'Beta', 1, 50, null),
      ('2026-10-15', 'KR', 'AAA', 'Alpha', 1, 1, 1)`)
  const { getPositionSnapshots } = await import('../lib/adapters/portfolio-db')
  assert.deepEqual(getPositionSnapshots(['2026-09-30', '2026-10-31']), [
    { date: '2026-09-30', market: 'KR', ticker: 'AAA', name: 'Alpha', quantity: 2, costKrw: 100, marketValueKrw: 150 },
    { date: '2026-10-31', market: 'US', ticker: 'BBB', name: 'Beta', quantity: 1, costKrw: 50, marketValueKrw: null },
  ])
  assert.deepEqual(getPositionSnapshots([]), [])
})

test('realized gains skip superseded rows', async () => {
  reset(`create table realized_lots (market text, ticker text, sold_date text, realized_gl_krw real, superseded_by text);
    insert into realized_lots values ('US', 'MSFT', '2026-10-10', 500, null), ('US', 'MSFT', '2026-10-10', 450, 'filing-1'),
      ('CRYPTO', 'BTC', '2026-09-30', 70, null), ('KR', 'AAA', '2026-11-30', 9, null)`)
  const { getRealizedGains } = await import('../lib/adapters/portfolio-db')
  assert.deepEqual(getRealizedGains('2026-09-30', '2026-11-21'), [
    { market: 'US', ticker: 'MSFT', soldDate: '2026-10-10', realizedKrw: 500 },
  ])
})

// Daily snapshots exist for the /holdings charts; every other reader gets one date per month.
test('snapshot readers keep one date per month unless daily is requested', async () => {
  const db = new Database(dbPath)
  db.exec(`drop table if exists portfolio_snapshots;
    create table portfolio_snapshots (
      snapshot_date text, captured_at text, global_base_cost real, global_base_market_value real,
      global_base_unrealized_gl real, global_base_return_pct real,
      kr_market_value real, us_market_value_base real, crypto_market_value_base real,
      kr_cost_basis real, us_cost_basis_base real, crypto_cost_basis_base real,
      kr_unrealized_gl real, us_unrealized_gl_base real, crypto_unrealized_gl_base real,
      kr_return_pct real, us_return_pct real, crypto_return_pct real,
      krw_cost real, usd_cost real, dividends_krw real, dividends_usd real, holding_count integer, share_count real);
    insert into portfolio_snapshots (snapshot_date, captured_at, global_base_cost) values
      ('2026-10-30', '2026-10-30', 1), ('2026-10-31', '2026-10-31', 1),
      ('2026-11-20', '2026-11-20', 1), ('2026-11-23', '2026-11-23', 1)`)
  db.close()
  const { getSnapshotDates, getPortfolioSnapshots } = await import('../lib/adapters/portfolio-db')
  const all = ['2026-10-30', '2026-10-31', '2026-11-20', '2026-11-23']
  assert.deepEqual(getSnapshotDates(3650), ['2026-10-31', '2026-11-23'])
  assert.deepEqual(getSnapshotDates(3650, { daily: true }), all)
  assert.deepEqual(getPortfolioSnapshots(3650).map((r) => r.snapshot_date), ['2026-10-31', '2026-11-23'])
  assert.deepEqual(getPortfolioSnapshots(3650, { daily: true }).map((r) => r.snapshot_date), all)
})
