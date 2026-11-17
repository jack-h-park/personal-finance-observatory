import { COLLECTIONS, isIsoDate, live, validateTaxHistory, type Evidence } from '@/lib/domain/taxes/history'
import { validateAnnualEstimateInput } from '@/lib/domain/taxes/annual/contracts'
import { annualJsonDigest } from '@/lib/domain/taxes/annual/rules'
import { assertAnnualSchema } from '@/lib/domain/taxes/annual/schema'
import type { RecordedFederalBoundary } from '@/lib/domain/taxes/annual/us-composition-contract'

export type AnnualHistorySelectionReview = {
  state: 'reviewed' | 'unknown' | 'unsupported'; reason: string; sourceRefs: string[]; reviewedAt: string | null
  obligationId: string; basisKind: 'return' | 'assessment'; basisId: string; basisRevision: number
  taxUnitRevision: number; obligationRevision: number; storeRevision: number; storeSha256: string
  boundary: 'US:federal:1040-line24' | null; filingStatus: 'single' | 'mfj' | 'unknown'
  residency: 'reviewed-full-year' | 'unknown' | 'unsupported'
}
export type AnnualHistorySelection = {
  status: 'selected' | 'blocked'; storeRevision: number; storeSha256: string
  recorded: RecordedFederalBoundary | null; evidence: Evidence[]; blockers: string[]
}
const text = { type: 'string', minLength: 1 }
const properties = {
  state: { enum: ['reviewed', 'unknown', 'unsupported'] }, reason: text,
  sourceRefs: { type: 'array', uniqueItems: true, items: text }, reviewedAt: { anyOf: [text, { type: 'null' }] },
  obligationId: text, basisKind: { enum: ['return', 'assessment'] }, basisId: text,
  basisRevision: { type: 'integer', minimum: 1 }, taxUnitRevision: { type: 'integer', minimum: 1 }, obligationRevision: { type: 'integer', minimum: 1 },
  storeRevision: { type: 'integer', minimum: 0 }, storeSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  boundary: { enum: ['US:federal:1040-line24', null] }, filingStatus: { enum: ['single', 'mfj', 'unknown'] },
  residency: { enum: ['reviewed-full-year', 'unknown', 'unsupported'] },
}

/** Current explicit basis selection, not chronological guessing or settlement-completeness review. */
export function selectAnnualFederalHistory(storeValue: unknown, inputValue: unknown, reviewValue: unknown): AnnualHistorySelection {
  annualJsonDigest(storeValue); annualJsonDigest(inputValue); annualJsonDigest(reviewValue)
  const store = validateTaxHistory(structuredClone(storeValue)), input = validateAnnualEstimateInput(structuredClone(inputValue))
  const copy = structuredClone(reviewValue)
  assertAnnualSchema(copy, { type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
  const review = copy as AnnualHistorySelectionReview
  if (review.reviewedAt !== null && !isIsoDate(review.reviewedAt)) throw new Error('Invalid selection review date')
  if (!Number.isSafeInteger(store.revision) || COLLECTIONS.some(c => store[c].some(r => !Number.isSafeInteger(r.recordRevision))) || store.changes.some(c => !Number.isSafeInteger(c.storeRevision))) throw new Error('Unsafe history version')
  const storeSha256 = annualJsonDigest(store)
  const finish = (blockers: string[], recorded: RecordedFederalBoundary | null = null, evidence: Evidence[] = []): AnnualHistorySelection => ({
    status: blockers.length ? 'blocked' : 'selected', storeRevision: store.revision, storeSha256, recorded, evidence, blockers,
  })
  if (review.storeRevision !== store.revision || review.storeSha256 !== storeSha256) return finish(['history-review-stale'])
  if (review.state !== 'reviewed' || !review.reviewedAt || !review.sourceRefs.length || review.boundary === null || review.filingStatus === 'unknown' || review.residency !== 'reviewed-full-year') return finish(['selection-review-unresolved'])
  const obligation = live(store.obligations).find(r => r.id === review.obligationId)
  if (!obligation) return finish(['obligation-unavailable'])
  const unit = live(store.taxUnits).find(r => r.id === obligation.taxUnitId)
  if (!unit) return finish(['tax-unit-unavailable'])
  if (input.authority !== 'US:federal' || input.currency !== 'USD' || obligation.authority !== 'US:federal' || obligation.currency !== 'USD' || obligation.taxType !== 'income' || obligation.taxYear !== 2025 || obligation.taxUnitId !== input.taxUnit.id || review.filingStatus !== input.filingStatus) return finish(['history-scope-mismatch'])
  if (unit.kind !== input.taxUnit.kind || annualJsonDigest([...unit.ownerIds].sort()) !== annualJsonDigest([...input.taxUnit.ownerIds].sort())) return finish(['tax-unit-membership-mismatch'])
  if (review.taxUnitRevision !== unit.recordRevision) return finish(['tax-unit-review-stale'])
  if (review.obligationRevision !== obligation.recordRevision) return finish(['obligation-review-stale'])
  const basis = obligation.effectiveBasis
  if (!basis) return finish(['basis-unavailable'])
  if (basis.kind !== review.basisKind || basis.id !== review.basisId || basis.recordRevision !== review.basisRevision) return finish(['basis-review-stale'])
  const candidate = basis.kind === 'return'
    ? live(store.returns).find(r => r.id === basis.id && r.obligationId === obligation.id)
    : live(store.assessments).find(r => r.id === basis.id && r.obligationId === obligation.id)
  if (!candidate) return finish(['basis-unavailable'])
  if (candidate.recordRevision !== basis.recordRevision) return finish(['basis-review-stale'])
  if ('status' in candidate && candidate.status !== 'accepted') return finish(['basis-unusable'])
  if (basis.kind === 'return') {
    for (const row of live(store.returns).filter(r => r.status === 'accepted' && r.obligationId === obligation.id && r.id !== basis.id)) {
      let previous = row.supersedesId
      while (previous) {
        if (previous === basis.id) return finish(['basis-superseded'])
        previous = store.returns.find(r => r.id === previous)?.supersedesId
      }
    }
  }
  if (!candidate.evidenceIds.length || !basis.evidenceIds.length) return finish(['evidence-record-unavailable'])
  const ids = [...new Set([...candidate.evidenceIds, ...basis.evidenceIds])].sort()
  const evidence = ids.map(id => live(store.evidence).find(r => r.id === id))
  if (evidence.some(r => !r)) return finish(['evidence-record-unavailable'])
  if (!review.sourceRefs.every(id => ids.includes(id))) return finish(['selection-review-evidence-unavailable'])
  return finish([], {
    schemaVersion: 1, taxUnitId: unit.id, taxYear: 2025, authority: 'US:federal', currency: 'USD', taxType: 'income',
    boundary: review.boundary, calculationScope: 'annual-total', filingStatus: review.filingStatus, residency: review.residency,
    storeRevision: store.revision, storeSha256, obligationId: obligation.id, basisId: basis.id, basisRevision: basis.recordRevision,
    current: true, evidenceIds: ids, liabilityMinor: candidate.liability.minor,
  }, evidence as Evidence[])
}
