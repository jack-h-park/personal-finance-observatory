import { Card, TextLink, Note } from '@/components/ui'
import { DataTable } from '@/components/DataTable'
import { getPageCopy } from '@/lib/ui-copy'
import { fmtNumber } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import type { SupplementaryFreshnessGroup } from '@/lib/application/coverage-freshness-summary'
import type { CoverageSummary } from '@/lib/application/account-coverage-summary'
import type { AccountCoverageStatus } from '@/lib/adapters/portfolio-db'

const statuses: AccountCoverageStatus[] = ['action_needed', 'missing', 'unconfirmed', 'due_soon', 'current']

export function AccountCoverageSummary({ summary, language, freshness }: { summary: CoverageSummary; language: Language; freshness?: SupplementaryFreshnessGroup[] }) {
  const copy = getPageCopy('coverageSummary', language)
  return <section id="coverage-overview" aria-label={copy.title} className="mb-5">
    <Card title={copy.title}>
      <p className="mb-3 text-label leading-relaxed text-ink-2">{copy.notice}</p>
      <DataTable caption={copy.title} rows={summary.groups} getRowKey={row => row.id} columns={[
        { key: 'group', label: copy.group, render: row => <div>
          <TextLink href={row.id === 'investments' ? '#account-coverage' : '#supplementary-coverage'}>{copy.groups[row.id]}</TextLink>
          <div className="mt-1 text-label text-ink-3">{row.rows ? copy.rows(fmtNumber(row.rows)) : copy.empty}</div>
        </div> },
        ...statuses.map(status => ({ key: status, label: copy.statuses[status], align: 'right' as const,
          render: (row: CoverageSummary['groups'][number]) => <span className="tabular-nums">{fmtNumber(row.statuses[status])}</span> })),
        { key: 'historyGaps', label: copy.historyGaps, align: 'right', render: row => <span className="tabular-nums">{fmtNumber(row.historyGaps)}</span> },
      ]} />
      <Note spacing="above-2">{copy.gapNotice}</Note>
      {freshness ? <section aria-label={copy.freshnessTitle} className="mt-4">
        <h3 className="mb-2 font-medium">{copy.freshnessTitle}</h3>
        <p className="mb-3 text-label leading-relaxed text-ink-2">{copy.freshnessNotice}</p>
        <DataTable caption={copy.freshnessTitle} rows={freshness} getRowKey={row => row.id} columns={[
          { key: 'group', label: copy.group, render: row => <div>
            <TextLink href="#supplementary-coverage">{copy.groups[row.id]}</TextLink>
            <div className="mt-1 text-label text-ink-3">{row.rows ? copy.rows(fmtNumber(row.rows)) : copy.empty}</div>
          </div> },
          ...statuses.map(status => ({ key: status, label: copy.statuses[status], align: 'right' as const,
            render: (row: SupplementaryFreshnessGroup) => <span className="tabular-nums">{fmtNumber(row.statuses[status])}</span> })),
          { key: 'unavailable', label: copy.unavailable, align: 'right', render: row => <span className="tabular-nums">{fmtNumber(row.unavailable)}</span> },
          { key: 'historyGaps', label: copy.historyGaps, align: 'right', render: row => <span className="tabular-nums">{fmtNumber(row.historyGaps)}</span> },
        ]} />
      </section> : null}
      <div className="mt-3 text-label"><TextLink href="/accounts#inventory-review">{copy.inventory}</TextLink></div>
      <Note spacing="above-2">{copy.inventoryNotice}</Note>
    </Card>
  </section>
}
