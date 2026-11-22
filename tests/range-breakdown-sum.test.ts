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

// The spec's invariant: for a period between two month ends, the per-security
// market effect (stocks + crypto) adds up to the snapshot-level investment
// result over the same dates, when both read the same realized lots. The
// scenario's ingest stores no historical closes, so every past row would be
// unpriced; two closes for its one KR holding are inserted before the backfill,
// one on each side of the scenario's partial sale, so the period carries both
// an unrealized change and a realized gain.
test('market effect over a month-end period equals the investment result', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'range-breakdown-sum-'))
  const env = writeScenario(root, { withPensions: false })
  const out = runIngestWithOutput(root, { env, allowFailure: true })
  const write = new Database(out.dbPath)
  const holding = write.prepare("select ticker from tax_lots where market = 'KR' limit 1").get() as { ticker: string }
  write
    .prepare(
      `insert into historical_prices (market, ticker, symbol, currency, price_date, close, source)
       values ('KR', @ticker, @ticker, 'KRW', '2026-01-30', 60000, 'test'), ('KR', @ticker, @ticker, 'KRW', '2026-03-31', 70000, 'test')`,
    )
    .run({ ticker: holding.ticker })
  write.close()
  execFileSync(process.execPath, [BACKFILL], { cwd: root, stdio: 'pipe', env: ingestEnv(root, { STOCK_DB_PATH: out.dbPath }) as NodeJS.ProcessEnv })

  process.env.STOCK_DB_PATH = out.dbPath
  const { getPortfolioSnapshots, getPositionSnapshots, getRealizedGains } = await import('../lib/adapters/portfolio-db')
  const { rangeBreakdown } = await import('../lib/range-breakdown')
  const { investmentResultBetween } = await import('../lib/total-assets-change')

  const from = '2026-01-31'
  const to = '2026-03-31'
  const rows = getPositionSnapshots([from, to])
  assert.ok(rows && rows.length > 0, 'both month ends hold position rows')
  assert.ok(rows.every((row) => row.marketValueKrw !== null), 'both month ends are priced')
  const realized = getRealizedGains(from, to)
  assert.ok(realized.length > 0, 'the period holds a sale, so realized gains are part of the sum')

  // The page's two sections: stocks (KR + US) and crypto.
  const marketEffect = [['KR', 'US'], ['CRYPTO']]
    .map((markets) => rangeBreakdown({ from, to, rows, realized, markets }).marketEffectTotal)
    .reduce((sum, value) => sum + value, 0)
  const investment = investmentResultBetween(
    getPortfolioSnapshots(100 * 365).map((row) => ({ date: row.snapshot_date, unrealized: row.global_base_unrealized_gl, realized: row.global_realized_gl })),
    from,
    to,
  )
  assert.ok(investment, 'the investment result is available for the period')
  assert.notEqual(investment.unrealized, 0, 'the period moves unrealized gain too')
  assert.ok(Math.abs(marketEffect - investment.total) <= 1, `market effect ${marketEffect} vs investment result ${investment.total}`)
})
