import assert from 'node:assert/strict'
import test from 'node:test'
import { householdTransitSeries } from '../scripts/household-transit.mjs'

// Own dollars that pass through a household member's account and come back days later
// (scripts/household-transit.mjs). Every figure below is invented.

const ev = (date: string, time: string, direction: 'IN' | 'OUT', usd_amount: number, note: string) => ({ date, time, direction, usd_amount, note })

test('a declared send is held until the holder sends it back, and a month-end inside the round trip sees it', () => {
  const points = householdTransitSeries({
    moves: [{ date: '2025-10-30', usdAmount: 76_000 }],
    match: ['Holder'],
    events: [
      ev('2025-10-30', '11:42:00', 'OUT', 22_000, 'Holder mobile banking'),
      ev('2025-10-30', '14:00:00', 'IN', 35_000, 'Holder internet banking'),
      ev('2025-11-01', '13:23:00', 'IN', 34_000, 'Holder mobile banking'),
      ev('2025-11-10', '05:07:00', 'IN', 29_000, 'Holder mobile banking'),
      // Not the holder: never touches the account.
      ev('2025-11-02', '10:00:00', 'IN', 5_000, 'Someone else'),
    ],
  })
  assert.deepEqual(points, [
    { date: '2025-10-30', balance: 63_000 },
    { date: '2025-11-01', balance: 29_000 },
    { date: '2025-11-10', balance: 0 },
  ])
})

test('a balance never goes below zero: what the holder sends beyond what was sent there is money entering', () => {
  const points = householdTransitSeries({
    moves: [],
    match: ['Holder'],
    events: [ev('2026-01-05', '09:00:00', 'IN', 1_000, 'Holder'), ev('2026-01-06', '09:00:00', 'OUT', 400, 'Holder')],
  })
  assert.deepEqual(points, [{ date: '2026-01-06', balance: 400 }])
})

test('nothing declared and nobody named means no series', () => {
  assert.deepEqual(householdTransitSeries({ events: [ev('2026-01-05', '09:00:00', 'IN', 1_000, 'Holder')] }), [])
})
