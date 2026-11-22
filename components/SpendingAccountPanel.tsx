import { DataTable } from '@/components/DataTable'
import { Callout, Card, Note, TextLink } from '@/components/ui'
import { loadSpendingPilot } from '@/lib/adapters/spending-view'
import { summarizeSpendingAccounts } from '@/lib/domain/spending-view'
import { localeFor } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'

export function SpendingAccountPanel({ language, mode }: { language: Language; mode: 'coverage' | 'review' }) {
  const pilot = loadSpendingPilot()
  if (pilot.status === 'disabled') return null
  const copy = getPageCopy('spending', language)
  const reviewMode = mode === 'review'
  const title = reviewMode ? copy.spendingReview : copy.spendingCoverage
  const id = reviewMode ? 'spending-review' : 'spending-coverage'
  if (pilot.status === 'unavailable') {
    return <Card title={title} id={id} className="mb-5">
      <Callout tone="danger" role="alert">{copy.unavailable} {copy.unavailableHint}</Callout>
    </Card>
  }
  const { snapshot } = pilot
  const accounts = pilot.accounts[language]
  const coverage = summarizeSpendingAccounts(snapshot)
  const rows = reviewMode ? coverage.filter(row => row.heldCount > 0) : coverage
  const count = new Intl.NumberFormat(localeFor(language)).format
  const viewAccount = (accountId: string, anchor: string) =>
    '/spending?' + new URLSearchParams({ account: accountId }).toString() + '#' + anchor
  return (
    <Card title={title} id={id} className="mb-5" action={
      <TextLink href={reviewMode ? '/accounts#spending-coverage' : '/data-ops#spending-review'}>
        {reviewMode ? copy.viewCoverage : copy.spendingReview}
      </TextLink>
    }>
      <Note size="caption" spacing="below-3">{reviewMode ? copy.holdsHint : copy.coverageHint}</Note>
      {snapshot.reviewIncomplete ? (
        <Callout tone="warning" role="status" spacing="mb-3">{copy.incomplete}</Callout>
      ) : null}
      <DataTable rows={rows} caption={title} minWidth="39rem"
        getRowKey={row => `${row.accountId}:${row.currency}`}
        emptyMessage={reviewMode ? (snapshot.reviewIncomplete ? copy.unknownHolds : copy.allClear) : copy.noAccountRows}
        columns={[
          { key: 'account', label: copy.account, render: row => (
            <>
              <TextLink href={viewAccount(row.accountId, reviewMode ? 'spending-holds' : 'spending-transactions')}>
                {accounts.get(row.accountId)?.label ?? row.accountId}
              </TextLink>
              {accounts.get(row.accountId)?.note ? <Note size="caption">{accounts.get(row.accountId)?.note}</Note> : null}
            </>
          ) },
          { key: 'first', label: copy.first, nowrap: true, render: row => <span className="font-mono">{row.first}</span> },
          { key: 'last', label: copy.last, nowrap: true, render: row => <span className="font-mono">{row.last}</span> },
          { key: 'count', label: copy.count, align: 'right', render: row => <span className="font-mono">{count(row.count)}</span> },
          { key: 'heldCount', label: copy.reviewStatus, nowrap: true, render: row => row.heldCount > 0 ? (
            <TextLink href={viewAccount(row.accountId, 'spending-holds')}>{copy.heldCount(count(row.heldCount))}</TextLink>
          ) : snapshot.reviewIncomplete ? copy.unknownHolds : copy.noHolds },
        ]}
      />
    </Card>
  )
}
