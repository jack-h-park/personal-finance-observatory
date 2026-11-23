import assert from 'node:assert/strict'
import test from 'node:test'
import { overviewFlow, overviewHref, resolveFlowRange, spendingHref } from '../lib/overview-flow'
import type { SpendingWindow } from '../lib/domain/spending-window'

const window = { start: '2025-12', end: '2026-11', months: 12 }
const spent: SpendingWindow = {
  native: { USD: { netMinor: 1000, observedMonths: 3 }, KRW: { netMinor: 5000, observedMonths: 2 } },
  months: 12,
  converted: 19000,
  undatedCount: 0,
}
const inflow = { rangeTotal: 42000, hasRecords: true }

test('resolveFlowRange defaults to the last 12 months', () => {
  assert.equal(resolveFlowRange(undefined), '12m')
  assert.equal(resolveFlowRange('ytd'), 'ytd')
  assert.equal(resolveFlowRange('lastYear'), 'lastYear')
  assert.equal(resolveFlowRange('24m'), '24m')
  assert.equal(resolveFlowRange('all'), '12m')
  assert.equal(resolveFlowRange('garbage'), '12m')
})

test('available spending', () => {
  const flow = overviewFlow({ range: '12m', window, inflow, spending: { status: 'available', window: spent } })
  assert.equal(flow.spendingState, 'available')
  assert.equal(flow.spending, spent)
  assert.equal(flow.income, 42000)
  assert.deepEqual(flow.window, { start: '2025-12', end: '2026-11', months: 12 })
})

test('available but no activity in the window', () => {
  const empty: SpendingWindow = { ...spent, native: { USD: { netMinor: null, observedMonths: 0 }, KRW: { netMinor: null, observedMonths: 0 } }, converted: null }
  const flow = overviewFlow({ range: 'lastYear', window, inflow, spending: { status: 'available', window: empty } })
  assert.equal(flow.spendingState, 'noActivity')
})

test('no snapshot reads as not published, not zero', () => {
  const flow = overviewFlow({ range: '12m', window, inflow, spending: { status: 'disabled' } })
  assert.equal(flow.spending, null)
  assert.equal(flow.spendingState, 'notPublished')
  assert.equal(flow.income, 42000)
})

test('unreadable snapshot', () => {
  const flow = overviewFlow({ range: '12m', window, inflow, spending: { status: 'unavailable' } })
  assert.equal(flow.spending, null)
  assert.equal(flow.spendingState, 'unreadable')
})

test('no inflow records', () => {
  const flow = overviewFlow({ range: '12m', window, inflow: { rangeTotal: 0, hasRecords: false }, spending: { status: 'disabled' } })
  assert.equal(flow.income, null)
})

test('spendingHref picks the smallest spending period that holds the window', () => {
  assert.equal(spendingHref('12m'), '/spending?period=12')
  assert.equal(spendingHref('ytd'), '/spending?period=12')
  assert.equal(spendingHref('24m'), '/spending?period=24')
  assert.equal(spendingHref('lastYear'), '/spending?period=24')
})

test('overviewHref carries every control, so a trend chip keeps the flow period and a flow chip keeps the trend', () => {
  const state = { trend: '1y', scope: 'global', metric: 'market_value', view: 'combined', flow: 'ytd' as const }
  assert.equal(overviewHref(state), '/?trend=1y&scope=global&metric=market_value&view=combined&flow=ytd')
  assert.equal(overviewHref({ ...state, trend: '3m' }), '/?trend=3m&scope=global&metric=market_value&view=combined&flow=ytd')
  assert.equal(overviewHref({ ...state, flow: 'lastYear' }), '/?trend=1y&scope=global&metric=market_value&view=combined&flow=lastYear')
})
