import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSpending, compareSpendingPeriods, type SpendingViewRow } from '../lib/domain/spending-view'

let seq = 0
const row = (activityDate: string, amountMinor: number, kind: SpendingViewRow['kind'] = 'purchase'): SpendingViewRow => ({
  id: `c${++seq}`, accountId: 'a', postedDate: activityDate, activityDate, currency: 'KRW', amountMinor, kind, description: 'x',
})

test('the monthly average divides the combined net by the calendar months of the period', () => {
  const rows = [row('2026-07-02', -3000), row('2026-03-02', -1200), row('2026-08-01', -9999)]
  const result = compareSpendingPeriods(rows, { today: '2026-08-10', period: 12 })
  const net = analyzeSpending(rows, { today: '2026-08-10', period: 12 }).combined.net!
  assert.equal(result.monthlyAverage, net / 12)
})

test('a rolling period compares completed months with the same months a year before', () => {
  const rows = [
    row('2026-07-15', -3000),  // current, compared
    row('2026-08-01', -9999),  // month in progress: left out of the comparison
    row('2025-07-20', -1000),  // previous window
    row('2025-08-20', -500),   // in neither compared window
  ]
  const result = compareSpendingPeriods(rows, { today: '2026-08-10', period: 12 })
  assert.equal(result.current, 3000)
  assert.equal(result.previous, 1000)
  assert.equal(result.change, 2)
  assert.equal(result.comparedThrough, '2026-07')
})

test('24 months compare with the 24 before', () => {
  const rows = [row('2025-01-15', -400), row('2024-10-15', -999), row('2023-01-15', -200), row('2024-01-15', -77)]
  const result = compareSpendingPeriods(rows, { today: '2026-08-10', period: 24 })
  assert.equal(result.current, 400 + 999)
  assert.equal(result.previous, 200 + 77) // 2022-09..2024-07 holds both
})

test('last year is whole and compares with the year before it', () => {
  const rows = [row('2025-12-31', -600), row('2024-06-01', -300), row('2026-01-05', -50)]
  const result = compareSpendingPeriods(rows, { today: '2026-08-10', period: 'lastYear' })
  assert.equal(result.current, 600)
  assert.equal(result.previous, 300)
  assert.equal(result.change, 1)
  assert.equal(result.comparedThrough, '2025-12')
})

test('this year in January has no completed month to compare', () => {
  const result = compareSpendingPeriods([row('2027-01-02', -100), row('2026-01-02', -100)], { today: '2027-01-10', period: 'ytd' })
  assert.equal(result.change, null)
  assert.equal(result.previous, null)
  assert.equal(result.comparedThrough, null)
  assert.equal(result.monthlyAverage, 100)
})

test('nothing, or less than nothing, before reads as no change rather than a division by zero', () => {
  assert.equal(compareSpendingPeriods([row('2026-07-15', -3000)], { today: '2026-08-10', period: 12 }).change, null)
  const refundHeavy = [row('2026-07-15', -3000), row('2025-07-15', -100), row('2025-07-16', 400, 'refund')]
  assert.equal(compareSpendingPeriods(refundHeavy, { today: '2026-08-10', period: 12 }).change, null)
})

test('no activity at all leaves every figure empty', () => {
  const result = compareSpendingPeriods([], { today: '2026-08-10', period: 12 })
  assert.deepEqual(result, { monthlyAverage: null, current: null, previous: null, change: null, comparedThrough: '2026-07' })
})
