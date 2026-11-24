import assert from 'node:assert/strict'
import test from 'node:test'
import { holdingsChartDates, lastPerMonth } from '../lib/snapshot-density'

const dates = ['2025-10-31', '2025-11-28', '2025-11-30', '2026-11-19', '2026-11-20', '2026-11-23']

test('lastPerMonth keeps one date per month, today included', () => {
  assert.deepEqual(lastPerMonth(dates), ['2025-10-31', '2025-11-30', '2026-11-23'])
})

test('lastPerMonth sorts and de-duplicates its input', () => {
  assert.deepEqual(lastPerMonth(['2026-11-23', '2026-10-31', '2026-10-31', '2026-10-30']), ['2026-10-31', '2026-11-23'])
})

test('short ranges keep every date', () => {
  assert.deepEqual(holdingsChartDates(dates, 365), dates)
})

test('long ranges keep month-ends and the whole current month', () => {
  assert.deepEqual(holdingsChartDates(dates, 730), ['2025-10-31', '2025-11-30', '2026-11-19', '2026-11-20', '2026-11-23'])
})

test('no dates gives no dates', () => {
  assert.deepEqual(lastPerMonth([]), [])
  assert.deepEqual(holdingsChartDates([], 730), [])
})
