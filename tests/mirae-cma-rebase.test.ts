// A 미래에셋 CMA certificate walks balances from its own first row, so it is short by
// the 발행어음 principal held before its period. A later certificate that overlaps an
// earlier one is put back on the earlier one's scale by the gap on the first shared row.
// Every figure below is invented.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

const ROOT = path.resolve(import.meta.dirname, '..')
const PY = process.env.STOCK_PYTHON_BIN || 'python3'

function rebase(groups: unknown) {
  const program = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('extract', 'scripts/extract-bank-statements.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
groups = json.loads(sys.argv[1])
merged = m.merge_txns(m.rebase_overlapping_balances(groups))
print(json.dumps(m.end_of_day(merged)))
`
  return JSON.parse(execFileSync(PY, ['-c', program, JSON.stringify(groups)], { cwd: ROOT, encoding: 'utf8' })) as { date: string; balance: number }[]
}

const row = (seq: number, date: string, description: string, amount: number, balance: number | null) => ({ seq, date, description, amount, balance })

test('a later certificate is shifted by the gap on its first shared row, so its new rows continue the earlier balance', () => {
  const earlier = [row(0, '2026-01-05', 'deposit', 500, 1500), row(1, '2026-01-07', 'wire out', -200, 1300)]
  // The later file starts at the wire, so it knows nothing of the 1,500 before it.
  const later = [row(0, '2026-01-07', 'wire out', -200, -200), row(1, '2026-01-09', 'deposit', 50, -150)]
  const days = rebase([earlier, later])
  assert.deepEqual(days.map((d) => d.balance), [1500, 1300, 1350])
})

test('a later certificate that shares no row with the earlier one is left alone', () => {
  const earlier = [row(0, '2026-01-05', 'deposit', 500, 1500)]
  const later = [row(0, '2026-02-01', 'deposit', 50, 50)]
  assert.deepEqual(rebase([earlier, later]).map((d) => d.balance), [1500, 50])
})

test('two certificates already on one scale are not shifted', () => {
  const earlier = [row(0, '2026-01-05', 'deposit', 500, 1500), row(1, '2026-01-07', 'wire out', -200, 1300)]
  const later = [row(0, '2026-01-07', 'wire out', -200, 1300), row(1, '2026-01-09', 'deposit', 50, 1350)]
  assert.deepEqual(rebase([earlier, later]).map((d) => d.balance), [1500, 1300, 1350])
})
