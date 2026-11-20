import { live, type TaxHistoryStoreV1 } from '@/lib/domain/taxes/history'

/** Statement facts only: never select a liability basis, sum returns, or create cash events. */
export function getReturnReportedAmounts(store: TaxHistoryStoreV1, obligationId: string, includeArchived = false) {
  const evidence = new Set(live(store.evidence).map(row => row.id))
  const linked = (ids: string[]) => ids.length > 0 && ids.every(id => evidence.has(id))
  return store.returns.filter(row => row.obligationId === obligationId && (includeArchived || !row.deleted)).map(row => {
    const facts = row.reportedAmounts
    const usable = !!facts && linked(row.evidenceIds) && linked(facts.evidenceIds)
    return {
      archived: !!row.deleted,
      id: row.id, recordRevision: row.recordRevision, status: row.status,
      supersedesId: row.supersedesId ?? null,
      prepaymentsMinor: usable ? facts.prepayments?.minor ?? null : null,
      refundRequestedMinor: usable ? facts.refundRequested?.minor ?? null : null,
      evidenceIds: [...new Set([...row.evidenceIds, ...(facts?.evidenceIds ?? [])])],
      evidenceState: !facts ? 'not-recorded' as const : usable ? 'linked' as const : 'unavailable' as const,
    }
  })
}
export type ReturnReportedAmountRow = ReturnType<typeof getReturnReportedAmounts>[number]
