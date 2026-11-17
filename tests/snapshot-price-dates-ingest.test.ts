import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { runIngestWithOutput } from './ingest-harness'
import { writeScenario } from './pension-fixtures'

// The fixture's KR prices are dated 2026-10-08 and it holds no US or crypto
// position, so only the KR dates are set.
test('the ingest records the price dates its snapshot was valued with, and the freshness card reads them', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'snapshot-price-dates-'))
  const env = writeScenario(root, { withPensions: false })
  const out = runIngestWithOutput(root, { env, allowFailure: true })

  const db = new Database(out.dbPath, { readonly: true })
  const row = db
    .prepare(`select kr_price_date_newest, kr_price_date_oldest, us_price_date_newest, crypto_price_date_newest
      from portfolio_snapshots order by snapshot_date desc limit 1`)
    .get()
  db.close()
  assert.deepEqual(row, {
    kr_price_date_newest: '2026-10-08',
    kr_price_date_oldest: '2026-10-08',
    us_price_date_newest: null,
    crypto_price_date_newest: null,
  })

  process.env.STOCK_DB_PATH = out.dbPath
  const { getOperationalHealth } = await import('../lib/adapters/portfolio-db')
  const item = getOperationalHealth().snapshots.find((entry) => entry.key === 'snapshot_prices')
  assert.equal(item?.status, 'fresh')
  assert.deepEqual(item?.detail, { code: 'SNAPSHOT_PRICE_DATES', markets: [{ market: 'KR', newest: '2026-10-08', oldest: null }] })
  const { freshnessDetailText, freshnessLabel } = await import('../lib/freshness-text')
  assert.equal(freshnessDetailText(item!.detail, 'en'), 'market date KR 2026-10-08')
  assert.equal(freshnessDetailText(item!.detail, 'ko'), '시장 기준일 한국 2026-10-08')
  assert.equal(freshnessLabel(item!, 'en'), 'Prices in figures')
})
