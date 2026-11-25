import { Note, TextLink } from '@/components/ui'
import { SnapshotTaxEstimates } from '@/components/SnapshotTaxEstimates'
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
  let payments: ReturnType<typeof snapshotTaxPayments> | null = null
  try {
    payments = snapshotTaxPayments(readTaxHistory())
  } catch {
    // An unreadable history is distinct from a history without investment payments.
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
                    <span className="text-body tabular-nums">{row.principal == null ? copy.paymentUnknown : formatMoney({ currency: row.currency, minor: row.principal })}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <Note>{payments ? copy.paymentEmpty : copy.paymentUnavailable}</Note>}
          <TextLink href="/taxes/history">{copy.history}</TextLink>
        </div>
        <SnapshotTaxEstimates language={language} />
      </div>
    </details>
  )
}
