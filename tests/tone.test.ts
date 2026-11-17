import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  BRIEFING_SEVERITY,
  COVERAGE_SEVERITY,
  FRESHNESS_SEVERITY,
  INVENTORY_STATUS_TONE,
  POSITION_EVENT_TONE,
  PRIORITY_SEVERITY,
  RECONCILIATION_STATUS_TONE,
  RETENTION_TONE,
  RUN_SEVERITY,
  SEVERITIES,
  TRADE_SIDE_TONE,
  TRANSACTION_TYPE_TONE,
  WRAPPER_TREATMENT_TONE,
  bucketTone,
  categoryTone,
  priorityTone,
  reconciliationStatusKey,
  severityOf,
  severityTone,
  statusTone,
} from '@/lib/tone'

test('severityTone maps the five steps to the five tones in order', () => {
  assert.deepEqual(SEVERITIES, ['quiet', 'info', 'ok', 'attention', 'problem'])
  assert.deepEqual(SEVERITIES.map(severityTone), ['neutral', 'info', 'success', 'warning', 'danger'])
})

test('each severity table maps every documented value', () => {
  assert.deepEqual(PRIORITY_SEVERITY, { high: 'problem', medium: 'attention', low: 'info' })
  assert.deepEqual(BRIEFING_SEVERITY, { 'act-now': 'problem', 'this-week': 'attention', fyi: 'quiet' })
  assert.deepEqual(FRESHNESS_SEVERITY, { fresh: 'ok', stale: 'attention', drift: 'attention', missing: 'problem' })
  assert.deepEqual(RUN_SEVERITY, { success: 'ok', degraded: 'attention', running: 'info', failed: 'problem' })
  assert.deepEqual(COVERAGE_SEVERITY, {
    current: 'ok',
    due_soon: 'attention',
    unconfirmed: 'attention',
    action_needed: 'problem',
    missing: 'problem',
  })
})

test('a severity lookup falls back to quiet, and never reads the prototype', () => {
  assert.equal(severityOf(RUN_SEVERITY, 'nonsense'), 'quiet')
  assert.equal(severityOf(RUN_SEVERITY, 'constructor'), 'quiet')
  assert.equal(severityOf(RUN_SEVERITY, null), 'quiet')
  assert.equal(severityOf(PRIORITY_SEVERITY, undefined, 'info'), 'info')
})

test('statusTone reads a table and keeps every colour the replaced rules drew', () => {
  // Was app/health statusTone: success / degraded / running, anything else danger.
  assert.equal(statusTone(RUN_SEVERITY, 'success'), 'success')
  assert.equal(statusTone(RUN_SEVERITY, 'degraded'), 'warning')
  assert.equal(statusTone(RUN_SEVERITY, 'running'), 'info')
  assert.equal(statusTone(RUN_SEVERITY, 'failed'), 'danger')
  // Unknown run statuses are now quiet rather than danger: the intended change.
  assert.equal(statusTone(RUN_SEVERITY, 'nonsense'), 'neutral')

  // Was app/data-ops coverageTone.
  assert.equal(statusTone(COVERAGE_SEVERITY, 'current'), 'success')
  assert.equal(statusTone(COVERAGE_SEVERITY, 'due_soon'), 'warning')
  assert.equal(statusTone(COVERAGE_SEVERITY, 'unconfirmed'), 'warning')
  assert.equal(statusTone(COVERAGE_SEVERITY, 'action_needed'), 'danger')
  assert.equal(statusTone(COVERAGE_SEVERITY, 'missing'), 'danger')
  assert.equal(statusTone(COVERAGE_SEVERITY, null), 'neutral')

  // Was components/Freshness STATUS_TONE.
  assert.equal(statusTone(FRESHNESS_SEVERITY, 'fresh'), 'success')
  assert.equal(statusTone(FRESHNESS_SEVERITY, 'stale'), 'warning')
  assert.equal(statusTone(FRESHNESS_SEVERITY, 'drift'), 'warning')
  assert.equal(statusTone(FRESHNESS_SEVERITY, 'missing'), 'danger')

  // Was app/daily-briefing PRIORITY_TONE.
  assert.equal(statusTone(BRIEFING_SEVERITY, 'act-now'), 'danger')
  assert.equal(statusTone(BRIEFING_SEVERITY, 'this-week'), 'warning')
  assert.equal(statusTone(BRIEFING_SEVERITY, 'fyi'), 'neutral')
})

test('priorityTone keeps its colours and its info fallback', () => {
  assert.equal(priorityTone('high'), 'danger')
  assert.equal(priorityTone('medium'), 'warning')
  assert.equal(priorityTone('low'), 'info')
  assert.equal(priorityTone(undefined), 'info')
  assert.equal(priorityTone(null), 'info')
  assert.equal(priorityTone('nonsense'), 'info')
})

test('bucketTone reads both spellings of long-term', () => {
  assert.equal(bucketTone('long'), 'success')
  assert.equal(bucketTone('Long-term'), 'success')
  assert.equal(bucketTone('short'), 'warning')
  assert.equal(bucketTone('Short-term'), 'warning')
  assert.equal(bucketTone(null), 'warning')
})

test('categoryTone defaults to neutral and ignores prototype keys', () => {
  assert.equal(categoryTone({ a: 'success' }, 'a'), 'success')
  assert.equal(categoryTone({ a: 'success' }, 'b'), 'neutral')
  assert.equal(categoryTone({ a: 'success' }, null), 'neutral')
  assert.equal(categoryTone({ a: 'success' }, 'toString'), 'neutral')
  assert.equal(categoryTone({ a: 'success' }, 'b', 'info'), 'info')
})

test('TRANSACTION_TYPE_TONE matches the replaced typeTone branch for branch', () => {
  assert.equal(categoryTone(TRANSACTION_TYPE_TONE, 'DIVIDEND', 'info'), 'success')
  assert.equal(categoryTone(TRANSACTION_TYPE_TONE, 'SELL', 'info'), 'warning')
  assert.equal(categoryTone(TRANSACTION_TYPE_TONE, 'BUY', 'info'), 'info')
})

test('POSITION_EVENT_TONE matches the replaced eventTone branch for branch', () => {
  assert.equal(categoryTone(POSITION_EVENT_TONE, 'dividend', 'info'), 'success')
  assert.equal(categoryTone(POSITION_EVENT_TONE, 'sell', 'info'), 'warning')
  assert.equal(categoryTone(POSITION_EVENT_TONE, 'taxLot', 'info'), 'neutral')
  assert.equal(categoryTone(POSITION_EVENT_TONE, 'buy', 'info'), 'info')
})

test('TRADE_SIDE_TONE matches the replaced TRADE_TONE', () => {
  assert.equal(categoryTone(TRADE_SIDE_TONE, 'bought'), 'success')
  assert.equal(categoryTone(TRADE_SIDE_TONE, 'opened'), 'success')
  assert.equal(categoryTone(TRADE_SIDE_TONE, 'sold'), 'danger')
  assert.equal(categoryTone(TRADE_SIDE_TONE, 'closed'), 'danger')
  assert.equal(categoryTone(TRADE_SIDE_TONE, 'split'), 'neutral')
})

test('WRAPPER_TREATMENT_TONE matches the replaced TREATMENT_TONE', () => {
  assert.equal(categoryTone(WRAPPER_TREATMENT_TONE, 'taxable'), 'info')
  assert.equal(categoryTone(WRAPPER_TREATMENT_TONE, 'undecided'), 'warning')
  assert.equal(categoryTone(WRAPPER_TREATMENT_TONE, 'deferred'), 'neutral')
  assert.equal(categoryTone(WRAPPER_TREATMENT_TONE, 'exempt_within_limit'), 'neutral')
  assert.equal(categoryTone(WRAPPER_TREATMENT_TONE, 'other'), 'neutral')
})

test('INVENTORY_STATUS_TONE matches the replaced data-map statusTone', () => {
  assert.equal(categoryTone(INVENTORY_STATUS_TONE, 'used', 'danger'), 'success')
  assert.equal(categoryTone(INVENTORY_STATUS_TONE, 'derived', 'danger'), 'neutral')
  assert.equal(categoryTone(INVENTORY_STATUS_TONE, 'archive', 'danger'), 'neutral')
  assert.equal(categoryTone(INVENTORY_STATUS_TONE, 'unused', 'danger'), 'info')
  assert.equal(categoryTone(INVENTORY_STATUS_TONE, 'drift', 'danger'), 'warning')
  assert.equal(categoryTone(INVENTORY_STATUS_TONE, 'missing', 'danger'), 'danger')
})

test('RETENTION_TONE matches the replaced retentionTone', () => {
  assert.equal(categoryTone(RETENTION_TONE, 'active', 'warning'), 'success')
  assert.equal(categoryTone(RETENTION_TONE, 'fallback', 'warning'), 'info')
  assert.equal(categoryTone(RETENTION_TONE, 'derived', 'warning'), 'neutral')
  assert.equal(categoryTone(RETENTION_TONE, 'archive', 'warning'), 'neutral')
  assert.equal(categoryTone(RETENTION_TONE, 'review', 'warning'), 'warning')
})

test('RECONCILIATION_STATUS_TONE matches the replaced reconciliation statusTone', () => {
  const tone = (status: string) => categoryTone(RECONCILIATION_STATUS_TONE, reconciliationStatusKey(status), 'info')
  assert.equal(tone('holding_only'), 'warning')
  assert.equal(tone('lot_only'), 'warning')
  assert.equal(tone('some_new_only'), 'warning')
  assert.equal(tone('quantity_break'), 'danger')
  assert.equal(tone('cost_break'), 'info')
})
