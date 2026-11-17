import assert from 'node:assert/strict'
import test from 'node:test'
import example from '../examples/annual-tax-estimate.synthetic.json'
import qdcgFixtures from './fixtures/annual-qdcg-2025.json'
import { annualInputDigest, validateAnnualEstimateInput } from '../lib/domain/taxes/annual/contracts'
import { annualJsonDigest, getAnnualRulePack } from '../lib/domain/taxes/annual/rules'
import { assessUsFederalComposition, assessUsFederalComparison } from '../lib/domain/taxes/annual/us-composition-contract'
import { composeUsFederalAnnualEstimate, compareUsFederalAnnualEstimate } from '../lib/domain/taxes/annual/us-composition'

function input(): any {
  const i: any = structuredClone(example)
  i.requestedComponents = ['us.regular.ordinary', 'us.niit']
  i.amounts.niitMagi = { ...i.amounts.taxableIncome, minor: '30000000' }
  i.amounts.netInvestmentIncome = { ...i.amounts.taxableIncome, minor: '2000000' }
  return i
}
const note = () => ({ state: 'reviewed', reason: 'Synthetic review only', sourceRefs: ['public-example'], reviewedAt: '2026-11-17' })
function review(i = input(), line17 = '0', line21 = '0', otherLine23 = '0'): any {
  const bridge = (minor: string) => ({ ...note(), state: 'reviewed-input', amountMinor: minor })
  return {
    schemaVersion: 1, boundary: 'US:federal:1040-line24', inputSha256: annualInputDigest(validateAnnualEstimateInput(i)),
    rulePackSha256: getAnnualRulePack(2025, i.rulePackId).contentSha256, coverage: note(),
    line17: bridge(line17), line21: bridge(line21), otherLine23: bridge(otherLine23), niit: { ...note(), placement: 'excluded-from-other-line23' },
  }
}
function history(liabilityMinor = '1500000'): any {
  return {
    schemaVersion: 1, taxUnitId: 'example-unit', taxYear: 2025, authority: 'US:federal', currency: 'USD', taxType: 'income',
    boundary: 'US:federal:1040-line24', calculationScope: 'annual-total', filingStatus: 'mfj', residency: 'reviewed-full-year',
    storeRevision: 3, storeSha256: '1'.repeat(64), obligationId: 'synthetic-obligation', basisId: 'synthetic-return', basisRevision: 2,
    current: true, evidenceIds: ['synthetic-evidence'], liabilityMinor,
  }
}
function approval(i: any, r: any, h: any): any {
  return {
    schemaVersion: 1, calculationSha256: composeUsFederalAnnualEstimate(i, r).calculationSha256,
    mappingReview: { ...note(), sourceRefs: ['synthetic-evidence'], compositionSha256: assessUsFederalComposition(i, r).contractSha256, historySha256: annualJsonDigest(h) },
  }
}
const trace = (r: ReturnType<typeof composeUsFederalAnnualEstimate>, line: string) => r.trace.find(row => row.line === line)!

test('independent ordinary anchor is composed at form stages with visible reviewed bridges', () => {
  // Existing independently anchored 2025 MFJ ordinary tax on USD120000 is USD16228; NIIT is USD760.
  const i = input(), r = review(i, '100000', '50000', '25000'), before = structuredClone({ i, r })
  const result = composeUsFederalAnnualEstimate(i, r)
  assert.equal(result.status, 'composed'); assert.equal(result.calculationScope, 'annual-total')
  assert.equal(result.coverage, 'composed'); assert.equal(result.verification, 'supplied-metadata-only')
  assert.deepEqual(result.annualTotal, { currency: 'USD', minor: '1773800' })
  for (const [line, amount] of [['16','1622800'],['17','100000'],['18','1722800'],['21','50000'],['22','1672800'],['niit','76000'],['23-other','25000'],['23','101000'],['24','1773800']]) assert.equal(trace(result, line).amountMinor, amount)
  assert.equal(trace(result, '17').origin, 'reviewed-input'); assert.equal(trace(result, '16').origin, 'computed')
  assert.deepEqual(trace(result, '22').operandsMinor, ['1722800', '50000'])
  assert.equal(result.comparisonEligible, false)
  assert.deepEqual({ i, r }, before); assert.doesNotThrow(() => JSON.stringify(result))
})

for (const credits of ['1722800', '2000000']) test(`credits floor line22 before adding NIIT/other taxes: ${credits}`, () => {
  const i = input(), result = composeUsFederalAnnualEstimate(i, review(i, '100000', credits, '25000'))
  assert.equal(trace(result, '22').amountMinor, '0'); assert.equal(result.annualTotal?.minor, '101000')
})

test('just below the credit floor preserves one whole dollar and NIIT exactly once', () => {
  const i = input(), result = composeUsFederalAnnualEstimate(i, review(i, '0', '1622700'))
  assert.equal(trace(result, '22').amountMinor, '100'); assert.equal(result.annualTotal?.minor, '76100')
})

test('eligible v2 QDCG anchor is used without also adding ordinary tax', () => {
  const i = input(), f = qdcgFixtures.cases[0]
  i.rulePackId = 'annual-2025-qualified-gains-v2'; i.requestedComponents = ['us.regular.qdcg', 'us.niit']
  i.regularTaxMethod = { ...note(), state: 'qdcg-reviewed' }; i.qdcgWorksheet = { ...note(), state: f.branch }
  for (const [key, minor] of Object.entries(f.amounts)) i.amounts[key] = { ...i.amounts.taxableIncome, minor }
  const result = composeUsFederalAnnualEstimate(i, review(i))
  assert.equal(trace(result, '16').amountMinor, '1406100'); assert.equal(result.annualTotal?.minor, '1482100')
  assert.equal(result.components.length, 2)
})

test('zero result is known, and not-applicable remains visibly distinct from computed zero', () => {
  const i = input(); for (const a of Object.values(i.amounts) as any[]) a.minor = '0'
  const r = review(i); r.line17.state = 'not-applicable'
  const result = composeUsFederalAnnualEstimate(i, r)
  assert.equal(result.annualTotal?.minor, '0'); assert.equal(trace(result, '17').origin, 'not-applicable')
  assert.equal(trace(result, 'niit').origin, 'computed')
})

test('large bridges stay exact beyond Number precision', () => {
  const i = input(), result = composeUsFederalAnnualEstimate(i, review(i, '900719925474099300'))
  assert.equal(result.annualTotal?.minor, '900719925475798100')
})

test('existing component rounding is preserved, while recorded liability cents are not rounded again', () => {
  const i = input(); i.amounts.taxableIncome.minor = '9999950'; i.amounts.niitMagi.minor = '25000050'; i.amounts.netInvestmentIncome.minor = '99'
  const r = review(i), h = history('1182801'), result = compareUsFederalAnnualEstimate(i, r, h, approval(i, r, h))
  assert.equal(result.estimate.annualTotal?.minor, '1182800'); assert.equal(result.differenceMinor, '-1')
})

for (const [reported, expected] of [['1500000','198800'],['1698800','0'],['1800000','-101200']]) test(`difference is estimate minus recorded liability: ${reported}`, () => {
  const i = input(), r = review(i), h = history(reported), a = approval(i, r, h), before = structuredClone({ i, r, h, a })
  const result = compareUsFederalAnnualEstimate(i, r, h, a)
  assert.equal(result.status, 'compared'); assert.equal(result.comparisonEligible, true); assert.equal(result.differenceMinor, expected)
  assert.equal(result.differenceDirection, 'estimate-minus-recorded-liability')
  assert.equal(result.verification, 'supplied-metadata-only')
  for (const key of ['refund','amountDue','paymentStatus','filingReady']) assert.equal(Object.hasOwn(result, key), false)
  assert.deepEqual({ i, r, h, a }, before)
})

test('huge signed difference and canonical zero serialize as strings', () => {
  const i = input(), r = review(i), h = history('900719925474099300'), result = compareUsFederalAnnualEstimate(i, r, h, approval(i, r, h))
  assert.equal(result.differenceMinor, '-900719925472400500'); assert.doesNotThrow(() => JSON.stringify(result))
})

test('output digests are deterministic, bind version and actual result, and ignore JSON key order', () => {
  const i = input(), r = review(i), result = composeUsFederalAnnualEstimate(i, r)
  const { calculationSha256, ...payload } = result
  assert.equal(calculationSha256, annualJsonDigest(payload))
  assert.equal(composeUsFederalAnnualEstimate(i, Object.fromEntries(Object.entries(r).reverse())).calculationSha256, calculationSha256)
  assert.equal(result.calculationVersion, 'us-federal-line24-calculation-v1')
  r.line17.amountMinor = '100'; assert.notEqual(composeUsFederalAnnualEstimate(i, r).calculationSha256, calculationSha256)
})

for (const change of [
  (i: any, r: any) => { delete i.amounts.niitMagi },
  (i: any, r: any) => { i.requestedComponents = ['us.regular.ordinary'] },
  (i: any, r: any) => { i.amounts.taxableIncome.origin = 'assumption' },
  (i: any, r: any) => { r.coverage = { ...note(), state: 'unknown' } },
  (i: any, r: any) => { r.line17 = { state: 'unknown', reason: 'Missing bridge', sourceRefs: [], reviewedAt: null, amountMinor: null } },
  (i: any, r: any) => { r.niit.placement = 'included-in-other-line23' },
  (i: any, r: any) => { i.specialMethod = { ...note(), state: 'unsupported' } },
  (i: any, r: any) => { i.revision++ },
  (i: any, r: any) => { r.rulePackSha256 = '0'.repeat(64) },
]) test('unresolved/unsupported/stale composition has no annual total or partial lower-bound sum', () => {
  const i = input(), r = review(i); change(i, r)
  const result = composeUsFederalAnnualEstimate(i, r)
  assert.equal(result.status, 'blocked'); assert.equal(result.annualTotal, null); assert.deepEqual(result.trace, [])
  assert.ok(result.blockers.length); assert.equal(result.comparisonEligible, false)
})

for (const field of ['taxUnitId','authority','taxType','boundary','filingStatus','residency','calculationScope']) test(`comparison refuses incompatible history: ${field}`, () => {
  const i = input(), r = review(i), h = history(), a = approval(i, r, h)
  const changed: Record<string, unknown> = { taxUnitId:'another-unit', authority:'US:CA', taxType:'other', boundary:null, filingStatus:'single', residency:'unknown', calculationScope:'component' }
  h[field] = changed[field]
  const result = compareUsFederalAnnualEstimate(i, r, h, a)
  assert.equal(result.status, 'blocked'); assert.equal(result.differenceMinor, null); assert.equal(result.comparisonEligible, false)
  assert.ok(result.blockers.includes(`history-scope:${field}`)); assert.notEqual(result.estimate.annualTotal, null)
})

test('currentness/evidence/unknown liability blocks numeric comparison even when hashes are fresh', () => {
  const i = input(), r = review(i)
  for (const [field,value] of [['current',false],['liabilityMinor',null],['evidenceIds',[]]] as const) {
    const h = history(); h[field] = value
    const a = approval(i,r,h)
    if (field==='evidenceIds') a.mappingReview = { ...a.mappingReview,state:'unknown',sourceRefs:[],reviewedAt:null }
    const result = compareUsFederalAnnualEstimate(i,r,h,a)
    assert.equal(result.differenceMinor,null); assert.equal(result.comparisonEligible,false)
  }
})

test('a review-only mapping does not implicitly approve the numerical calculation', () => {
  const i = input(), r = review(i), h = history(), a = approval(i,r,h)
  assert.throws(()=>compareUsFederalAnnualEstimate(i,r,h,a.mappingReview))
  for (const value of ['0'.repeat(64), 'f'.repeat(64)]) {
    a.calculationSha256=value; const result=compareUsFederalAnnualEstimate(i,r,h,a)
    assert.ok(result.blockers.includes('stale-calculation-review')); assert.equal(result.differenceMinor,null)
  }
})

test('changed review, history or mapping revision cannot reuse numerical approval', () => {
  const i=input(),r=review(i),h=history(),a=approval(i,r,h)
  r.line17.amountMinor='100'
  let result=compareUsFederalAnnualEstimate(i,r,h,a)
  assert.ok(result.blockers.includes('stale-calculation-review')); assert.ok(result.blockers.includes('stale-composition-mapping'))
  const revised=approval(i,r,h);h.basisRevision++
  result=compareUsFederalAnnualEstimate(i,r,h,revised)
  assert.ok(result.blockers.includes('stale-history-mapping'));assert.equal(result.differenceMinor,null)
})

test('malformed/extra approval fields and invented component results fail closed', () => {
  const i=input(),r=review(i),h=history(),a=approval(i,r,h)
  for(const changed of [{...a,schemaVersion:2},{...a,annualTotal:'1'},{...a,calculationSha256:'bad'},{...a,mappingReview:null}]) assert.throws(()=>compareUsFederalAnnualEstimate(i,r,h,changed))
  assert.throws(()=>composeUsFederalAnnualEstimate(i,{...r,components:[{id:'us.niit',amountMinor:'0'}]}))
  r.line21.amountMinor='1';assert.throws(()=>composeUsFederalAnnualEstimate(i,r))
})

test('input snapshots prevent accessor changes after validation from changing the amount used', () => {
  const i=input(),r=review(i),h=history(),a=approval(i,r,h)
  let reads=0
  Object.defineProperty(h,'liabilityMinor',{enumerable:true,get(){reads++;return reads===1?'1500000':'1800000'}})
  // Either a coherent copied selection is compared or stale mapping is blocked; never silently use an unchecked value.
  const result=compareUsFederalAnnualEstimate(i,r,h,a)
  if(result.status==='compared') assert.equal(result.differenceMinor,'198800')
  else assert.equal(result.differenceMinor,null)
})

test('old component/readiness contracts remain non-numeric after actual composition', () => {
  const i=input(),r=review(i),h=history(),a=approval(i,r,h)
  composeUsFederalAnnualEstimate(i,r);compareUsFederalAnnualEstimate(i,r,h,a)
  assert.equal(assessUsFederalComposition(i,r).annualTotal,null)
  assert.equal(assessUsFederalComparison(i,r,h,a.mappingReview).differenceMinor,null)
})

test('single-profile independent ordinary anchor and matching history compare without MFJ fallback', () => {
  const i=input();i.filingStatus='single';i.taxUnit.kind='individual';i.taxUnit.ownerIds=['example-a']
  const r=review(i),h=history('2240700');h.filingStatus='single'
  const result=compareUsFederalAnnualEstimate(i,r,h,approval(i,r,h))
  assert.equal(trace(result.estimate,'16').amountMinor,'2164700');assert.equal(result.estimate.annualTotal?.minor,'2240700')
  assert.equal(result.differenceMinor,'0');assert.equal(result.comparisonEligible,true)
})

for(const [field,value] of [['taxYear',2024],['currency','KRW']] as const) test(`new numeric wrapper preserves ${field} comparison gate`,()=>{
  const i=input(),r=review(i),h=history(),a=approval(i,r,h);h[field]=value
  const result=compareUsFederalAnnualEstimate(i,r,h,a)
  assert.ok(result.blockers.includes(`history-scope:${field}`));assert.equal(result.differenceMinor,null)
})

test('unsupported line-16 version and unreviewed comparison mapping do not gain a numeric result',()=>{
  const i=input(),r=review(i),h=history(),a=approval(i,r,h)
  a.mappingReview.state='unknown'
  const result=compareUsFederalAnnualEstimate(i,r,h,a)
  assert.ok(result.blockers.includes('mapping-unreviewed'));assert.equal(result.differenceMinor,null)
  i.requestedComponents=['us.regular.qdcg','us.niit'];i.regularTaxMethod={...note(),state:'qdcg-reviewed'};i.qdcgWorksheet={...note(),state:'schedule-d-reviewed'}
  for(const key of ['ordinaryDividends','qualifiedDividends','netLongTermGain','netCapitalGain'])i.amounts[key]={...i.amounts.taxableIncome,minor:'0'}
  const blocked=composeUsFederalAnnualEstimate(i,review(i))
  assert.ok(blocked.blockers.includes('component-blocked:us.regular.qdcg'));assert.equal(blocked.annualTotal,null)
})
