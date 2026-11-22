import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { runIngestWithOutput } from './ingest-harness'
import { writeScenario } from './pension-fixtures'
import { buildTodayPositions } from '../scripts/position-snapshots.mjs'

function ingest(root: string) {
  const env = writeScenario(root, { withPensions: false })
  return runIngestWithOutput(root, { env, allowFailure: true })
}

test("today's rows take value from holdings and cost from lots", () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-'))
  const out = ingest(root)
  const db = new Database(out.dbPath, { readonly: true })
  const today = db.prepare('select snapshot_date as d from portfolio_snapshots order by snapshot_date desc limit 1').get() as { d: string }
  const rows = db.prepare('select * from position_snapshots where snapshot_date = ? order by market, ticker').all(today.d) as Array<{
    market: string
    ticker: string
    name: string
    quantity: number
    cost_krw: number
    market_value_krw: number | null
  }>
  assert.ok(rows.length > 0)
  for (const row of rows) {
    const value = db
      .prepare('select sum(base_market_value) as v, sum(quantity) as q, min(name) as n from holdings where market = ? and ticker = ?')
      .get(row.market, row.ticker) as { v: number; q: number; n: string }
    const lots = db
      .prepare('select coalesce(sum(cost_basis_krw), 0) as c from tax_lots where market = ? and ticker = ?')
      .get(row.market, row.ticker) as { c: number }
    assert.equal(row.market_value_krw, value.v)
    assert.equal(row.quantity, value.q)
    assert.equal(row.name, value.n)
    assert.equal(row.cost_krw, lots.c)
    assert.ok(row.cost_krw > 0, `${row.market}:${row.ticker} has a lot cost`)
  }
  db.close()
})

test('previous rows survive a re-ingest', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-'))
  const first = ingest(root)
  const seed = new Database(first.dbPath)
  seed
    .prepare(
      `insert into position_snapshots (snapshot_date, market, ticker, name, quantity, cost_krw, market_value_krw)
       values ('2020-01-31', 'KR', 'OLD', 'Old holding', 3, 300, 330)`
    )
    .run()
  seed.close()
  const second = ingest(root)
  const db = new Database(second.dbPath, { readonly: true })
  const kept = db.prepare("select * from position_snapshots where snapshot_date = '2020-01-31'").all()
  db.close()
  assert.equal(kept.length, 1)
})

test('stock_views_self_only passes on the fixture', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-'))
  const out = ingest(root)
  const db = new Database(out.dbPath, { readonly: true })
  const row = db.prepare("select status, severity from validation_checks where name = 'stock_views_self_only'").get()
  db.close()
  assert.deepEqual(row, { status: 'pass', severity: 'warning' })
})

test('position_snapshot_costs_present passes on the fixture', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-'))
  const out = ingest(root)
  const db = new Database(out.dbPath, { readonly: true })
  const row = db.prepare("select status, severity from validation_checks where name = 'position_snapshot_costs_present'").get()
  db.close()
  assert.deepEqual(row, { status: 'pass', severity: 'warning' })
})

const holding = (market: string, ticker: string) => ({ market, account: 'a', ticker, name: ticker, quantity: 2, base_market_value: 500 })
const lot = (market: string, ticker: string, cost: number) => ({ market, ticker, cost_basis_krw: cost })

test('a US holding whose lots are KR is keyed by the lot market and takes the lot cost', () => {
  const { positions, uncosted } = buildTodayPositions([holding('US', 'X')], [lot('KR', 'X', 100), lot('KR', 'X', 50)])
  assert.deepEqual(positions.map((p) => [p.market, p.ticker, p.cost_krw, p.market_value_krw]), [['KR', 'X', 150, 500]])
  assert.equal(uncosted.length, 0)
})

test('without lot quantities, a holding keeps its own market when lots exist there, or when lots sit under two other markets', () => {
  const own = buildTodayPositions([holding('US', 'X')], [lot('US', 'X', 10), lot('KR', 'X', 99)])
  assert.deepEqual(own.positions.map((p) => [p.market, p.cost_krw]), [['US', 10]])
  const ambiguous = buildTodayPositions([holding('US', 'X')], [lot('KR', 'X', 1), lot('CRYPTO', 'X', 2)])
  assert.equal(ambiguous.positions[0].market, 'US')
  assert.equal(ambiguous.uncosted.length, 1)
})

test('a held security with no lot anywhere is reported uncosted', () => {
  const { positions, uncosted } = buildTodayPositions([holding('KR', 'Y')], [])
  assert.equal(positions[0].cost_krw, 0)
  assert.equal(uncosted.length, 1)
})

const heldUnits = (market: string, ticker: string, quantity: number, value: number | null) => ({ market, account: 'a', ticker, name: ticker, quantity, base_market_value: value })
const openLot = (market: string, ticker: string, quantity: number, cost: number) => ({ market, ticker, open_quantity: quantity, cost_basis_krw: cost })

test('a holding whose open lots sit under two markets is split per lot market', () => {
  const { positions, uncosted, orphanLots } = buildTodayPositions(
    [heldUnits('US', 'X', 10, 1000)],
    [openLot('KR', 'X', 6, 300), openLot('KR', 'X', 1, 40), openLot('US', 'X', 3, 200)]
  )
  const byMarket = Object.fromEntries(positions.map((p) => [p.market, p]))
  assert.deepEqual(Object.keys(byMarket).sort(), ['KR', 'US'])
  assert.equal(byMarket.KR.quantity, 7)
  assert.equal(byMarket.KR.market_value_krw, 700)
  assert.equal(byMarket.KR.cost_krw, 340)
  assert.equal(byMarket.US.quantity, 3)
  assert.equal(byMarket.US.market_value_krw, 300)
  assert.equal(byMarket.US.cost_krw, 200)
  assert.equal(byMarket.KR.market_value_krw + byMarket.US.market_value_krw, 1000)
  assert.equal(uncosted.length, 0)
  assert.equal(orphanLots.length, 0)
})

test('quantity no lot covers stays under the holding market and counts as uncosted', () => {
  const { positions, uncosted } = buildTodayPositions([heldUnits('US', 'X', 10, 1000)], [openLot('KR', 'X', 4, 100), openLot('US', 'X', 2, 50)])
  const byMarket = Object.fromEntries(positions.map((p) => [p.market, p]))
  assert.equal(byMarket.KR.quantity, 4)
  assert.equal(byMarket.KR.market_value_krw, 400)
  assert.equal(byMarket.US.quantity, 6)
  assert.equal(byMarket.US.market_value_krw, 600)
  assert.equal(byMarket.US.cost_krw, 50)
  assert.equal(uncosted.length, 1)
})

test('an uncovered remainder under a market with no lots is an uncosted row', () => {
  const { positions, uncosted } = buildTodayPositions(
    [heldUnits('CRYPTO', 'X', 10, 1000)],
    [openLot('KR', 'X', 4, 100), openLot('US', 'X', 2, 50)]
  )
  assert.deepEqual(positions.map((p) => [p.market, p.quantity, p.market_value_krw, p.cost_krw]).sort(), [
    ['CRYPTO', 4, 400, 0],
    ['KR', 4, 400, 100],
    ['US', 2, 200, 50],
  ])
  assert.equal(uncosted.length, 1)
})

test('an unpriced split holding writes unpriced rows', () => {
  const { positions } = buildTodayPositions([heldUnits('US', 'X', 10, null)], [openLot('KR', 'X', 6, 300), openLot('US', 'X', 4, 200)])
  assert.deepEqual(positions.map((p) => p.market_value_krw), [null, null])
})

test('open-lot cost no row picks up is reported', () => {
  const { orphanLots } = buildTodayPositions([heldUnits('KR', 'Y', 1, 10)], [openLot('KR', 'Y', 1, 5), openLot('US', 'GONE', 2, 80)])
  assert.deepEqual(orphanLots, [{ key: 'US:GONE', cost: 80 }])
})

test('position_snapshot_lot_costs_used passes on the fixture', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-'))
  const out = ingest(root)
  const db = new Database(out.dbPath, { readonly: true })
  const row = db.prepare("select status, severity from validation_checks where name = 'position_snapshot_lot_costs_used'").get()
  db.close()
  assert.deepEqual(row, { status: 'pass', severity: 'warning' })
})
