import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { collectUsPriceTickers } from '../scripts/source-files.mjs'
import { runIngest } from './ingest-harness'
import { writeSheetPayloads } from './sheet-payloads'

// The price fetch and the ingest each decide which US tickers exist, and the
// fetch runs first. The ingest takes Robinhood lots from the MCP snapshot
// whenever the snapshot has any, but the fetch used to learn Robinhood tickers
// only from the Gain/Loss PDF evidence. A position opened after the last PDF
// was therefore valued by the ingest and never priced by the fetch, and the
// row surfaced as "ticker missing from price snapshot".

const SNAPSHOT = {
  fetchedAt: '2026-11-21T02:00:00Z',
  accounts: [{
    accountNumber: '000001111',
    positions: [
      { symbol: 'ANT', quantity: '2.000000' },
      { symbol: 'SOLD', quantity: '0.000000' },
    ],
    lots: [
      { symbol: 'ANT', lots: [{ quantity: '2.000000', tax_cost_basis: '100.00', open_date: '2026-11-20', term: 'short' }] },
    ],
  }],
}

test('a ticker held only in the Robinhood snapshot is requested by the price fetch', () => {
  const tickers = collectUsPriceTickers({ holdingFiles: [], evidence: { reports: [] }, robinhoodSnapshot: SNAPSHOT })
  assert.deepEqual(tickers, ['ANT'])
})

test('a fully sold snapshot position is not requested', () => {
  const tickers = collectUsPriceTickers({ holdingFiles: [], evidence: null, robinhoodSnapshot: SNAPSHOT })
  assert.ok(!tickers.includes('SOLD'))
})

test('PDF evidence tickers are still requested when there is no snapshot', () => {
  const evidence = { reports: [{ lots: [{ ticker: 'VOO' }] }] }
  assert.deepEqual(collectUsPriceTickers({ holdingFiles: [], evidence, robinhoodSnapshot: null }), ['VOO'])
})

test('every US row the ingest values from the snapshot gets a price from the fetch ticker set', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'us-price-tickers-'))
  try {
    writeSheetPayloads(dir)
    const snapshotPath = path.join(dir, 'snapshot.json')
    writeFileSync(snapshotPath, JSON.stringify(SNAPSHOT))
    // Price exactly what the fetch would ask Yahoo for, as the refresh does.
    const tickers = collectUsPriceTickers({ holdingFiles: [], evidence: null, robinhoodSnapshot: SNAPSHOT })
    const pricesPath = path.join(dir, 'us-prices.json')
    writeFileSync(pricesPath, JSON.stringify({
      prices: tickers.map((ticker) => ({ ticker, symbol: ticker, price: 60, currency: 'USD', asOfDate: '2026-11-20' })),
      missing: [],
    }))
    const dbPath = runIngest(dir, {
      env: { STOCK_ROBINHOOD_SNAPSHOT_PATH: snapshotPath, STOCK_US_PRICES_PATH: pricesPath },
      allowFailure: true,
    })
    const db = new Database(dbPath, { readonly: true })
    try {
      const check = db.prepare("select status, detail from validation_checks where name = 'us_prices_available_for_unrealized_gl'").get() as { status: string; detail: string }
      assert.equal(check.status, 'pass', check.detail)
    } finally { db.close() }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
