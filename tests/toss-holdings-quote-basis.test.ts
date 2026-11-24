import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { runIngest } from './ingest-harness'
import { writeSheetPayloads } from './sheet-payloads'

// Toss holdings used to keep Toss's own lastPrice, which is only as fresh as the
// six-hourly snapshot and, after the KRX bell, is the NXT evening trade. Every
// other holding is valued from the quote files, so Toss positions sat on another
// basis and pulled the day's Korean total down after the close.

function holding(symbol: string, quantity: number, unit: number, last: number, market = 'KR', currency = 'KRW') {
  return {
    symbol, name: symbol, currency, marketCountry: market, quantity, averagePurchasePrice: unit,
    lastPrice: last, marketValue: { purchaseAmount: quantity * unit, amount: quantity * last },
    profitLoss: { amount: quantity * (last - unit), rate: (last - unit) / unit },
  }
}

function ingest(krQuotes: object[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'toss-quote-basis-'))
  writeSheetPayloads(dir)
  const snapshot = path.join(dir, 'toss-snapshot.json')
  writeFileSync(snapshot, JSON.stringify({
    fetchedAt: '2030-03-12T18:00:00Z',
    accounts: [{ holdings: { items: [holding('111111', 10, 1000, 1100), holding('222222', 5, 2000, 1900)] }, orders: [] }],
  }), 'utf8')
  const kr = path.join(dir, 'kr-prices.json')
  writeFileSync(kr, JSON.stringify({ prices: krQuotes }), 'utf8')
  const dbPath = runIngest(dir, { env: { STOCK_TOSS_SNAPSHOT_PATH: snapshot, STOCK_KR_PRICES_PATH: kr }, allowFailure: true })
  const db = new Database(dbPath, { readonly: true })
  const rows = db
    .prepare("select ticker, native_price, native_market_value, base_market_value, native_unrealized_gl, as_of_date, source_system from holdings_all where source_system = 'toss_open_api' order by ticker")
    .all() as { ticker: string; native_price: number; native_market_value: number; base_market_value: number; native_unrealized_gl: number; as_of_date: string; source_system: string }[]
  db.close()
  return rows
}

test('a Toss holding is valued at the quote-file price, dated by that quote', () => {
  const rows = ingest([{ ticker: '111111', price: 1200, currency: 'KRW', asOfDate: '2030-03-12' }])
  const [priced, unquoted] = rows
  assert.equal(priced.ticker, '111111')
  assert.equal(priced.native_price, 1200)
  assert.equal(priced.native_market_value, 12000)
  assert.equal(priced.base_market_value, 12000)
  assert.equal(priced.native_unrealized_gl, 2000)
  assert.equal(priced.as_of_date, '2030-03-12')
  assert.equal(priced.source_system, 'toss_open_api', 'the backing system the Toss checks read is unchanged')
  // No quote for this one: Toss's own price and the snapshot date stay.
  assert.equal(unquoted.ticker, '222222')
  assert.equal(unquoted.native_price, 1900)
  assert.equal(unquoted.native_market_value, 9500)
  assert.equal(unquoted.as_of_date, '2030-03-12')
})

test('a quote in another currency is not used for a Toss holding', () => {
  const rows = ingest([{ ticker: '111111', price: 1, currency: 'USD', asOfDate: '2030-03-11' }])
  assert.equal(rows[0].native_price, 1100)
})
