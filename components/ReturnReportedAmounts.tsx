import React from 'react'
import Link from 'next/link'
import { Note } from '@/components/ui'
import { getPageCopy } from '@/lib/ui-copy'
import { formatMoney } from '@/lib/domain/taxes/reconcile'
import type { Currency } from '@/lib/domain/taxes/history'
import type { ReturnReportedAmountRow } from '@/lib/application/return-reported-amounts'
import type { Language } from '@/lib/i18n'

export function ReturnReportedAmounts({ rows, obligationId, currency, language }: {
  rows: ReturnReportedAmountRow[]; obligationId: string; currency: Currency; language: Language
}) {
  const copy = getPageCopy('annualTaxSummary', language)
  const historyCopy = getPageCopy('taxHistory', language)
  const record = `/taxes/records/${encodeURIComponent(obligationId)}`
  const amount = (minor: string | null) => minor === null ? copy.none : formatMoney({ currency, minor })
  return <section aria-label={copy.reportedTitle} className="mt-4 border-t border-line-subtle pt-3">
    <p className="text-body font-medium">{copy.reportedTitle}</p>
    <Note spacing="above-1">{copy.reportedNote}</Note>
    {!rows.length ? <Note spacing="above-1">{copy.noReturns}</Note> : null}
    {rows.map(row => <div key={row.id} className="mt-3">
      <p className="break-words text-caption">{copy.version(row.id, row.recordRevision)} · {copy.filingStates[row.status]}{row.archived ? ` · ${historyCopy.archived}` : ''}</p>
      {row.supersedesId ? <Note>{historyCopy.supersedes} · {row.supersedesId}</Note> : null}
      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-48"><dt className="text-label text-ink-3">{copy.prepayments}</dt><dd className="text-body tabular-nums">{amount(row.prepaymentsMinor)}</dd></div>
        <div className="min-w-0 flex-1 basis-48"><dt className="text-label text-ink-3">{copy.requestedRefund}</dt><dd className="text-body tabular-nums">{amount(row.refundRequestedMinor)}</dd></div>
      </dl>
      {row.evidenceState !== 'linked' ? <Note spacing="above-1">{row.evidenceState === 'not-recorded' ? copy.factsMissing : copy.factsEvidenceMissing}</Note> : null}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-label">
        <Link className="inline-flex min-h-6 items-center underline" href={`${record}#version-${encodeURIComponent(row.id)}`}>{copy.versionLink}</Link>
        {row.evidenceIds.map(id => <Link key={id} className="inline-flex min-h-6 items-center underline" href={`${record}#evidence-${encodeURIComponent(id)}`}>{copy.evidenceLink} · {id}</Link>)}
      </div>
    </div>)}
  </section>
}
