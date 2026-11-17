import { calculateAnnualComponents } from './calculate'
import { annualInputDigest, getAnnualRequiredAmounts, validateAnnualEstimateInput, type AnnualComponentResult, type AnnualEstimateInput } from './contracts'
import { annualJsonDigest, getAnnualRulePack } from './rules'

/** Stage-specific Form 1040 review contract. No annual arithmetic, evidence I/O or posting. */
export const US_FEDERAL_COMPOSITION_CONTRACT = Object.freeze({
  id: 'us-federal-line24-review-v1', boundary: 'US:federal:1040-line24', taxYear: 2025,
  formula: 'max(0, line16 + line17 - line21) + niit + otherLine23ExcludingNiit',
  formReference: 'https://www.irs.gov/pub/irs-pdf/f1040.pdf',
  niitReference: 'https://www.irs.gov/pub/irs-pdf/f1040s2.pdf',
} as const)

type ReviewNote = { state: 'reviewed' | 'unknown' | 'unsupported'; reason: string; sourceRefs: string[]; reviewedAt: string | null }
type Bridge = Omit<ReviewNote, 'state'> & { state: 'reviewed-input' | 'not-applicable' | 'unknown' | 'unsupported'; amountMinor: string | null }
export type UsFederalCompositionReview = {
  schemaVersion: 1; boundary: 'US:federal:1040-line24'; inputSha256: string; rulePackSha256: string
  coverage: ReviewNote; line17: Bridge; line21: Bridge; otherLine23: Bridge
  niit: ReviewNote & { placement: 'excluded-from-other-line23' | 'included-in-other-line23' | 'unknown' }
}
/** A supplied history projection, not an attestation that a live store/evidence was inspected. */
export type RecordedFederalBoundary = {
  schemaVersion: 1; taxUnitId: string; taxYear: number; authority: string; currency: 'USD' | 'KRW'; taxType: string
  boundary: string | null; calculationScope: 'annual-total' | 'component'; filingStatus: 'single' | 'mfj' | 'unknown'
  residency: 'reviewed-full-year' | 'unknown' | 'unsupported'; storeRevision: number; storeSha256: string
  obligationId: string; basisId: string; basisRevision: number; current: boolean; evidenceIds: string[]; liabilityMinor: string | null
}
export type FederalComparisonMappingReview = ReviewNote & { compositionSha256: string; historySha256: string }
export type FederalCompositionReadiness = {
  contractId: typeof US_FEDERAL_COMPOSITION_CONTRACT.id; contractSha256: string; status: 'contract-ready' | 'blocked'
  calculationScope: 'contract-only'; annualTotal: null; comparisonEligible: false; blockers: string[]
  components: AnnualComponentResult[]
}
export type FederalComparisonReadiness = {
  status: 'contract-ready' | 'blocked'; calculationScope: 'contract-only'; differenceMinor: null; comparisonEligible: false
  compositionSha256: string; historySha256: string; mappingSha256: string; blockers: string[]
}

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Invalid federal review contract: ${message}`)
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, 'plain object required')
  return value as Record<string, unknown>
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  requireValue(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'missing or unexpected field')
}
function text(value: unknown): asserts value is string { requireValue(typeof value === 'string' && value.trim().length > 0, 'nonempty text required') }
function digest(value: unknown) { requireValue(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'SHA256 required') }
function revision(value: unknown, minimum = 0) { requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum, 'invalid revision/year') }
function minor(value: unknown, wholeDollar: boolean) {
  requireValue(typeof value === 'string' && /^(0|[1-9][0-9]{0,127})$/.test(value), 'nonnegative canonical minor-unit string required')
  if (wholeDollar) requireValue(BigInt(value) % 100n === 0n, 'bridge must be a whole-dollar form amount')
}
function strings(value: unknown): asserts value is string[] {
  requireValue(Array.isArray(value), 'reference array required')
  for (const item of value) text(item)
  requireValue(new Set(value).size === value.length, 'duplicate reference')
}
function reviewNote(value: unknown, sources: Set<string>, states: readonly string[], extras: readonly string[] = []) {
  const note = object(value)
  exactKeys(note, ['state', 'reason', 'sourceRefs', 'reviewedAt', ...extras])
  requireValue(states.includes(note.state as string), 'invalid review state'); text(note.reason); strings(note.sourceRefs)
  requireValue(note.sourceRefs.every(ref => sources.has(ref)), 'unresolved evidence/source reference')
  if (note.reviewedAt !== null) {
    requireValue(typeof note.reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(note.reviewedAt), 'review date required')
    const date = new Date(`${note.reviewedAt}T00:00:00Z`)
    requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === note.reviewedAt, 'invalid review date')
  }
  if (['reviewed', 'reviewed-input', 'not-applicable'].includes(note.state as string)) {
    requireValue(note.reviewedAt !== null && note.sourceRefs.length > 0, 'reviewed metadata requires dated sources')
  }
  return note
}
function federalInput(value: unknown) {
  const input = validateAnnualEstimateInput(value)
  requireValue(input.authority === 'US:federal' && input.currency === 'USD' && input.taxYear === 2025, 'only 2025 federal scope supported')
  return input
}

/** Strict metadata validation; declared source hashes/locators never cause a file read. */
export function validateUsFederalCompositionReview(value: unknown, inputValue: AnnualEstimateInput): UsFederalCompositionReview {
  const input = federalInput(inputValue)
  annualJsonDigest(value) // Reject sparse arrays, non-JSON objects and undefined, even in unknown fields.
  const r = object(value)
  exactKeys(r, ['schemaVersion', 'boundary', 'inputSha256', 'rulePackSha256', 'coverage', 'line17', 'line21', 'otherLine23', 'niit'])
  requireValue(r.schemaVersion === 1 && r.boundary === US_FEDERAL_COMPOSITION_CONTRACT.boundary, 'unsupported contract boundary/version')
  digest(r.inputSha256); digest(r.rulePackSha256)
  const sources = new Set(input.sources.map(source => source.id))
  reviewNote(r.coverage, sources, ['reviewed', 'unknown', 'unsupported'])
  for (const field of ['line17', 'line21', 'otherLine23']) {
    const bridge = reviewNote(r[field], sources, ['reviewed-input', 'not-applicable', 'unknown', 'unsupported'], ['amountMinor'])
    if (bridge.state === 'unknown' || bridge.state === 'unsupported') requireValue(bridge.amountMinor === null, 'unknown bridge must remain null')
    else {
      minor(bridge.amountMinor, true)
      if (bridge.state === 'not-applicable') requireValue(bridge.amountMinor === '0', 'not-applicable bridge must explicitly be zero')
    }
  }
  const niit = reviewNote(r.niit, sources, ['reviewed', 'unknown', 'unsupported'], ['placement'])
  requireValue(['excluded-from-other-line23', 'included-in-other-line23', 'unknown'].includes(niit.placement as string), 'invalid NIIT placement')
  return structuredClone(value) as UsFederalCompositionReview
}

/** Recompute components, never trust a supplied result or turn this review into an annual-total. */
export function assessUsFederalComposition(inputValue: unknown, reviewValue: unknown): FederalCompositionReadiness {
  const input = federalInput(inputValue), review = validateUsFederalCompositionReview(reviewValue, input)
  const pack = getAnnualRulePack(2025, input.rulePackId), result = calculateAnnualComponents(input), blockers: string[] = []
  if (review.inputSha256 !== annualInputDigest(input)) blockers.push('stale-input-review')
  if (review.rulePackSha256 !== pack.contentSha256) blockers.push('stale-rule-review')
  if (review.coverage.state !== 'reviewed') blockers.push('coverage-unresolved')
  for (const field of ['line17', 'line21', 'otherLine23'] as const) {
    if (!['reviewed-input', 'not-applicable'].includes(review[field].state)) blockers.push(`${field}-unresolved`)
  }
  if (review.niit.state !== 'reviewed' || review.niit.placement !== 'excluded-from-other-line23') blockers.push('niit-placement-unresolved')
  if (!result.components.some(c => c.id === 'us.regular.ordinary' || c.id === 'us.regular.qdcg')) blockers.push('regular-component-missing')
  if (!result.components.some(c => c.id === 'us.niit')) blockers.push('niit-component-missing')
  for (const component of result.components) {
    if (component.mode !== 'computed') blockers.push(`component-blocked:${component.id}`)
    for (const key of getAnnualRequiredAmounts(input, component.id)) {
      if (input.amounts[key]?.origin === 'assumption') blockers.push(`assumed-base:${key}`)
    }
  }
  return {
    contractId: US_FEDERAL_COMPOSITION_CONTRACT.id,
    contractSha256: annualJsonDigest({ contract: US_FEDERAL_COMPOSITION_CONTRACT, inputSha256: annualInputDigest(input), rulePackSha256: pack.contentSha256, review }),
    status: blockers.length ? 'blocked' : 'contract-ready', calculationScope: 'contract-only', annualTotal: null, comparisonEligible: false,
    blockers: [...new Set(blockers)], components: result.components,
  }
}

function validateHistory(value: unknown): RecordedFederalBoundary {
  annualJsonDigest(value)
  const h = object(value)
  exactKeys(h, ['schemaVersion', 'taxUnitId', 'taxYear', 'authority', 'currency', 'taxType', 'boundary', 'calculationScope', 'filingStatus', 'residency', 'storeRevision', 'storeSha256', 'obligationId', 'basisId', 'basisRevision', 'current', 'evidenceIds', 'liabilityMinor'])
  requireValue(h.schemaVersion === 1, 'unsupported history projection version')
  for (const field of ['taxUnitId', 'authority', 'taxType', 'obligationId', 'basisId']) text(h[field])
  revision(h.taxYear, 1900); requireValue((h.taxYear as number) <= 2200, 'invalid tax year')
  revision(h.storeRevision); revision(h.basisRevision, 1); digest(h.storeSha256); strings(h.evidenceIds)
  requireValue(['USD', 'KRW'].includes(h.currency as string), 'invalid history currency')
  if (h.boundary !== null) text(h.boundary)
  requireValue(['annual-total', 'component'].includes(h.calculationScope as string), 'invalid calculation scope')
  requireValue(['single', 'mfj', 'unknown'].includes(h.filingStatus as string), 'invalid filing profile')
  requireValue(['reviewed-full-year', 'unknown', 'unsupported'].includes(h.residency as string), 'invalid residency review')
  requireValue(typeof h.current === 'boolean', 'current-basis state required')
  if (h.liabilityMinor !== null) minor(h.liabilityMinor, false)
  return structuredClone(value) as RecordedFederalBoundary
}

/** Comparison prerequisites only; broad legacy history scope checks are intentionally untouched. */
export function assessUsFederalComparison(inputValue: unknown, reviewValue: unknown, historyValue: unknown, mappingValue: unknown): FederalComparisonReadiness {
  const input = federalInput(inputValue), composition = assessUsFederalComposition(input, reviewValue), history = validateHistory(historyValue)
  annualJsonDigest(mappingValue)
  const mapping = reviewNote(mappingValue, new Set(history.evidenceIds), ['reviewed', 'unknown', 'unsupported'], ['compositionSha256', 'historySha256'])
  digest(mapping.compositionSha256); digest(mapping.historySha256)
  const historySha256 = annualJsonDigest(history), blockers: string[] = []
  if (composition.status !== 'contract-ready') blockers.push('composition-blocked')
  const expected = {
    taxUnitId: input.taxUnit.id, taxYear: 2025, authority: 'US:federal', currency: 'USD', taxType: 'income',
    boundary: US_FEDERAL_COMPOSITION_CONTRACT.boundary, calculationScope: 'annual-total', filingStatus: input.filingStatus, residency: 'reviewed-full-year',
  }
  for (const key of Object.keys(expected) as (keyof typeof expected)[]) if (history[key] !== expected[key]) blockers.push(`history-scope:${key}`)
  if (!history.current) blockers.push('history-not-current')
  if (!history.evidenceIds.length) blockers.push('history-unevidenced')
  if (history.liabilityMinor === null) blockers.push('history-liability-unknown')
  if (mapping.state !== 'reviewed') blockers.push('mapping-unreviewed')
  if (mapping.compositionSha256 !== composition.contractSha256) blockers.push('stale-composition-mapping')
  if (mapping.historySha256 !== historySha256) blockers.push('stale-history-mapping')
  return {
    status: blockers.length ? 'blocked' : 'contract-ready', calculationScope: 'contract-only', differenceMinor: null, comparisonEligible: false,
    compositionSha256: composition.contractSha256, historySha256, mappingSha256: annualJsonDigest(mappingValue), blockers,
  }
}
