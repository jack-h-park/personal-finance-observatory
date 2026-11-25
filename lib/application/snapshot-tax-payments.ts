import { getAnnualTaxSummary } from './annual-tax-summary'
import { live, type TaxHistoryStoreV1 } from '@/lib/domain/taxes/history'

/** Only obligations explicitly recorded as capital-gains tax identify payments in that category. */
export function snapshotTaxPayments(store: TaxHistoryStoreV1) {
  const evidence = new Set(live(store.evidence).map(row => row.id))
  const returns = live(store.returns).filter(row => row.status !== 'rejected')
  const superseded = new Set(returns.map(row => row.supersedesId))
  const currentReturns = returns.filter(row => !superseded.has(row.id))
  return getAnnualTaxSummary(store).years.flatMap(({ rows }) => rows.filter(row => row.taxType === 'capital-gains').map(row => {
    const [candidate, other] = currentReturns.filter(item => item.obligationId === row.id)
    const principal = row.payments?.principal ?? null
    const reportedMinor = principal == null && candidate && !other && candidate.liability.currency === row.currency
      && candidate.evidenceIds.length > 0 && candidate.evidenceIds.every(id => evidence.has(id))
      ? candidate.liability.minor : null
    return {
      id: row.id,
      year: row.taxYear,
      unit: row.taxUnitId,
      authority: row.authority,
      currency: row.currency,
      principal,
      reportedMinor,
    }
  }))
}
