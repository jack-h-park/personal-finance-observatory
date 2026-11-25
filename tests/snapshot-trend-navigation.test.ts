import assert from 'node:assert/strict'
import test from 'node:test'
import { holdingsSnapshotSelection, resolveSnapshotTrendSelection, snapshotTrendDetailsHref } from '../lib/snapshot-trend-navigation'

test('an overview link takes the snapshot selection to the Holdings chart', () => {
  const selection = resolveSnapshotTrendSelection({
    trend: '365', scope: 'GOLD', metric: 'global_base_unrealized_gl', view: 'single', realizedAxis: 'shared',
  })
  const url = new URL(snapshotTrendDetailsHref(selection), 'https://example.test')
  assert.equal(url.pathname, '/holdings')
  assert.equal(url.hash, '#snapshot-trend')
  assert.equal(url.searchParams.has('view'), false)
  assert.equal(url.searchParams.has('trend'), false)
  assert.equal(selection.metric, 'unrealized_gl')
  assert.deepEqual(holdingsSnapshotSelection(Object.fromEntries(url.searchParams)), selection)
})

test('the Holdings snapshot has its own range and mode apart from tabs and table filters', () => {
  assert.deepEqual(
    holdingsSnapshotSelection({ view: 'weights', trend: '180', market: 'US', snapshotScope: 'KR' }),
    { trend: '730', scope: 'KR', metric: 'market_value', view: 'combined', realizedAxis: 'right' },
  )
})
