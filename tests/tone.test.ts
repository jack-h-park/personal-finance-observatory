import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  BRIEFING_SEVERITY,
  CAVEAT_SEVERITY,
  CHANGE_SEVERITY,
  CHECK_RESULT_SEVERITY,
  COVERAGE_SEVERITY,
  DRIFT_BAND_SEVERITY,
  EVIDENCE_LINK_SEVERITY,
  FAULT_SEVERITY,
  FILING_PROFILE_TONE,
  FILL_STATUS_SEVERITY,
  FRESHNESS_SEVERITY,
  INSTRUCTION_KIND_TONE,
  INVENTORY_IDENTITY_SEVERITY,
  INVENTORY_STATUS_TONE,
  MAPPING_STATUS_SEVERITY,
  PLAN_ROLE_TONE,
  PLANNING_INPUT_TONE,
  PLANNING_RESULT_TONE,
  POSITION_EVENT_TONE,
  PRIORITY_SEVERITY,
  REFRESH_DOT_CLASS,
  REBALANCE_ACTION_TONE,
  RECONCILIATION_STATUS_TONE,
  RETENTION_TONE,
  REVIEW_SEVERITY,
  RUN_SEVERITY,
  SELL_TIER_TONE,
  SEVERITIES,
  TAX_DECISION_SEVERITY,
  TAX_DUE_SEVERITY,
  TAX_PLAN_STATUS_SEVERITY,
  TAX_REPORT_TONE,
  TO_REVIEW_SEVERITY,
  TRADE_SIDE_TONE,
  TRANSACTION_TYPE_TONE,
  WASH_SALE_SEVERITY,
  WRAPPER_TREATMENT_TONE,
  bucketTone,
  categoryTone,
  checkResultKey,
  countState,
  countTone,
  mappingStatusKey,
  priorityTone,
  reconciliationStatusKey,
  severityOf,
  severityTone,
  signClass,
  statusTone,
  toneBgClass,
  toneTextClass,
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

// Each case below is a page-local ternary this replaced, with the colour it
// drew in each branch. The colours must not move.
test('countState reads none for zero, a negative, null or NaN, and some above zero', () => {
  assert.equal(countState(0), 'none')
  assert.equal(countState(-3), 'none')
  assert.equal(countState(null), 'none')
  assert.equal(countState(undefined), 'none')
  assert.equal(countState(Number.NaN), 'none')
  assert.equal(countState(1), 'some')
  assert.equal(countState(0.5), 'some')
})

test('the count tables keep the colours of the ternaries they replace', () => {
  // `count ? 'warning' : 'success'`
  assert.equal(countTone(TO_REVIEW_SEVERITY, 0), 'success')
  assert.equal(countTone(TO_REVIEW_SEVERITY, 2), 'warning')
  // `count ? 'danger' : 'success'`
  assert.equal(countTone(FAULT_SEVERITY, 0), 'success')
  assert.equal(countTone(FAULT_SEVERITY, 2), 'danger')
  // `count > 0 ? 'warning' : 'neutral'`
  assert.equal(countTone(CAVEAT_SEVERITY, 0), 'neutral')
  assert.equal(countTone(CAVEAT_SEVERITY, 2), 'warning')
  // `taxKrw > 0 ? 'warning' : 'success'`
  assert.equal(countTone(TAX_DUE_SEVERITY, 0), 'success')
  assert.equal(countTone(TAX_DUE_SEVERITY, -10), 'success')
  assert.equal(countTone(TAX_DUE_SEVERITY, 10), 'warning')
})

test('the two-state tables keep the colours of the boolean ternaries they replace', () => {
  assert.equal(statusTone(REVIEW_SEVERITY, 'clear'), 'success')
  assert.equal(statusTone(REVIEW_SEVERITY, 'needs_review'), 'warning')
  assert.equal(statusTone(CHANGE_SEVERITY, 'changed'), 'warning')
  assert.equal(statusTone(CHANGE_SEVERITY, 'unchanged'), 'neutral')
  assert.equal(statusTone(WASH_SALE_SEVERITY, 'ending'), 'warning')
  assert.equal(statusTone(WASH_SALE_SEVERITY, 'blocked'), 'danger')
  assert.equal(statusTone(INVENTORY_IDENTITY_SEVERITY, 'expected'), 'info')
  assert.equal(statusTone(INVENTORY_IDENTITY_SEVERITY, 'unexpected'), 'warning')
})

test('CHECK_RESULT_SEVERITY: a pass, then the failed check by its severity', () => {
  const tone = (status: 'pass' | 'fail', severity: 'error' | 'warning') =>
    statusTone(CHECK_RESULT_SEVERITY, checkResultKey({ status, severity }))
  assert.equal(tone('pass', 'error'), 'success')
  assert.equal(tone('pass', 'warning'), 'success')
  assert.equal(tone('fail', 'warning'), 'warning')
  assert.equal(tone('fail', 'error'), 'danger')
  // data-ops reads a validation issue by its severity alone.
  assert.equal(statusTone(CHECK_RESULT_SEVERITY, 'error'), 'danger')
  assert.equal(statusTone(CHECK_RESULT_SEVERITY, 'warning'), 'warning')
})

test('MAPPING_STATUS_SEVERITY: anything tickerless is to review, the rest mapped', () => {
  const tone = (status: string) => statusTone(MAPPING_STATUS_SEVERITY, mappingStatusKey(status))
  assert.equal(tone('tickerless'), 'warning')
  assert.equal(tone('tickerless_income'), 'warning')
  assert.equal(tone('mapped'), 'success')
  assert.equal(tone('unknown'), 'success')
})

test('the status tables keep the colours of the ternaries they replace', () => {
  assert.equal(statusTone(EVIDENCE_LINK_SEVERITY, 'linked'), 'success')
  assert.equal(statusTone(EVIDENCE_LINK_SEVERITY, 'unlinked'), 'warning')
  assert.equal(statusTone(DRIFT_BAND_SEVERITY, 'within'), 'success')
  assert.equal(statusTone(DRIFT_BAND_SEVERITY, 'below'), 'warning')
  assert.equal(statusTone(DRIFT_BAND_SEVERITY, 'above'), 'warning')
  assert.equal(statusTone(FILL_STATUS_SEVERITY, 'executed'), 'success')
  assert.equal(statusTone(FILL_STATUS_SEVERITY, 'skipped'), 'neutral')
  assert.equal(statusTone(TAX_DECISION_SEVERITY, 'explore'), 'warning')
  assert.equal(statusTone(TAX_DECISION_SEVERITY, 'tie'), 'neutral')
  assert.equal(statusTone(TAX_DECISION_SEVERITY, 'recommendation'), 'success')
  // Was active warning, completed success, reviewed info, anything else neutral.
  assert.equal(statusTone(TAX_PLAN_STATUS_SEVERITY, 'active'), 'warning')
  assert.equal(statusTone(TAX_PLAN_STATUS_SEVERITY, 'completed'), 'success')
  assert.equal(statusTone(TAX_PLAN_STATUS_SEVERITY, 'reviewed'), 'info')
  assert.equal(statusTone(TAX_PLAN_STATUS_SEVERITY, 'draft'), 'neutral')
  assert.equal(statusTone(TAX_PLAN_STATUS_SEVERITY, 'archived'), 'neutral')
})

test('the category maps keep the colours of the ternaries they replace', () => {
  assert.equal(categoryTone(TAX_REPORT_TONE, 'us_gain_loss_pdf', 'success'), 'info')
  assert.equal(categoryTone(TAX_REPORT_TONE, 'other_report', 'success'), 'success')
  assert.equal(categoryTone(REBALANCE_ACTION_TONE, 'Hold', 'warning'), 'success')
  assert.equal(categoryTone(REBALANCE_ACTION_TONE, 'Add', 'warning'), 'warning')
  assert.equal(categoryTone(REBALANCE_ACTION_TONE, 'Reduce', 'warning'), 'warning')
  assert.equal(categoryTone(INSTRUCTION_KIND_TONE, 'sell'), 'warning')
  assert.equal(categoryTone(INSTRUCTION_KIND_TONE, 'buy'), 'info')
  assert.equal(categoryTone(INSTRUCTION_KIND_TONE, 'transfer'), 'neutral')
  assert.equal(categoryTone(SELL_TIER_TONE, 'loss'), 'success')
  assert.equal(categoryTone(SELL_TIER_TONE, 'short_term'), 'warning')
  assert.equal(categoryTone(SELL_TIER_TONE, 'us_long'), 'neutral')
  assert.equal(categoryTone(SELL_TIER_TONE, 'kr_deduction'), 'neutral')
  assert.equal(categoryTone(FILING_PROFILE_TONE, 'US_AND_KR', 'info'), 'warning')
  assert.equal(categoryTone(FILING_PROFILE_TONE, 'US_ONLY', 'info'), 'info')
  assert.equal(categoryTone(FILING_PROFILE_TONE, 'KR_ONLY', 'info'), 'info')
  assert.equal(categoryTone(PLAN_ROLE_TONE, 'loss'), 'danger')
  assert.equal(categoryTone(PLAN_ROLE_TONE, 'gain'), 'info')
  assert.equal(categoryTone(PLAN_ROLE_TONE, 'mixed'), 'warning')
  assert.equal(categoryTone(PLAN_ROLE_TONE, 'neutral'), 'neutral')
  assert.equal(categoryTone(PLANNING_INPUT_TONE, 'target'), 'neutral')
  assert.equal(categoryTone(PLANNING_INPUT_TONE, 'harvest'), 'success')
  assert.equal(categoryTone(PLANNING_RESULT_TONE, 'harvest'), 'info')
  assert.equal(categoryTone(PLANNING_RESULT_TONE, 'tax_due'), 'warning')
  assert.equal(categoryTone(PLANNING_RESULT_TONE, 'no_tax'), 'success')
})

test('signClass gives the class Signed drew for each sign', () => {
  assert.equal(signClass(-1), 'text-danger')
  assert.equal(signClass(1), 'text-success')
})

test('the tone class tables give the classes the replaced class-string ternaries wrote', () => {
  // positions, cost-basis and income figures: text-success / text-warning / text-danger.
  assert.equal(toneTextClass('success'), 'text-success')
  assert.equal(toneTextClass('warning'), 'text-warning')
  assert.equal(toneTextClass('danger'), 'text-danger')
  // The tax-plan month bars: a gain bar in info, a loss bar in danger.
  assert.equal(toneBgClass(categoryTone(PLAN_ROLE_TONE, 'gain')), 'bg-info')
  assert.equal(toneBgClass(categoryTone(PLAN_ROLE_TONE, 'loss')), 'bg-danger')
  // The auto-refresh dot, class string for class string.
  assert.deepEqual(REFRESH_DOT_CLASS, {
    paused: 'bg-warning',
    refreshing: 'bg-info motion-safe:animate-pulse',
    live: 'bg-success/70',
  })
})
