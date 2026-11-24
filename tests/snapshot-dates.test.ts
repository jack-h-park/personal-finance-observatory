import assert from 'node:assert/strict'
import test from 'node:test'
import { snapshotDates } from '../scripts/snapshot-dates.mjs'

test('month-ends before the window, weekdays inside it', () => {
  const dates: string[] = snapshotDates('2024-01-15', '2026-11-23')
  assert.ok(dates.includes('2024-01-31'))
  assert.ok(dates.includes('2025-06-30')) // month-end before the window
  assert.ok(!dates.includes('2025-06-27')) // weekday before the window
  assert.ok(dates.includes('2025-11-24')) // Monday, first weekday in the window
  assert.ok(dates.includes('2026-11-20')) // Friday
  assert.ok(!dates.includes('2026-11-21')) // Saturday
  assert.ok(dates.includes('2026-02-28')) // Saturday month-end is still written
  assert.ok(!dates.includes('2026-11-23')) // current date belongs to the ingest
  assert.deepEqual(dates, [...new Set(dates)].sort())
})

test('the window never starts before the first lot', () => {
  assert.equal(snapshotDates('2026-11-18', '2026-11-23')[0], '2026-11-18')
})
