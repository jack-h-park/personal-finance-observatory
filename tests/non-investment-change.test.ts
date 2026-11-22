import assert from 'node:assert/strict'
import test from 'node:test'
import { flaggedMonths, nonInvestmentMonths, type MonthEnd } from '../lib/non-investment-change'

// Every figure below is invented, in won.

const M = 1_000_000
/** Month-ends whose totals move by `deltas` (the first month is the base), with no pensions. */
function months(deltas: number[], base = 1_000 * M): MonthEnd[] {
  let total = base
  return deltas.map((delta, index) => {
    total += delta
    const month = `2026-${String(index + 1).padStart(2, '0')}`
    return { month, date: `${month}-28`, total, pensions: null }
  })
}
/** An investment result of zero every month: snapshots whose unrealized gain never moves. */
const flat = (rows: MonthEnd[]) => rows.map((row) => ({ date: row.date, unrealized: 0, realized: 0 }))

test('the value is the change in total assets less the investment result, and pensions are left out', () => {
  const rows = months([0, 50 * M, 20 * M])
  rows[2].pensions = 10 * M
  rows[1].pensions = 0
  const investment = rows.map((row, index) => ({ date: row.date, unrealized: [0, 30 * M, 35 * M][index], realized: 0 }))
  const result = nonInvestmentMonths(rows, investment)
  assert.equal(result[0].value, null)
  assert.equal(result[1].value, 50 * M - 30 * M)
  // 20M of change, 10M of it a pension record, 5M of it investing: 5M left.
  assert.equal(result[2].value, 20 * M - 10 * M - 5 * M)
})

test('a month with no investment figure is unavailable, not zero', () => {
  const rows = months([0, 40 * M])
  const result = nonInvestmentMonths(rows, [])
  assert.equal(result[1].value, null)
  assert.equal(result[1].flag, null)
})

test('one large month is flagged for a check, and ordinary months are not', () => {
  const rows = months([0, 8 * M, -6 * M, 45 * M, 5 * M])
  const result = nonInvestmentMonths(rows, flat(rows))
  assert.deepEqual(result.map((r) => r.flag), [null, null, null, 'check', null])
})

test('two neighbours of opposite sign that nearly cancel are a pair, and each names the other', () => {
  const rows = months([0, 5 * M, 40 * M, -38 * M, 4 * M])
  const result = nonInvestmentMonths(rows, flat(rows))
  assert.deepEqual(result.map((r) => r.flag), [null, null, 'pair', 'pair', null])
  assert.deepEqual(result[2].partner, { month: '2026-04', value: -38 * M })
  assert.deepEqual(result[3].partner, { month: '2026-03', value: 40 * M })
})

test('opposite neighbours that do not cancel are not a pair', () => {
  const rows = months([0, 40 * M, -16 * M])
  const result = nonInvestmentMonths(rows, flat(rows))
  assert.deepEqual(result.map((r) => r.flag), [null, 'check', null])
})

test('three months in a row of one sign at the watch size are a streak', () => {
  const rows = months([0, -20 * M, -18 * M, -25 * M, 3 * M])
  const result = nonInvestmentMonths(rows, flat(rows))
  assert.deepEqual(result.map((r) => r.flag), [null, 'streak', 'streak', 'streak', null])
  // Two in a row is not enough.
  const two = months([0, -20 * M, -18 * M, 3 * M])
  assert.deepEqual(nonInvestmentMonths(two, flat(two)).map((r) => r.flag), [null, null, null, null])
})

test('the flagged months among the latest few', () => {
  const rows = months([0, 45 * M, 2 * M, 3 * M, 50 * M])
  const result = nonInvestmentMonths(rows, flat(rows))
  assert.deepEqual(flaggedMonths(result, 2).map((r) => r.month), ['2026-05'])
  assert.deepEqual(flaggedMonths(result, 12).map((r) => r.month), ['2026-02', '2026-05'])
})
