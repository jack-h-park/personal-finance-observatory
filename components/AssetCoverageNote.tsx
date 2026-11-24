import React from 'react'
import { Note } from '@/components/ui'
import Link from 'next/link'
import { CardRow } from '@/components/layout'
import type { NetWorth } from '@/lib/net-worth'
import type { Language } from '@/lib/i18n'
import type { AssetCoverageReview } from '@/lib/application/asset-coverage'
import { getPageCopy } from '@/lib/ui-copy'

/**
 * The full coverage review: valuation dates, source coverage counts, statement period evidence
 * and the caveats that go with them. It lives on /health (`#health-asset-coverage`), opened;
 * the pages that show a total carry `CoverageLine`, one line that links here.
 */
export function AssetCoverageNote({ summary, language, review, open = false }: { summary: NetWorth; language: Language; review?: AssetCoverageReview; open?: boolean }) {
  const copy = getPageCopy('assetCoverage', language)
  const range = (dates: { oldest: string | null; newest: string | null; undated: number } | null | undefined) => {
    if (!dates) return copy.unknown
    const known = dates.oldest ? (dates.oldest === dates.newest ? dates.oldest : `${dates.oldest} – ${dates.newest}`) : copy.unknown
    return dates.undated ? `${known} · ${copy.undated(dates.undated)}` : known
  }
  const statuses = (counts: AssetCoverageReview['accounts']) => counts
    ? copy.statuses(counts.current, counts.dueSoon, counts.actionNeeded, counts.missing) : copy.unknown
  const fields = [
    [copy.cash, range(review?.cash)],
    ...(['market', 'snapshot', 'cost'] as const).map(method => [copy[method], range(summary.valuationDates?.[method])]),
    [copy.fx, summary.fxAsOf ?? copy.unknown],
  ]
  return (
    <section aria-label={copy.title} className="mt-3 space-y-3 text-body text-ink-2">
      <p>{copy.boundary(summary.coverage?.omittedAssetCount ?? 0)}</p>
      <details open={open} className="rounded-md border border-line-subtle p-3">
        <summary className="min-h-6 cursor-pointer font-medium leading-6 text-ink">{copy.title}</summary>
        <CardRow columns={2} spacing="none" className="mt-3">
          <div className="space-y-2">
            <h3 className="text-caption font-medium">{copy.balances}</h3>
            <dl className="space-y-2">
              {fields.map(([label, value]) => <div key={label}><dt className="text-label text-ink-3">{label}</dt><dd className="tabular-nums">{value}</dd></div>)}
            </dl>
            {review ? <Note>{copy.cashCounts(review.cash.nonzero, review.cash.zero)}</Note> : null}
          </div>
          <div className="space-y-2">
            <h3 className="text-caption font-medium">{copy.source}</h3>
            <Note>{copy.scope}</Note>
            <dl className="space-y-2">
              <div><dt className="text-label text-ink-3">{copy.accounts}</dt><dd>{statuses(review?.accounts ?? null)}</dd></div>
              <div><dt className="text-label text-ink-3">{copy.supplementary}</dt><dd>{statuses(review?.supplementary ?? null)}</dd></div>
              <div><dt className="text-label text-ink-3">{copy.periods}</dt><dd className="tabular-nums">{range(review?.statementPeriods)}{review?.statementPeriodCounts ? <span className="block">{copy.periodCounts(review.statementPeriodCounts.declared, review.statementPeriodCounts.conflicting, review.statementPeriodCounts.unconfirmed)}</span> : null}</dd></div>
              <div><dt className="text-label text-ink-3">{copy.checks}</dt><dd>{review?.failedChecks ?? copy.unknown}</dd></div>
              <div><dt className="text-label text-ink-3">{copy.files}</dt><dd>{review?.files ? copy.fileCounts(review.files.fresh, review.files.stale, review.files.drift, review.files.missing) : copy.unknown}</dd></div>
            </dl>
            <Note>{copy.periodHint}</Note>
            {review?.statementEvidence?.length ? <details className="mt-2">
              <summary className="min-h-6 cursor-pointer text-label font-medium leading-6">{copy.evidenceTitle}</summary>
              <Note spacing="above-2">{copy.evidenceHint}</Note>
              <ul className="mt-2 space-y-2">
                {review.statementEvidence.map((entry, index) => <li key={index} className="text-label break-words">
                  <span className="font-medium">{entry.account ?? copy.unknown}</span>{' · '}{copy.periodState(entry.state)}
                  {entry.sources.length ? <ul className="mt-1 space-y-1 pl-3">
                    {entry.sources.map(source => <li key={source.source}>{source.source}{' · '}{copy.page(source.page)}{' · '}<span className="tabular-nums">{source.start} – {source.end}</span></li>)}
                  </ul> : null}
                </li>)}
              </ul>
            </details> : null}
          </div>
        </CardRow>
        <Note spacing="above-3">{copy.freshnessHint}</Note>
        <Note spacing="above-2">{copy.history}</Note>
        <nav aria-label={copy.title} className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-label">
          {([['/health', copy.healthLink], ['/accounts', copy.accountsLink], ['/data-ops', copy.dataLink], ['/reconciliation', copy.reconciliationLink]] as const).map(([href, label]) => <Link key={href} href={href} className="inline-flex min-h-6 items-center underline underline-offset-4">{label}</Link>)}
        </nav>
      </details>
    </section>
  )
}
