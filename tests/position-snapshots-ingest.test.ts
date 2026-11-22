import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { runIngestWithOutput } from './ingest-harness'
import { writeScenario } from './pension-fixtures'

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
