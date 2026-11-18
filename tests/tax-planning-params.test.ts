import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { planningInputs } from '@/lib/tax-planning-params'
import type { TaxPolicy } from '@/lib/tax-policy'

const policy = { activeScenario: 'US_AND_KR', planningHorizonYears: 4 } as unknown as TaxPolicy

const defaults = {
  scenario: 'US_AND_KR',
  objective: 'minimize-tax',
  targetCashKrw: 0,
  annualTargetCashKrw: 0,
  horizonYears: 4,
  master: 'STAGED',
  executionMonths: 24,
}

test('empty params give the policy defaults', () => {
  assert.deepEqual(planningInputs({}, policy), defaults)
})

test('dropped parameters are ignored', () => {
  assert.deepEqual(
    planningInputs({ scenario: 'KR_ONLY', objective: 'harvest-loss', target: '5000000' }, policy),
    planningInputs({}, policy),
  )
})

test('annualTarget keeps digits only and is never negative', () => {
  assert.equal(planningInputs({ annualTarget: '50,000,000' }, policy).annualTargetCashKrw, 50000000)
  assert.equal(planningInputs({ annualTarget: '₩50000000' }, policy).annualTargetCashKrw, 50000000)
  assert.equal(planningInputs({ annualTarget: 'abc' }, policy).annualTargetCashKrw, 0)
  assert.equal(planningInputs({ annualTarget: '-5' }, policy).annualTargetCashKrw, 0)
})

test('horizon is clamped, pace and master fall back', () => {
  assert.equal(planningInputs({ horizon: '99' }, policy).horizonYears, 10)
  assert.equal(planningInputs({ horizon: '0' }, policy).horizonYears, 1)
  assert.equal(planningInputs({ pace: '13' }, policy).executionMonths, 24)
  assert.equal(planningInputs({ pace: '36' }, policy).executionMonths, 36)
  assert.equal(planningInputs({ master: 'NOPE' }, policy).master, 'STAGED')
  assert.equal(planningInputs({ master: 'EARLIEST_LT' }, policy).master, 'EARLIEST_LT')
})
