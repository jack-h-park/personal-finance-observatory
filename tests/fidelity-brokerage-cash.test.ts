import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { runIngest } from './ingest-harness'
import { writeSheetPayloads } from './sheet-payloads'

// Fidelity prints the account's cash after every row. That cash was counted nowhere, so
// money moved in from checking read as a loss in total assets until the shares bought with
// it raised the cost basis. Every figure below is invented.

const HEADER =
  'Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),' +
  'Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date'

const row = (date: string, action: string, amount: string, cash: string, symbol = '', quantity = '0') =>
  `${date},"${action}",${symbol},"No Description",Cash,"",${quantity},"","","",${amount},${cash},""`

/** Files list newest first, with the title lines Fidelity puts above the header. */
const file = (...rows: string[]) => ['', '', HEADER, ...rows].join('\n')

function cashRows(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fidelity-cash-'))
  mkdirSync(path.join(dir, 'us-transactions'), { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, 'us-transactions', name), body, 'utf8')
  writeSheetPayloads(dir)
  const db = new Database(runIngest(dir), { readonly: true })
  return db
    .prepare("select as_of_date as date, balance, source from brokerage_cash where institution = 'Fidelity' order by as_of_date")
    .all() as { date: string; balance: number; source: string }[]
}

test('the cash of each day is the first row of that day, and an account that opens with a transfer in opens at zero', () => {
  const rows = cashRows({
    'fidelity-transactions-20251014-20251216.csv': file(
      // Newest first. Two rows on 12-16: the first listed is the day's close.
      row('12/16/2025', 'REINVESTMENT FIDELITY GOVERNMENT MONEY MARKET (SPAXX) (Cash)', '-3', '2587.03', 'SPAXX', '3'),
      row('12/16/2025', 'YOU BOUGHT EXAMPLE FUND (EXMP) (Cash)', '-4000', '2587', 'EXMP', '40'),
      row('10/28/2025', 'Electronic Funds Transfer Received (Cash)', '10000', '6587'),
      row('10/14/2025', 'Electronic Funds Transfer Received (Cash)', '10000', '10000')
    ),
  })
  assert.deepEqual(
    rows.map((r) => [r.date, r.balance]),
    [
      ['2025-10-13', 0],
      ['2025-10-14', 10000],
      ['2025-10-28', 6587],
      ['2025-12-16', 2587.03],
    ]
  )
  assert.equal(rows[0].source, 'derived:fidelity_account_opening')
})

test('a first row whose balance is not its own amount opens nothing, and a pending balance is not a figure', () => {
  const rows = cashRows({
    'fidelity-transactions-20260101-20260811.csv': file(
      row('08/11/2026', 'TRANSFERRED TO VS Z35-581892-1 (Cash)', '-1.33', 'Processing'),
      row('01/02/2026', 'Electronic Funds Transfer Received (Cash)', '30000', '32587.03')
    ),
  })
  // The account was already holding 2,587.03 before the first row, so the cash before it is not zero.
  assert.deepEqual(
    rows.map((r) => [r.date, r.balance]),
    [['2026-01-02', 32587.03]]
  )
})
