import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

// An own account no statement covers, rebuilt from the rows of the statement that fed it
// (scripts/extract-bank-statements.py, derive_accounts). Every figure below is invented.

const ROOT = path.resolve(import.meta.dirname, '..')
const PY = process.env.STOCK_PYTHON_BIN || 'python3'

type Row = { date: string; seq: number; amount: number; description: string }

function derive(entry: Record<string, unknown>, rows: Row[]) {
  const program = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('extract', 'scripts/extract-bank-statements.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
payload = json.loads(sys.argv[1])
findings, notes = [], []
out = m.derive_accounts({'derivedAccounts': [payload['entry']]}, [('chase', 'Example checking', 'USD', payload['rows'])], findings, notes)
print(json.dumps({'accounts': out, 'findings': findings}))
`
  return JSON.parse(execFileSync(PY, ['-c', program, JSON.stringify({ entry, rows })], { cwd: ROOT, encoding: 'utf8' })) as {
    accounts: { account: string; balances: { date: string; balance: number }[] }[]
    findings: string[]
  }
}

const entry = { account: 'Example savings (derived)', from: 'Example checking', match: 'SAV ...1234', closedOn: '2026-03-01' }
const row = (date: string, seq: number, amount: number, description: string): Row => ({ date, seq, amount, description })

test('the balance is the running sum of the transfers, started from what makes the closing day zero', () => {
  const { accounts, findings } = derive(entry, [
    row('2025-05-16', 0, -50, 'GROCERY'),
    // 3,000 in, then 500 out (and more than one space in the phrase, as the export prints it).
    row('2025-06-01', 1, -3000, 'Online Transfer to  SAV ...1234 transaction#: 1'),
    row('2025-09-01', 2, 500, 'Online Transfer from SAV ...1234 transaction#: 2'),
    // The closing withdrawal takes everything, interest included.
    row('2026-03-01', 3, 2600, 'Online Transfer from SAV ...1234 transaction#: 3'),
    row('2026-03-05', 4, -20, 'COFFEE'),
  ])
  assert.deepEqual(findings, [])
  // Opening = 500 + 2,600 - 3,000 = 100, carried back to the day before the checking statement begins.
  assert.deepEqual(accounts[0].balances, [
    { date: '2025-05-15', balance: 100 },
    { date: '2025-06-01', balance: 3100 },
    { date: '2025-09-01', balance: 2600 },
    { date: '2026-03-01', balance: 0 },
  ])
})

test('rows that take out more than they put in cannot be a closed account, and a phrase no row names derives nothing', () => {
  const lopsided = derive(entry, [row('2025-06-01', 0, -3000, 'to SAV ...1234'), row('2025-07-01', 1, 100, 'from SAV ...1234')])
  assert.equal(lopsided.accounts.length, 0)
  assert.match(lopsided.findings[0], /cannot be closed at zero/)
  const none = derive(entry, [row('2025-06-01', 0, -3000, 'GROCERY')])
  assert.equal(none.accounts.length, 0)
  assert.match(none.findings[0], /no row of Example checking names/)
})
