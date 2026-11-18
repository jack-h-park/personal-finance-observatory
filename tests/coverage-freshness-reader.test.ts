import assert from 'node:assert/strict'
import test from 'node:test'
import { readCoverageFreshness } from '../lib/application/coverage-freshness'

// Invented metadata only; this is not a classifier or a date-based fallback.
test('reads every explicit existing freshness status independently of combined actions', () => {
  for (const state of ['current', 'due_soon', 'action_needed', 'missing', 'unconfirmed'] as const) {
    const row = Object.freeze({ status: 'action_needed', freshnessStatus: state, staleWithHistoryGap: false, historyGap: Object.freeze({ from: '2024-02-01', to: '2024-02-09' }) })
    const before = structuredClone(row)
    assert.equal(readCoverageFreshness(row), state)
    assert.deepEqual(row, before)
  }
})

test('older producers never gain inferred freshness from status, dates or partial flags', () => {
  for (const row of [
    {}, { status: 'current' }, { status: 'due_soon', latestDate: '2099-12-31' },
    { status: 'action_needed', staleWithHistoryGap: false }, { status: 'action_needed', staleWithHistoryGap: true },
    { status: 'action_needed', historyGap: { from: '2024-02-01', to: '2024-02-09' } },
  ]) assert.equal(readCoverageFreshness(row), null)
})

test('invalid, unsupported and inherited freshness metadata is unavailable', () => {
  for (const value of [null, undefined, [], 'current', 1, true, ...[null, undefined, '', 'fresh', 'CURRENT', 0, false, {}, []].map(freshnessStatus => ({ freshnessStatus }))]) {
    assert.equal(readCoverageFreshness(value), null)
  }
  assert.equal(readCoverageFreshness(Object.create({ freshnessStatus: 'current' })), null)
})


test('accessor metadata is not evaluated as a recorded JSON field', () => {
  let called = false
  const row = Object.defineProperty({}, 'freshnessStatus', { get() { called = true; return 'current' } })
  assert.equal(readCoverageFreshness(row), null); assert.equal(called, false)
})
