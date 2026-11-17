import assert from 'node:assert/strict'
import test from 'node:test'
import example from '../examples/annual-tax-estimate.synthetic.json'
import { annualInputDigest, validateAnnualEstimateInput } from '../lib/domain/taxes/annual/contracts'
import { annualJsonDigest, getAnnualRulePack } from '../lib/domain/taxes/annual/rules'
import { calculateAnnualComponents } from '../lib/domain/taxes/annual/calculate'
import {
  assessUsFederalComposition, assessUsFederalComparison, validateUsFederalCompositionReview,
} from '../lib/domain/taxes/annual/us-composition-contract'

function scenario(): any {
  const input = structuredClone(example) as any
  input.requestedComponents.push('us.niit')
  input.amounts.niitMagi = { ...input.amounts.taxableIncome, minor: '30000000' }
  input.amounts.netInvestmentIncome = { ...input.amounts.taxableIncome, minor: '2000000' }
  return input
}
const fact = () => ({ state: 'reviewed', reason: 'Synthetic reviewed boundary metadata', sourceRefs: ['public-example'], reviewedAt: '2026-11-17' })
const bridge = () => ({ ...fact(), state: 'not-applicable', amountMinor: '0' })
function review(input = scenario()): any {
  return {
    schemaVersion: 1, boundary: 'US:federal:1040-line24', inputSha256: annualInputDigest(validateAnnualEstimateInput(input)),
    rulePackSha256: getAnnualRulePack(2025, input.rulePackId).contentSha256,
    coverage: fact(), line17: bridge(), line21: bridge(), otherLine23: bridge(),
    niit: { ...fact(), placement: 'excluded-from-other-line23' },
  }
}
function history(): any {
  return {
    schemaVersion: 1, taxUnitId: 'example-unit', taxYear: 2025, authority: 'US:federal', currency: 'USD', taxType: 'income',
    boundary: 'US:federal:1040-line24', calculationScope: 'annual-total', filingStatus: 'mfj', residency: 'reviewed-full-year',
    storeRevision: 3, storeSha256: '1'.repeat(64), obligationId: 'synthetic-obligation', basisId: 'synthetic-basis', basisRevision: 2,
    current: true, evidenceIds: ['synthetic-return-evidence'], liabilityMinor: '1500000',
  }
}
function mapping(input: any, r: any, h: any): any {
  return { ...fact(), sourceRefs: ['synthetic-return-evidence'], compositionSha256: assessUsFederalComposition(input, r).contractSha256, historySha256: annualJsonDigest(h) }
}
function has(result: { blockers: string[] }, code: string) { assert.ok(result.blockers.includes(code), JSON.stringify(result)) }

test('complete explicit review is contract-ready, never an annual result or comparison', () => {
  const i = scenario(), r = review(i), before = structuredClone({ i, r })
  const result = assessUsFederalComposition(i, r)
  assert.equal(result.status, 'contract-ready')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.calculationScope, 'contract-only')
  assert.equal(result.annualTotal, null)
  assert.equal(result.comparisonEligible, false)
  assert.equal(result.components.length, 2)
  assert.deepEqual({ i, r }, before)
  assert.deepEqual(calculateAnnualComponents(i).annualTotal, null)
})

test('review validation clones metadata and rejects absent, extra, non-JSON and sparse fields', () => {
  const i = scenario(), r = review(i), cloned = validateUsFederalCompositionReview(r, i)
  assert.notEqual(cloned, r)
  cloned.coverage.sourceRefs.push('local-only-change')
  assert.deepEqual(r.coverage.sourceRefs, ['public-example'])
  for (const mutate of [
    (x: any) => { delete x.line17 }, (x: any) => { x.payments = '0' },
    (x: any) => { x.line21.refund = '0' }, (x: any) => { x.coverage.sourceRefs = new Array(1) },
    (x: any) => { x.coverage.reviewedAt = new Date() }, (x: any) => { x.schemaVersion = 2 },
  ]) { const x = structuredClone(r); mutate(x); assert.throws(() => assessUsFederalComposition(i, x)) }
})

for (const minor of ['-100', '1', '00100', '1e2', '10.00', 100, null]) {
  test(`invalid reviewed whole-dollar bridge rejected: ${String(minor)}`, () => {
    const i = scenario(), r = review(i); r.line17 = { ...fact(), state: 'reviewed-input', amountMinor: minor }
    assert.throws(() => assessUsFederalComposition(i, r))
  })
}

test('explicit not-applicable is reviewed zero; unknown never becomes zero', () => {
  const i = scenario(), r = review(i)
  r.line17.amountMinor = '100'; assert.throws(() => assessUsFederalComposition(i, r))
  r.line17 = { state: 'unknown', reason: 'Missing bridge evidence', sourceRefs: [], reviewedAt: null, amountMinor: null }
  has(assessUsFederalComposition(i, r), 'line17-unresolved')
  r.line17.amountMinor = '0'; assert.throws(() => assessUsFederalComposition(i, r))
})

for (const mutate of [
  (r: any) => { r.line21.reviewedAt = '2025-02-29' },
  (r: any) => { r.coverage.reviewedAt = null },
  (r: any) => { r.otherLine23.sourceRefs = [] },
  (r: any) => { r.line17.sourceRefs = ['unresolved'] },
  (r: any) => { r.coverage.sourceRefs.push('public-example') },
]) test('review provenance is structurally complete and references declared sources', () => {
  const i = scenario(), r = review(i); mutate(r); assert.throws(() => assessUsFederalComposition(i, r))
})

test('NIIT inclusion/unknown placement and incomplete coverage block without summing', () => {
  const i = scenario()
  for (const placement of ['included-in-other-line23', 'unknown']) { const r = review(i); r.niit.placement = placement; has(assessUsFederalComposition(i, r), 'niit-placement-unresolved') }
  const r = review(i); r.coverage = { state: 'unknown', reason: 'Scope not reviewed', sourceRefs: [], reviewedAt: null }
  has(assessUsFederalComposition(i, r), 'coverage-unresolved')
})

test('requires exactly one regular method and NIIT; reviewed bridges cannot bypass blocked bases', () => {
  const i = scenario(); i.requestedComponents = ['us.niit']; has(assessUsFederalComposition(i, review(i)), 'regular-component-missing')
  i.requestedComponents = ['us.regular.ordinary']; has(assessUsFederalComposition(i, review(i)), 'niit-component-missing')
  const missing = scenario(); delete missing.amounts.niitMagi
  has(assessUsFederalComposition(missing, review(missing)), 'component-blocked:us.niit')
  for (const field of ['specialMethod', 'residency', 'regularTaxMethod']) {
    const x = scenario(); x[field] = { ...fact(), state: 'unsupported' }
    assert.equal(assessUsFederalComposition(x, review(x)).status, 'blocked')
  }
  const assumed = scenario(); assumed.amounts.taxableIncome.origin = 'assumption'
  has(assessUsFederalComposition(assumed, review(assumed)), 'assumed-base:taxableIncome')
})

test('preferential ordinary conflicts and wrong jurisdiction/year cannot enter composition', () => {
  const i = scenario(); i.amounts.qualifiedDividends = { ...i.amounts.taxableIncome, minor: '100' }
  has(assessUsFederalComposition(i, review(i)), 'component-blocked:us.regular.ordinary')
  const wrong = scenario(); wrong.taxYear = 2026; assert.throws(() => assessUsFederalComposition(wrong, {}))
  const kr: any = { ...scenario(), authority: 'KR:national', currency: 'KRW', filingStatus: 'individual' }
  assert.throws(() => assessUsFederalComposition(kr, {}))
})

test('changed input/rule review identity blocks, stable JSON ordering preserves digest', () => {
  const i = scenario(), r = review(i), ready = assessUsFederalComposition(i, r)
  const reordered = Object.fromEntries(Object.entries(r).reverse())
  assert.equal(assessUsFederalComposition(i, reordered).contractSha256, ready.contractSha256)
  i.revision++; has(assessUsFederalComposition(i, r), 'stale-input-review')
  const x = review(i); x.rulePackSha256 = '0'.repeat(64); has(assessUsFederalComposition(i, x), 'stale-rule-review')
})

test('comparison contract binds the reviewed composition and exact evidenced basis, with no difference', () => {
  const i = scenario(), r = review(i), h = history(), m = mapping(i, r, h), before = structuredClone({ i, r, h, m })
  const result = assessUsFederalComparison(i, r, h, m)
  assert.equal(result.status, 'contract-ready'); assert.deepEqual(result.blockers, [])
  assert.equal(result.differenceMinor, null); assert.equal(result.comparisonEligible, false)
  assert.deepEqual({ i, r, h, m }, before)
})

for (const [field, value] of [
  ['taxUnitId', 'another-unit'], ['taxYear', 2024], ['authority', 'US:CA'], ['currency', 'KRW'], ['taxType', 'capital-gains'],
  ['boundary', null], ['boundary', 'US:federal:1040-line22'], ['filingStatus', 'single'], ['residency', 'unknown'], ['calculationScope', 'component'],
] as const) test(`equal broad identity is insufficient: ${field}=${value}`, () => {
  const i = scenario(), r = review(i), h = history(); h[field] = value
  has(assessUsFederalComparison(i, r, h, mapping(i, r, h)), `history-scope:${field}`)
})

test('stale/unproved/unknown-liability history blocks even with matching mapping hashes', () => {
  const i = scenario(), r = review(i)
  for (const [field, value, code] of [['current', false, 'history-not-current'], ['liabilityMinor', null, 'history-liability-unknown']] as const) {
    const h = history(); h[field] = value; has(assessUsFederalComparison(i, r, h, mapping(i, r, h)), code)
  }
  const h = history(); h.evidenceIds = []
  const m = { ...mapping(i, r, history()), state: 'unknown', sourceRefs: [], reviewedAt: null, historySha256: annualJsonDigest(h) }
  has(assessUsFederalComparison(i, r, h, m), 'history-unevidenced')
  has(assessUsFederalComparison(i, r, h, m), 'mapping-unreviewed')
})

for (const field of ['storeRevision', 'storeSha256', 'basisId', 'basisRevision', 'liabilityMinor', 'evidenceIds']) {
  test(`changed history ${field} invalidates a prior mapping`, () => {
    const i = scenario(), r = review(i), h = history(), m = mapping(i, r, h)
    if (field === 'storeRevision' || field === 'basisRevision') h[field]++
    else if (field === 'evidenceIds') h[field].push('second-evidence')
    else if (field === 'liabilityMinor') h[field] = '1500100'
    else if (field === 'storeSha256') h[field] = '2'.repeat(64)
    else h[field] = 'replacement-basis'
    has(assessUsFederalComparison(i, r, h, m), 'stale-history-mapping')
  })
}

test('composition review or input revisions invalidate previous comparison approval', () => {
  const i = scenario(), r = review(i), h = history(), m = mapping(i, r, h)
  r.line17 = { ...fact(), state: 'reviewed-input', amountMinor: '100' }
  has(assessUsFederalComparison(i, r, h, m), 'stale-composition-mapping')
  i.revision++; const revised = review(i)
  has(assessUsFederalComparison(i, revised, h, m), 'stale-composition-mapping')
})

test('malformed mapping/history rejected and blocked composition propagates', () => {
  const i = scenario(), r = review(i), h = history(), m = mapping(i, r, h)
  for (const change of [(x: any) => { x.storeRevision = -1 }, (x: any) => { x.liabilityMinor = '-1' }, (x: any) => { x.refundReceived = '100' }]) {
    const x = structuredClone(h); change(x); assert.throws(() => assessUsFederalComparison(i, r, x, m))
  }
  const bad = { ...m, sourceRefs: ['missing-evidence'] }; assert.throws(() => assessUsFederalComparison(i, r, h, bad))
  delete i.amounts.netInvestmentIncome
  has(assessUsFederalComparison(i, review(i), h, m), 'composition-blocked')
})


test('explicit v2 eligible QDCG is review-ready; v1 cannot borrow its readiness', () => {
  const i = scenario()
  i.rulePackId = 'annual-2025-qualified-gains-v2'
  i.requestedComponents = ['us.regular.qdcg', 'us.niit']
  i.regularTaxMethod = { ...fact(), state: 'qdcg-reviewed' }
  i.qdcgWorksheet = { ...fact(), state: 'schedule-d-reviewed' }
  for (const [key, minor] of [['ordinaryDividends', '400000'], ['qualifiedDividends', '250000'], ['netLongTermGain', '300000'], ['netCapitalGain', '250000']]) i.amounts[key] = { ...i.amounts.taxableIncome, minor }
  assert.equal(assessUsFederalComposition(i, review(i)).status, 'contract-ready')
  i.rulePackId = 'annual-2025-foundation-v1'
  has(assessUsFederalComposition(i, review(i)), 'component-blocked:us.regular.qdcg')
})

test('reviewed zero is valid and every required assumption remains explicit', () => {
  const i = scenario(), r = review(i)
  r.line21 = { ...fact(), state: 'reviewed-input', amountMinor: '0' }
  assert.equal(assessUsFederalComposition(i, r).status, 'contract-ready')
  for (const key of ['niitMagi', 'netInvestmentIncome']) {
    const x = scenario(); x.amounts[key].origin = 'assumption'
    has(assessUsFederalComposition(x, review(x)), `assumed-base:${key}`)
  }
  for (const key of ['line21', 'otherLine23']) {
    const x = review(i); x[key] = { state: 'unsupported', reason: 'External schedule not reviewed', sourceRefs: [], reviewedAt: null, amountMinor: null }
    has(assessUsFederalComposition(i, x), `${key}-unresolved`)
  }
})
