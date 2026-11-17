import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { runIngest } from './ingest-harness'
import { writeSheetPayloads } from './sheet-payloads'

// The position page shows Long-term and Short-term quantity summed from the
// holdings rows, and the lot count from tax_lots. Chase and Merrill holdings
// rows left the term split null even though every lot under them carries a
// term, so a ticker held at Chase beside Robinhood showed long + short equal to
// the Robinhood part alone while the lot count included Chase's lots.
//
// Every figure below is invented.

const CHASE_HEADER =
  'Account name,Account number,Account type,Asset Class,Ticker,Description,Quantity,Unit Cost,Cost,Value,' +
  'Unrealized G/L Amt.,Base CCY,As of,Acquisition Date,Days held,Tax term'
const CHASE_ROWS = [
  'SAMPLE,...1234,Brokerage,Equity,ACME,ACME CORP,10,20,200,300,100,USD,01/12/2026,03/01/2023,1048,Long Term',
  'SAMPLE,...1234,Brokerage,Equity,ACME,ACME CORP,4,25,100,120,20,USD,01/12/2026,09/01/2025,133,Short Term',
  'SAMPLE,...1234,Brokerage,Equity,ACME,ACME CORP,1.5,30,45,45,0,USD,01/12/2026,12/15/2025,28,Short Term',
]

type HoldingRow = { quantity: number; long_term_qty: number | null; short_term_qty: number | null; lot_count: number | null }

function holding(dbPath: string, brokerage: string, ticker: string) {
  const db = new Database(dbPath, { readonly: true })
  const row = db
    .prepare('select quantity, long_term_qty, short_term_qty, lot_count from holdings where brokerage = ? and ticker = ?')
    .get(brokerage, ticker) as HoldingRow | undefined
  const lots = (db
    .prepare('select count(*) as n from tax_lots where brokerage = ? and ticker = ?')
    .get(brokerage, ticker) as { n: number }).n
  db.close()
  return { row, lots }
}

test('a Chase holding carries the term split of its lots, and long + short is the open quantity', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'chase-term-split-'))
  writeSheetPayloads(dir)
  mkdirSync(path.join(dir, 'us-holdings'), { recursive: true })
  writeFileSync(
    path.join(dir, 'us-holdings', 'chase-holdings-20260113.csv'),
    [CHASE_HEADER, ...CHASE_ROWS].join('\n') + '\n',
    'utf8'
  )

  const { row, lots } = holding(runIngest(dir, { allowFailure: true }), 'Chase', 'ACME')

  assert.ok(row, 'the Chase lots roll up into one holding')
  assert.equal(row.quantity, 15.5)
  assert.equal(row.long_term_qty, 10)
  assert.equal(row.short_term_qty, 5.5)
  assert.equal((row.long_term_qty ?? 0) + (row.short_term_qty ?? 0), row.quantity)
  assert.equal(row.lot_count, lots)
  assert.equal(lots, 3)
})

// Merrill's per-lot layout: a position row with its lots printed under it, the
// term in parentheses after each acquisition date.
const MERRILL_LOTS = [
  '"Exported on: 01/13/2026 09:00 AM ET"',
  '',
  '"Selected account(s): CMA-Edge 00X-00000"',
  '',
  '"","Symbol","Quantity","Unit Cost","Cost Basis","Price","Value","Unrealized Gain/Loss"',
  '"","WIDG WIDGET FUND","8","$12.50","$100.00","$15.00","$120.00","$20.00 20.00%"',
  '"","","02/01/2023 (Long)","5","$10.00","$50.00","$15.00","$75.00","$25.00 50.00%"',
  '"","","11/01/2025 (Short)","3","$16.67","$50.00","$15.00","$45.00","-$5.00 -10.00%"',
].join('\n') + '\n'

test('a Merrill per-lot holding takes its split from the lots printed under it', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'merrill-term-split-'))
  writeSheetPayloads(dir)
  mkdirSync(path.join(dir, 'us-holdings'), { recursive: true })
  writeFileSync(path.join(dir, 'us-holdings', 'merrill-holdings-20260113.csv'), MERRILL_LOTS, 'utf8')

  const { row, lots } = holding(runIngest(dir, { allowFailure: true }), 'Merrill', 'WIDG')

  assert.ok(row, 'the Merrill position is ingested')
  assert.equal(lots, 2)
  assert.equal(row.quantity, 8)
  assert.equal(row.long_term_qty, 5)
  assert.equal(row.short_term_qty, 3)
  assert.equal(row.lot_count, 2)
})
