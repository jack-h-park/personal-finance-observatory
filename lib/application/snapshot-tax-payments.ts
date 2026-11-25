import { getAnnualTaxSummary } from './annual-tax-summary'
import type { TaxHistoryStoreV1 } from '@/lib/domain/taxes/history'

/** Only obligations explicitly recorded as capital-gains tax identify payments in that category. */
export function snapshotTaxPayments(store: TaxHistoryStoreV1) {
  return getAnnualTaxSummary(store).years.flatMap(({ rows }) => rows.flatMap(row =>
    row.taxType === 'capital-gains' ? [{
      id: row.id,
      year: row.taxYear,
      unit: row.taxUnitId,
      authority: row.authority,
      currency: row.currency,
      principal: row.payments?.principal ?? null,
    }] : [],
  ))
}
