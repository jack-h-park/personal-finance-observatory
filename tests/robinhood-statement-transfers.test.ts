// A Robinhood statement prints each transfer from checking or savings under the account that
// received it, which neither the transaction CSV nor the bank export does. The extractor reads
// those lines and the cash series counts them, so the gap they leave between two statements closes.
// Every figure below is invented.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { anchoredCashSeries } from '../scripts/anchored-cash.mjs'
import { PYTHON_BIN } from '../scripts/python-bin.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const PY = PYTHON_BIN

function parse(lines: string[]) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-transfer-'))
  const program = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('extract', 'scripts/extract-us-pdf-evidence.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps([m.robinhood_bank_transfer(l) for l in json.loads(sys.argv[1])]))
`
  const env = { ...process.env, STOCK_DATA_DIR: scratch, STOCK_US_PDF_EVIDENCE_PATH: path.join(scratch, 'out.json') }
  try {
    // Importing the script runs it and prints a "Wrote ..." line first; the result is the last line.
    const out = execFileSync(PY, ['-c', program, JSON.stringify(lines)], { cwd: ROOT, env, encoding: 'utf8' }).trim().split('\n')
    return JSON.parse(out[out.length - 1]) as ([string, number, string] | null)[]
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}

test('a transfer from checking or savings is read with its date and sign', () => {
  const [cash, margin, savings, out] = parse([
    'Transfer from Checking to Brokerage Cash XENT_CM 10/06/2026 $3,000.00',
    'Transfer from Checking to Brokerage Margin XENT_CM 06/09/2026 $2,000.00',
    'Transfer from Savings to Brokerage Cash XENT_CM 04/07/2026 $1,250.50',
    'Transfer from Brokerage Cash to Checking XENT_CM 04/08/2026 $100.00',
  ])
  assert.deepEqual(cash, ['2026-10-06', 3000, 'checking'])
  assert.deepEqual(margin, ['2026-06-09', 2000, 'checking'])
  assert.deepEqual(savings, ['2026-04-07', 1250.5, 'savings'])
  assert.deepEqual(out, ['2026-04-08', -100, 'checking'])
})

test('a transfer between two brokerage accounts and other lines are not bank transfers', () => {
  const rows = parse([
    'Transfer from Brokerage to Brokerage Cash ITRF 10/21/2026 $10,000.00',
    'Brokerage Cash Balance $3,861.61 2.64%',
    '',
  ])
  assert.deepEqual(rows, [null, null, null])
})

test('counting the transfer closes the gap between two statements', () => {
  const statements = [
    { date: '2026-09-30', balance: 1000 },
    { date: '2026-10-31', balance: 4200 },
  ]
  const flows = [{ date: '2026-10-10', settle: '2026-10-10', amount: -300 }]
  const without = anchoredCashSeries({ statements, snapshot: null, flows })
  assert.equal(without.segments[0].residual, 3500)
  const withTransfer = anchoredCashSeries({ statements, snapshot: null, flows: [...flows, { date: '2026-10-06', settle: '2026-10-06', amount: 3500 }] })
  assert.equal(withTransfer.segments[0].residual, 0)
  assert.deepEqual(withTransfer.negative, [])
})
