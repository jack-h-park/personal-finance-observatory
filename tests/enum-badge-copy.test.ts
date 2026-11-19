import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { FilingScenario } from '../lib/tax-policy'
import { getPageCopy, getUiCopy } from '../lib/ui-copy'

const HANGUL = /[가-힣]/

/**
 * Every member of FilingScenario, checked both ways at compile time: a member
 * listed here that the type lacks fails `satisfies`, and a member the type
 * gains without being listed here fails the `Missing` assignment.
 */
const FILING_SCENARIOS = ['US_ONLY', 'KR_ONLY', 'US_AND_KR'] as const satisfies readonly FilingScenario[]
type Missing = Exclude<FilingScenario, (typeof FILING_SCENARIOS)[number]>
const noneMissing: [Missing] extends [never] ? true : never = true

test('every filing scenario has an English and a Korean badge label', () => {
  assert.equal(noneMissing, true)
  const en = getPageCopy('taxPlanning', 'en').enums.filingScenario
  const ko = getPageCopy('taxPlanning', 'ko').enums.filingScenario
  assert.deepEqual(Object.keys(en).sort(), [...FILING_SCENARIOS].sort())
  assert.deepEqual(Object.keys(ko).sort(), [...FILING_SCENARIOS].sort())
  for (const scenario of FILING_SCENARIOS) {
    assert.ok(en[scenario].trim().length > 0, `en ${scenario}`)
    assert.ok(ko[scenario].trim().length > 0, `ko ${scenario}`)
    assert.notEqual(en[scenario], scenario, `en ${scenario} is a word, not the code`)
    assert.match(ko[scenario], HANGUL, `ko ${scenario}`)
  }
})

test('the other enum badge maps carry Korean for every value', () => {
  const maps: [string, Record<string, string>, Record<string, string>][] = [
    ['holdingBucket', getPageCopy('taxPlanning', 'en').enums.holdingBucket, getPageCopy('taxPlanning', 'ko').enums.holdingBucket],
    ['mappingStatuses', getPageCopy('dataOps', 'en').mappingStatuses, getPageCopy('dataOps', 'ko').mappingStatuses],
    ['sourceIssueStatuses', getPageCopy('dataOps', 'en').sourceIssueStatuses, getPageCopy('dataOps', 'ko').sourceIssueStatuses],
    ['actions', getPageCopy('rebalance', 'en').actions, getPageCopy('rebalance', 'ko').actions],
    // Typed `as Record<string, string>`, so a ko key missing here would still compile.
    ['transactionTypes', getUiCopy('en').transactionTypes, getUiCopy('ko').transactionTypes],
    ['statusLabels', getPageCopy('dataMap', 'en').statusLabels, getPageCopy('dataMap', 'ko').statusLabels],
  ]
  for (const [name, en, ko] of maps) {
    assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort(), name)
    for (const key of Object.keys(en)) {
      assert.ok(en[key].trim().length > 0, `${name}.${key} en`)
      assert.match(ko[key], HANGUL, `${name}.${key} ko`)
    }
  }
})
