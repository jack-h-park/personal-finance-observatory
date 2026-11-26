import { Note, TextLink } from '@/components/ui'
import { SnapshotTaxEstimates } from '@/components/SnapshotTaxEstimates'
import { todayLosAngeles } from '@/lib/cli/common'
import type { HoldingsForSale } from '@/lib/domain/taxes/holding-sale'
import { INVESTMENT_TAX_YEARS, readInvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import { getHoldingsForSale, getRealizedLots } from '@/lib/adapters/portfolio-db'
import { summarizeRealizedTaxInputs, type RealizedTaxInputs } from '@/lib/application/realized-tax-inputs'
import { readForeignCreditEvidence } from '@/lib/adapters/foreign-credit-evidence-store'
import { projectForeignCreditRecords, type ForeignCreditRecord } from '@/lib/application/foreign-credit-evidence'
import { readTaxHistory } from '@/lib/adapters/tax-history-store'
import { snapshotTaxPayments } from '@/lib/application/snapshot-tax-payments'
import { formatMoney } from '@/lib/domain/taxes/reconcile'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'
import { labelFor } from '@/lib/ui-copy/label'
import { snapshotTax } from '@/lib/ui-copy/pages/snapshotTax'

export function SnapshotTaxContext({ language }: { language: Language }) {
  const copy = snapshotTax[language]
  const history = getPageCopy('taxHistory', language)
  const today = todayLosAngeles()
  const currentYear = Number(today.slice(0, 4))
  const saleYear = readInvestmentTaxYear(String(currentYear))
  const defaultYear = INVESTMENT_TAX_YEARS.findLast(year => year <= currentYear) ?? INVESTMENT_TAX_YEARS[0]
  let payments: ReturnType<typeof snapshotTaxPayments> | null = null
  let creditRecords: ForeignCreditRecord[] | null = null
  try {
    const store = readTaxHistory()
    payments = snapshotTaxPayments(store)
    creditRecords = projectForeignCreditRecords(store, readForeignCreditEvidence())
  } catch {
    // An unreadable history or credit evidence file remains distinct from an empty one.
  }

  let recorded: RealizedTaxInputs | null = null
  let saleRecorded: RealizedTaxInputs | null = null
  try {
    const lots = getRealizedLots({ includeGold: true })
    recorded = summarizeRealizedTaxInputs(lots, 2026)
    if (saleYear !== undefined) {
      saleRecorded = summarizeRealizedTaxInputs(lots.filter(lot => lot.sold_date != null && lot.sold_date <= today), saleYear)
    }
  } catch {
    // The manual estimate stays available when the realized ledger cannot be read.
  }
  let sales: HoldingsForSale | null = null
  if (saleYear !== undefined) {
    try {
      sales = getHoldingsForSale(today)
    } catch {
      // Dated quotes and open lots are required for the automatic sale comparison.
    }
  }

  return (
    <details className="mt-3 rounded-md border border-line-subtle p-3">
      <summary className="min-h-6 cursor-pointer text-body font-medium">{copy.title}</summary>
      <div className="mt-3 space-y-4">
        <div className="space-y-2">
          <h3 className="text-body font-medium">{copy.payment}</h3>
          {payments?.length ? (
            <>
              <Note>{copy.paymentScope}</Note>
              <ul className="space-y-2">
                {payments.map(row => (
                  <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <TextLink href={`/taxes/records/${encodeURIComponent(row.id)}`}>
                      {copy.year(row.year)} · {row.unit} · {labelFor(history.authorities, row.authority)}
                    </TextLink>
                    {row.principal != null ? (
                      <span className="text-body tabular-nums">{formatMoney({ currency: row.currency, minor: row.principal })}</span>
                    ) : row.reportedMinor != null ? (
                      <span className="text-body tabular-nums">
                        {formatMoney({ currency: row.currency, minor: row.reportedMinor })}
                        <span className="ml-2 text-caption text-ink-2">{copy.paymentReported}</span>
                      </span>
                    ) : <span className="text-body">{copy.paymentUnknown}</span>}
                  </li>
                ))}
              </ul>
            </>
          ) : <Note>{payments ? copy.paymentEmpty : copy.paymentUnavailable}</Note>}
          <TextLink href="/taxes/history">{copy.history}</TextLink>
        </div>
        <SnapshotTaxEstimates language={language} defaultYear={defaultYear} recorded={recorded} saleYear={saleYear} sales={sales} saleRecorded={saleRecorded} creditRecords={creditRecords} payments={payments} />
      </div>
    </details>
  )
}
