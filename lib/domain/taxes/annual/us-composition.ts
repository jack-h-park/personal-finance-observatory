import type { Money } from '../history'
import { annualInputDigest, validateAnnualEstimateInput, type AnnualComponentResult } from './contracts'
import { annualJsonDigest, getAnnualRulePack } from './rules'
import {
  assessUsFederalComposition, assessUsFederalComparison, validateUsFederalCompositionReview,
  US_FEDERAL_COMPOSITION_CONTRACT, type RecordedFederalBoundary, type FederalComparisonMappingReview,
} from './us-composition-contract'

export const US_FEDERAL_CALCULATION_VERSION = 'us-federal-line24-calculation-v1' as const
export type FederalCompositionTrace = {
  line: '16' | '17' | '18' | '21' | '22' | 'niit' | '23-other' | '23' | '24'
  origin: 'computed' | 'reviewed-input' | 'not-applicable' | 'derived'
  operation: 'component' | 'reviewed' | 'add' | 'subtract-floor-zero'
  amountMinor: string; operandsMinor: string[]; sourceRefs: string[]
}
export type FederalAnnualEstimate = {
  schemaVersion: 1; calculationVersion: typeof US_FEDERAL_CALCULATION_VERSION; calculationSha256: string
  status: 'composed' | 'blocked'; calculationScope: 'annual-total'; coverage: 'composed'; verification: 'supplied-metadata-only'
  boundary: typeof US_FEDERAL_COMPOSITION_CONTRACT.boundary; taxYear: 2025; taxUnitId: string
  authority: 'US:federal'; currency: 'USD'; taxType: 'income'; filingStatus: 'single' | 'mfj'
  scenarioId: string; inputRevision: number; inputSha256: string; rulePackSha256: string; compositionSha256: string
  annualTotal: Money | null; comparisonEligible: false; components: AnnualComponentResult[]
  trace: FederalCompositionTrace[]; blockers: string[]
}
/** Additional review of the exact calculation; a prior contract mapping alone is insufficient. */
export type FederalNumericalComparisonApproval = {
  schemaVersion: 1; calculationSha256: string; mappingReview: FederalComparisonMappingReview
}
export type FederalAnnualComparison = {
  schemaVersion: 1; comparisonSha256: string; status: 'compared' | 'blocked'; comparisonEligible: boolean
  verification: 'supplied-metadata-only'; differenceDirection: 'estimate-minus-recorded-liability'; currency: 'USD'
  differenceMinor: string | null; estimate: FederalAnnualEstimate; reportedLiability: Money | null
  compositionSha256: string; historySha256: string; mappingSha256: string; blockers: string[]
}

/** Copy supplied JSON before validation/use so no result depends on later caller mutations. */
function jsonSnapshot(value: unknown): unknown {
  annualJsonDigest(value)
  const copy = structuredClone(value)
  annualJsonDigest(copy)
  return copy
}

/** Pure, stage-ordered 2025 liability composition. No history, source/evidence reads or writes. */
export function composeUsFederalAnnualEstimate(inputValue: unknown, reviewValue: unknown): FederalAnnualEstimate {
  const input = validateAnnualEstimateInput(jsonSnapshot(inputValue))
  const review = validateUsFederalCompositionReview(jsonSnapshot(reviewValue), input)
  const readiness = assessUsFederalComposition(input, review), pack = getAnnualRulePack(2025, input.rulePackId)
  const trace: FederalCompositionTrace[] = []
  let annualTotal: Money | null = null
  if (readiness.status === 'contract-ready') {
    const regular = readiness.components.find(c => c.id === 'us.regular.ordinary' || c.id === 'us.regular.qdcg')!
    const niitComponent = readiness.components.find(c => c.id === 'us.niit')!
    const line16 = BigInt(regular.amountMinor!), niit = BigInt(niitComponent.amountMinor!)
    const line17 = BigInt(review.line17.amountMinor!), line21 = BigInt(review.line21.amountMinor!), other = BigInt(review.otherLine23.amountMinor!)
    const line18 = line16 + line17
    const afterCredits = line18 - line21
    const line22 = afterCredits > 0n ? afterCredits : 0n
    const line23 = niit + other, line24 = line22 + line23
    const addTrace = (
      line: FederalCompositionTrace['line'], origin: FederalCompositionTrace['origin'], operation: FederalCompositionTrace['operation'],
      amount: bigint, operands: bigint[], sourceRefs: string[],
    ) => trace.push({ line, origin, operation, amountMinor: String(amount), operandsMinor: operands.map(String), sourceRefs: [...sourceRefs] })
    addTrace('16', 'computed', 'component', line16, [], regular.sourceRefs)
    addTrace('17', review.line17.state as 'reviewed-input' | 'not-applicable', 'reviewed', line17, [], review.line17.sourceRefs)
    addTrace('18', 'derived', 'add', line18, [line16, line17], [])
    addTrace('21', review.line21.state as 'reviewed-input' | 'not-applicable', 'reviewed', line21, [], review.line21.sourceRefs)
    addTrace('22', 'derived', 'subtract-floor-zero', line22, [line18, line21], [])
    addTrace('niit', 'computed', 'component', niit, [], niitComponent.sourceRefs)
    addTrace('23-other', review.otherLine23.state as 'reviewed-input' | 'not-applicable', 'reviewed', other, [], review.otherLine23.sourceRefs)
    addTrace('23', 'derived', 'add', line23, [niit, other], [])
    addTrace('24', 'derived', 'add', line24, [line22, line23], [])
    annualTotal = { currency: 'USD', minor: String(line24) }
  }
  const payload: Omit<FederalAnnualEstimate, 'calculationSha256'> = {
    schemaVersion: 1, calculationVersion: US_FEDERAL_CALCULATION_VERSION,
    status: readiness.status === 'contract-ready' ? 'composed' : 'blocked', calculationScope: 'annual-total', coverage: 'composed', verification: 'supplied-metadata-only',
    boundary: US_FEDERAL_COMPOSITION_CONTRACT.boundary, taxYear: 2025, taxUnitId: input.taxUnit.id,
    authority: 'US:federal', currency: 'USD', taxType: 'income', filingStatus: input.filingStatus as 'single' | 'mfj',
    scenarioId: input.id, inputRevision: input.revision, inputSha256: annualInputDigest(input), rulePackSha256: pack.contentSha256, compositionSha256: readiness.contractSha256,
    annualTotal, comparisonEligible: false, components: readiness.components, trace, blockers: readiness.blockers,
  }
  return { ...payload, calculationSha256: annualJsonDigest(payload) }
}

function numericalApproval(value: unknown): FederalNumericalComparisonApproval {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid numerical comparison approval')
  const approval = value as Record<string, unknown>, keys = ['schemaVersion', 'calculationSha256', 'mappingReview']
  if (Object.keys(approval).length !== keys.length || !keys.every(key => Object.hasOwn(approval, key)) || approval.schemaVersion !== 1 || typeof approval.calculationSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(approval.calculationSha256)) throw new Error('Invalid numerical comparison approval fields')
  // Existing comparison readiness performs the complete mappingReview validation.
  return value as FederalNumericalComparisonApproval
}

/** Supplied-history comparison only. Difference is a liability delta, never refund/due/settlement. */
export function compareUsFederalAnnualEstimate(inputValue: unknown, reviewValue: unknown, historyValue: unknown, approvalValue: unknown): FederalAnnualComparison {
  const input = jsonSnapshot(inputValue), review = jsonSnapshot(reviewValue), history = jsonSnapshot(historyValue)
  const approval = numericalApproval(jsonSnapshot(approvalValue))
  const estimate = composeUsFederalAnnualEstimate(input, review)
  const readiness = assessUsFederalComparison(input, review, history, approval.mappingReview)
  // All four snapshots were validated above and are not exposed until after arithmetic.
  const recorded = history as RecordedFederalBoundary
  const blockers = [...readiness.blockers]
  if (approval.calculationSha256 !== estimate.calculationSha256) blockers.push('stale-calculation-review')
  const compared = readiness.status === 'contract-ready' && estimate.status === 'composed' && blockers.length === 0
  const payload: Omit<FederalAnnualComparison, 'comparisonSha256'> = {
    schemaVersion: 1, status: compared ? 'compared' : 'blocked', comparisonEligible: compared, verification: 'supplied-metadata-only',
    differenceDirection: 'estimate-minus-recorded-liability', currency: 'USD',
    differenceMinor: compared ? String(BigInt(estimate.annualTotal!.minor) - BigInt(recorded.liabilityMinor!)) : null,
    estimate, reportedLiability: recorded.liabilityMinor === null ? null : { currency: recorded.currency, minor: recorded.liabilityMinor },
    compositionSha256: readiness.compositionSha256, historySha256: readiness.historySha256, mappingSha256: readiness.mappingSha256, blockers,
  }
  return { ...payload, comparisonSha256: annualJsonDigest(payload) }
}
