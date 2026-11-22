import { notFound } from 'next/navigation'
import { DataTable } from '@/components/DataTable'
import { CardRow } from '@/components/layout'
import { PageHeader } from '@/components/PageHeader'
import { Button, Callout, Card, MetricField, Note, TextLink } from '@/components/ui'
import { loadSpendingPilot } from '@/lib/adapters/spending-view'
import { projectSpending, type SpendingHold } from '@/lib/domain/spending-view'
import { EMPTY_VALUE, localeFor } from '@/lib/format'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeName, routeSection } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/spending')

const base = '/spending'
const pageSize = 25
const selectStyle = 'h-11 w-full rounded-md border border-line bg-card px-3 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info'

export default async function SpendingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pilot = loadSpendingPilot()
  if (pilot.status === 'disabled') notFound()
  const language = await getLanguage()
  const copy = getPageCopy('spending', language)
  const header = (
    <PageHeader
      eyebrow={routeSection('/spending', language)}
      title={routeName('/spending', language)}
      subtitle={<>{copy.subtitle}<span className="mt-1 block text-caption text-ink-3">{copy.pilot}</span></>}
      autoRefresh={false}
    />
  )
  if (pilot.status === 'unavailable') {
    return <>{header}<Callout tone="danger" role="alert"><p>{copy.unavailable}</p><p>{copy.unavailableHint}</p></Callout></>
  }

  const { snapshot } = pilot
  const accounts = pilot.accounts[language]
  const params = await searchParams
  const param = (key: string) => typeof params[key] === 'string' ? params[key] : undefined
  const { account, month, months, rows, coverage, holds, totals } =
    projectSpending(snapshot, { account: param('account'), month: param('month') })
  const unlistedMonth = month && !months.includes(month)
  const locale = localeFor(language)
  const count = new Intl.NumberFormat(locale).format
  const money = {
    USD: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    KRW: new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW' }),
  }
  const amount = (minor: number, currency: keyof typeof money) => money[currency].format(minor / (currency === 'USD' ? 100 : 1))
  const name = (id: string) => accounts.get(id)?.label ?? id
  const lastPage = Math.max(1, Math.ceil(rows.length / pageSize))
  const requestedPage = param('page')
  const page = requestedPage && /^\d{1,6}$/.test(requestedPage) ? Math.max(1, Math.min(Number(requestedPage), lastPage)) : 1
  const shown = rows.slice((page - 1) * pageSize, page * pageSize)
  const pageHref = (next: number) => {
    const query = new URLSearchParams({ page: String(next) })
    if (account) query.set('account', account)
    if (month) query.set('month', month)
    return base + '?' + query.toString() + '#spending-transactions'
  }
  const byAccount = new Map<string, SpendingHold[]>()
  for (const hold of holds) {
    const group = byAccount.get(hold.accountId) ?? []
    group.push(hold)
    byAccount.set(hold.accountId, group)
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        <Card>
          <form action={base} method="get" className="flex flex-wrap items-end gap-3">
            <label className="min-w-36 flex-1 space-y-1 text-caption text-ink-2">
              <span>{copy.month}</span>
              <select className={selectStyle} name="month" defaultValue={month ?? ''}>
                <option value="">{copy.allMonths}</option>
                {unlistedMonth ? <option value={month}>{month}</option> : null}
                {months.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="min-w-48 flex-1 space-y-1 text-caption text-ink-2">
              <span>{copy.account}</span>
              <select className={selectStyle} name="account" defaultValue={account ?? ''}>
                <option value="">{copy.allAccounts}</option>
                {snapshot.coverage.map(item => <option key={item.accountId} value={item.accountId}>{name(item.accountId)}</option>)}
              </select>
            </label>
            <Button type="submit" className="min-h-11">{copy.apply}</Button>
            {month || account ? <TextLink href={base} className="flex min-h-11 items-center">{copy.reset}</TextLink> : null}
          </form>
        </Card>

        <CardRow columns={2} spacing="none">
          {(['USD', 'KRW'] as const).map(currency => {
            const total = totals[currency]
            const visible = rows.some(row => row.currency === currency)
            return (
              <Card key={currency} title={currency} id={`spending-${currency.toLowerCase()}`}>
                <MetricField label={copy.net} size="metric" value={visible ? amount(total.net, currency) : EMPTY_VALUE} />
                {visible ? (
                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-caption">
                    <div><dt className="text-ink-2">{copy.purchases}</dt><dd className="font-mono tabular-nums">{amount(total.purchase, currency)}</dd></div>
                    <div><dt className="text-ink-2">{copy.refunds}</dt><dd className="font-mono tabular-nums">{amount(total.refund, currency)}</dd></div>
                  </dl>
                ) : <p className="mt-3 text-caption text-ink-2">{copy.noCurrency}</p>}
              </Card>
            )
          })}
        </CardRow>
        <p className="text-caption text-ink-2">{copy.totalsHint}</p>

        <Card title={copy.coverage} id="spending-coverage"
          action={<TextLink href="/accounts#spending-coverage">{copy.viewCoverage}</TextLink>}>
          <p className="mb-3 text-caption text-ink-2">{copy.coverageHint}</p>
          <DataTable rows={coverage} caption={copy.coverage} minWidth="32rem" emptyMessage={copy.noAccountRows}
            getRowKey={row => row.accountId}
            columns={[
              { key: 'account', label: copy.account, render: row => (
                <div>
                  <span className="font-medium">{name(row.accountId)}</span>
                  {accounts.get(row.accountId)?.note ? <Note size="caption">{accounts.get(row.accountId)?.note}</Note> : null}
                </div>
              ) },
              { key: 'first', label: copy.first, nowrap: true, render: row => <span className="font-mono">{row.first}</span> },
              { key: 'last', label: copy.last, nowrap: true, render: row => <span className="font-mono">{row.last}</span> },
              { key: 'count', label: copy.count, align: 'right', render: row => <span className="font-mono">{count(row.count)}</span> },
            ]}
          />
        </Card>

        <Card title={copy.holds} id="spending-holds" issues={{ count: holds.length }}
          action={<TextLink href="/data-ops#spending-review">{copy.spendingReview}</TextLink>}>
          <p className="text-caption text-ink-2">{copy.holdsHint}</p>
          {snapshot.reviewIncomplete ? <p role="status" className="mt-2 text-caption text-warning">{copy.incomplete}</p> : null}
          {holds.some(row => row.date === null) ? <p className="mt-2 text-caption text-ink-2">{copy.unknownDates}</p> : null}
          {holds.length === 0 && !snapshot.reviewIncomplete ? <p className="mt-3 text-body">{copy.allClear}</p> : null}
          <div className="mt-2 divide-y divide-line-subtle">
            {[...byAccount].map(([id, items]) => (
              <details key={id} open={items.length <= 5} className="py-1">
                <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info">
                  <span className="font-medium">{name(id)}</span>
                  <span className="ml-2 text-caption text-ink-2">{copy.heldCount(count(items.length))}</span>
                </summary>
                <DataTable rows={items} caption={name(id)} minWidth="35rem"
                  getRowKey={row => `${row.source}:${row.row}:${row.reason}`}
                  columns={[
                    { key: 'date', label: copy.date, nowrap: true, render: row => row.date ?? EMPTY_VALUE },
                    { key: 'source', label: copy.source, render: row => copy.sources[row.source] },
                    { key: 'row', label: copy.row, align: 'right', render: row => count(row.row) },
                    { key: 'reason', label: copy.reason, render: row => copy.reasons[row.reason] ?? copy.unknownReason },
                    { key: 'amount', label: copy.amount, align: 'right', nowrap: true,
                      render: row => row.currency && row.amountMinor !== null ? amount(row.amountMinor, row.currency) : EMPTY_VALUE },
                  ]}
                />
              </details>
            ))}
          </div>
        </Card>

        <Card title={copy.transactions} id="spending-transactions">
          <p className="mb-3 text-caption text-ink-2">{copy.pageSummary(count(shown.length), count(rows.length))}</p>
          <DataTable rows={shown} caption={copy.transactions} minWidth="37rem" emptyMessage={copy.noRows}
            getRowKey={row => row.id}
            columns={[
              { key: 'activityDate', label: copy.activityDate, nowrap: true, render: row => <span className="font-mono">{row.activityDate}</span> },
              { key: 'accountId', label: copy.account, render: row => name(row.accountId) },
              { key: 'description', label: copy.description },
              { key: 'kind', label: copy.type, render: row => copy.kinds[row.kind] },
              { key: 'amount', label: copy.amount, nowrap: true, align: 'right',
                render: row => <span className="font-mono">{amount(row.amountMinor, row.currency)}</span> },
            ]}
          />
          {lastPage > 1 ? (
            <div className="mt-3 flex flex-wrap gap-4">
              {page > 1 ? <TextLink href={pageHref(page - 1)} className="flex min-h-8 items-center">{copy.previous}</TextLink> : null}
              {page < lastPage ? <TextLink href={pageHref(page + 1)} className="flex min-h-8 items-center">{copy.next}</TextLink> : null}
            </div>
          ) : null}
        </Card>
      </div>
    </>
  )
}
