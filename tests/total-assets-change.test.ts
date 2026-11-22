import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { investmentResult, isoDaysBefore, monthEndBefore, previousYearEnd, totalAssetsChange } from '@/lib/total-assets-change'
import type { TotalAssetsPoint } from '@/lib/net-worth'

const point = (date: string, total: number, extra: Partial<TotalAssetsPoint> = {}): TotalAssetsPoint => ({
  date,
  stocks: total,
  crypto: null,
  cash: null,
  pensions: null,
  gold: null,
  total,
  ...extra,
})

test('measures from the latest point on or before the base date', () => {
  const points = [point('2026-09-01', 100), point('2026-10-15', 120), point('2026-10-25', 150), point('2026-11-20', 180)]
  const change = totalAssetsChange(points, '2026-10-21')
  assert.deepEqual(change, { baseDate: '2026-10-15', change: 60, pct: 50, addedClasses: [], byClass: [{ key: 'stocks', change: 60 }] })
})

test('a change with no point that old is unavailable, not zero', () => {
  assert.equal(totalAssetsChange([point('2026-11-01', 100), point('2026-11-20', 110)], '2026-10-21'), null)
  assert.equal(totalAssetsChange([], '2026-10-21'), null)
  assert.equal(totalAssetsChange([point('2026-10-01', 100)], '2026-10-21'), null)
})

test('names classes that arrived after the base date', () => {
  const points = [point('2026-01-01', 100), point('2026-11-20', 130, { gold: 30, stocks: 100 })]
  assert.deepEqual(totalAssetsChange(points, '2026-01-01')?.addedClasses, ['gold'])
})

test('a zero base total has no percentage', () => {
  assert.equal(totalAssetsChange([point('2026-01-01', 0), point('2026-11-20', 50)], '2026-01-01')?.pct, null)
})

test('date helpers', () => {
  assert.equal(isoDaysBefore('2026-03-01', 30), '2026-01-30')
  assert.equal(previousYearEnd('2026-11-20'), '2025-12-31')
  assert.equal(monthEndBefore('2026-11-22', 1), '2026-10-31')
  assert.equal(monthEndBefore('2026-11-22', 3), '2026-08-31')
  assert.equal(monthEndBefore('2026-11-22', 12), '2025-11-30')
  assert.equal(monthEndBefore('2026-03-31', 1), '2026-02-28')
  assert.equal(monthEndBefore('2026-01-05', 1), '2025-12-31')
})

test('a month-end base uses that month end, not the one before it', () => {
  const points = [point('2026-09-30', 100), point('2026-10-31', 120), point('2026-11-22', 130)]
  assert.equal(totalAssetsChange(points, monthEndBefore('2026-11-22', 1))?.baseDate, '2026-10-31')
})

test('splits the change by class, largest move first, skipping classes that did not move', () => {
  const points = [
    point('2026-10-31', 300, { stocks: 200, cash: 100, gold: 50, total: 350 }),
    point('2026-11-22', 290, { stocks: 150, cash: 130, gold: 50, crypto: 10, total: 340 }),
  ]
  assert.deepEqual(totalAssetsChange(points, '2026-10-31')?.byClass, [
    { key: 'stocks', change: -50 },
    { key: 'cash', change: 30 },
    { key: 'crypto', change: 10 },
  ])
})

test('investmentResult adds the unrealized change and the gain realized in between', () => {
  const points = [
    { date: '2025-11-30', unrealized: 108, realized: 54 },
    { date: '2026-06-30', unrealized: 800, realized: 60 },
    { date: '2026-11-21', unrealized: 99, realized: 71 },
  ]
  assert.deepEqual(investmentResult(points, '2025-11-30'), { unrealized: -9, realized: 17, total: 8 })
  // The base is the latest snapshot on or before the date, as for the total-assets change.
  assert.deepEqual(investmentResult(points, '2026-07-15'), { unrealized: -701, realized: 11, total: -690 })
})

test('investmentResult is unavailable without a base or an unrealized figure', () => {
  assert.equal(investmentResult([{ date: '2026-11-21', unrealized: 1, realized: 0 }], '2025-11-30'), null)
  assert.equal(investmentResult([{ date: '2025-11-30', unrealized: null, realized: 0 }, { date: '2026-11-21', unrealized: 1, realized: 0 }], '2025-11-30'), null)
  assert.deepEqual(investmentResult([{ date: '2025-11-30', unrealized: 5, realized: null }, { date: '2026-11-21', unrealized: 7, realized: 3 }], '2025-11-30'), { unrealized: 2, realized: 3, total: 5 })
})
