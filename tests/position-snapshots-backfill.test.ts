import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { REPO_ROOT, ingestEnv, runIngestWithOutput } from './ingest-harness'
import { writeScenario } from './pension-fixtures'

const BACKFILL = path.join(REPO_ROOT, 'scripts/backfill-portfolio-history.mjs')

// Same isolation as the ingest harness: no inherited STOCK_*, cwd in the scratch
// directory so loadLocalEnv finds no .env.local.
function runBackfill(root: string, dbPath: string) {
  const env = ingestEnv(root, { STOCK_DB_PATH: dbPath })
  return execFileSync(process.execPath, [BACKFILL], {
    cwd: root,
    stdio: 'pipe',
    env: env as NodeJS.ProcessEnv,
    encoding: 'utf8',
  })
}

type Sums = { kr: number | null; us: number | null; crypto: number | null }

test('backfill writes rows whose sums match portfolio_snapshots', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-'))
  const env = writeScenario(root, { withPensions: false })
  const out = runIngestWithOutput(root, { env, allowFailure: true })
  runBackfill(root, out.dbPath)

  const db = new Database(out.dbPath, { readonly: true })
  const current = (db.prepare('select max(snapshot_date) as d from portfolio_snapshots').get() as { d: string }).d
  const snapshots = db
    .prepare('select snapshot_date, kr_market_value, us_market_value_base, crypto_market_value_base from portfolio_snapshots where snapshot_date < ?')
    .all(current) as { snapshot_date: string; kr_market_value: number | null; us_market_value_base: number | null; crypto_market_value_base: number | null }[]
  assert.ok(snapshots.length > 0, 'the backfill wrote past dates')
  const sum = db.prepare(
    `select sum(case when market in ('KR', 'US') then market_value_krw end) as krus,
            sum(case when market = 'CRYPTO' then market_value_krw end) as crypto
       from position_snapshots where snapshot_date = ? and market_value_krw is not null`
  )
  let rows = 0
  for (const snapshot of snapshots) {
    const got = sum.get(snapshot.snapshot_date) as { krus: number | null; crypto: number | null }
    const wantKrUs = (snapshot.kr_market_value ?? 0) + (snapshot.us_market_value_base ?? 0)
    assert.ok(Math.abs((got.krus ?? 0) - wantKrUs) <= 1, `${snapshot.snapshot_date} KR+US`)
    assert.ok(Math.abs((got.crypto ?? 0) - (snapshot.crypto_market_value_base ?? 0)) <= 1, `${snapshot.snapshot_date} crypto`)
    rows += (db.prepare('select count(*) as n from position_snapshots where snapshot_date = ?').get(snapshot.snapshot_date) as { n: number }).n
  }
  db.close()
  assert.ok(rows > 0, 'the past dates hold position rows')
})

test('a superseded realized lot is held once', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'position-snapshots-superseded-'))
  const dbPath = path.join(root, 'old.db')
  const db = new Database(dbPath)
  db.exec(`
    create table portfolio_snapshots (id integer primary key, snapshot_date text not null unique, captured_at text not null,
      global_base_cost real not null, krw_cost real not null default 0, usd_cost real not null default 0,
      dividends_krw real not null default 0, dividends_usd real not null default 0, holding_count integer not null default 0,
      share_count real not null default 0, global_base_market_value real, global_base_unrealized_gl real, global_base_return_pct real, market_value_coverage real, priced_base_cost real, position_coverage real, kr_market_value_coverage real, us_market_value_coverage real, crypto_market_value_coverage real, kr_market_value real, us_market_value_base real, crypto_market_value_base real, kr_cost_basis real, us_cost_basis_base real, crypto_cost_basis_base real, kr_unrealized_gl real, us_unrealized_gl_base real, crypto_unrealized_gl_base real, kr_return_pct real, us_return_pct real, crypto_return_pct real);
    create table tax_lots (market text, account text, ticker text, name text, acquired_date text, currency text,
      open_quantity real, native_cost_basis real, cost_basis_krw real);
    create table realized_lots (market text, account text, ticker text, name text, acquired_date text, sold_date text,
      quantity_sold real, cost_basis_krw real, superseded_by text);
    create table dividends (date text, currency text, native_amount real);
    create table holdings (market text, quantity real, base_cost real, base_market_value real);
    create table historical_prices (market text, ticker text, currency text, price_date text, close real);
    create table historical_fx_rates (price_date text, rate real);
    insert into portfolio_snapshots (snapshot_date, captured_at, global_base_cost) values ('2026-03-15', 'x', 0);
    insert into realized_lots values ('US', 'a', 'AAPL', 'Apple', '2026-01-10', '2026-03-01', 10, 1000, null);
    insert into realized_lots values ('US', 'a', 'AAPL', 'Apple', '2026-01-10', '2026-03-01', 10, 1000, '1099b:2026');
    insert into historical_prices values ('US', 'AAPL', 'USD', '2026-01-31', 2);
    insert into historical_fx_rates values ('2026-01-31', 1);
  `)
  db.close()
  runBackfill(root, dbPath)
  const check = new Database(dbPath, { readonly: true })
  const rows = check.prepare("select quantity, cost_krw, market_value_krw from position_snapshots where snapshot_date = '2026-01-31'").all()
  check.close()
  assert.deepEqual(rows, [{ quantity: 10, cost_krw: 1000, market_value_krw: 20 }])
})
