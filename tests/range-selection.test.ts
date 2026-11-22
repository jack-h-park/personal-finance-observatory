import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { keepsSelection, orderedDragRange, rangeHref, resolveRangeSelection, trendRangeCovering } from '@/lib/range-selection'
import { TREND_RANGES } from '@/lib/trend-ranges'

const dates = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']
const range = (key: string) => TREND_RANGES.find((r) => r.key === key)!

test('reversed params are swapped', () => {
  assert.deepEqual(resolveRangeSelection('2026-04-30', '2026-02-28', dates), { from: '2026-02-28', to: '2026-04-30' })
})

test('invalid dates give null', () => {
  assert.equal(resolveRangeSelection('nope', '2026-02-28', dates), null)
  assert.equal(resolveRangeSelection('2026-02-28', undefined, dates), null)
  assert.equal(resolveRangeSelection('2026-02-30', '2026-03-31', dates), null)
  assert.equal(resolveRangeSelection('2026-02-28', '2026-03-31', []), null)
})

test('equal after snapping gives null', () => {
  assert.equal(resolveRangeSelection('2026-02-10', '2026-02-27', dates), null)
  assert.equal(resolveRangeSelection('2026-03-31', '2026-03-31', dates), null)
})

test('snaps to the latest date on or before', () => {
  assert.deepEqual(resolveRangeSelection('2026-02-15', '2026-04-15', dates), { from: '2026-01-31', to: '2026-03-31' })
  assert.deepEqual(resolveRangeSelection('2025-12-01', '2026-02-28', dates), { from: '2026-01-31', to: '2026-02-28' })
  assert.deepEqual(resolveRangeSelection(['2026-02-28'], ['2026-04-30'], dates), { from: '2026-02-28', to: '2026-04-30' })
})

test('widens the trend window to reach the selection', () => {
  assert.equal(trendRangeCovering(range('365'), '2025-05-22', '2026-11-22').key, '730')
  assert.equal(trendRangeCovering(range('365'), '2026-03-01', '2026-11-22').key, '365')
  assert.equal(trendRangeCovering(range('30'), '2026-09-01', '2026-11-22').key, '90')
  assert.equal(trendRangeCovering(range('730'), '2010-01-01', '2026-11-22').key, 'all')
})

test('a trend link keeps the selection only when its window reaches the start', () => {
  const today = '2026-11-22'
  assert.equal(keepsSelection(range('365'), '2026-03-01', today), true)
  assert.equal(keepsSelection(range('30'), '2026-09-01', today), false)
  assert.equal(keepsSelection(range('ytd'), '2026-02-28', today), true)
  assert.equal(keepsSelection(range('ytd'), '2025-12-30', today), false)
  assert.equal(keepsSelection(range('all'), '2010-01-01', today), true)
})

test('rangeHref keeps other params', () => {
  const href = rangeHref('/net-worth?trend=365&view=share&from=2020-01-01', '2026-02-28', '2026-04-30')
  const url = new URL(href, 'http://x')
  assert.equal(url.pathname, '/net-worth')
  assert.equal(url.searchParams.get('trend'), '365')
  assert.equal(url.searchParams.get('view'), 'share')
  assert.equal(url.searchParams.get('from'), '2026-02-28')
  assert.equal(url.searchParams.get('to'), '2026-04-30')
  assert.equal(url.searchParams.getAll('from').length, 1)
})

test('orderedDragRange orders a drag either way and drops an empty one', () => {
  assert.deepEqual(orderedDragRange('2026-02-28', '2026-04-30'), ['2026-02-28', '2026-04-30'])
  assert.deepEqual(orderedDragRange('2026-04-30', '2026-02-28'), ['2026-02-28', '2026-04-30'])
  assert.equal(orderedDragRange('2026-02-28', '2026-02-28'), null)
  assert.equal(orderedDragRange(undefined, '2026-02-28'), null)
  assert.equal(orderedDragRange('2026-02-28', null), null)
})
