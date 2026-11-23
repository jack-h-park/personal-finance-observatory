import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { SpendingAnalytics } from '@/components/SpendingAnalytics'
import { Button, Callout, Card, MetricField, Note, TextLink } from '@/components/ui'
import { portfolioToday } from '@/lib/adapters/portfolio-db'
import { loadSpendingPilot } from '@/lib/adapters/spending-view'
import { readSpendingFxRates } from '@/lib/adapters/spending-fx'
import { analyzeSpending, projectSpending, resolveSpendingPeriod, SPENDING_PERIODS, spendingInKrw, spendingMerchantKey, type SpendingHold } from '@/lib/domain/spending-view'
import { EMPTY_VALUE, localeFor } from '@/lib/format'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeName, routeSection } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/spending')

const base = '/spending'
const pageSize = 25
const currencies = ['USD', 'KRW'] as const
const views = ['summary', 'transactions', 'review'] as const
type View = (typeof views)[number]
const filterLink = 'inline-flex min-h-11 items-center rounded-md px-3 text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info'
const selectStyle = 'h-11 w-full rounded-md border border-line bg-card px-3 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info'

export default async function SpendingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pilot = loadSpendingPilot()
  if (pilot.status === 'disabled') notFound()
  const language = await getLanguage()
  const copy = getPageCopy('spending', language)
  const status = pilot.status === 'available' && pilot.publicationDate ? copy.published(pilot.publicationDate) : copy.pilot
  const header = (
    <PageHeader
      eyebrow={routeSection('/spending', language)}
      title={routeName('/spending', language)}
      subtitle={<>{copy.subtitle}<span className="mt-1 block text-caption text-ink-3">{status}</span></>}
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
  const requestedView = param('view')
  const { account, month, months, rows: ledgerRows, coverage, holds } =
    projectSpending(snapshot, { account: param('account'), month: requestedView === 'review' ? undefined : param('month') })
  const period = resolveSpendingPeriod(param('period'))
  const today = portfolioToday()
  const rates = requestedView === 'review' ? new Map() : readSpendingFxRates()
  const analytics = analyzeSpending(snapshot.rows, { today, period, account, rates })
  const view: View = requestedView === 'review' ? 'review'
    : requestedView === 'transactions' || month || param('page') ? 'transactions' : 'summary'
  const currency = currencies.find(unit => unit === param('currency'))
  const category = param('category')
  const merchant = param('merchant')
  const transaction = param('transaction')
  const matches = ledgerRows.filter(row =>
    (month || row.activityDate >= analytics.firstDay && row.activityDate <= analytics.lastDay) &&
    (!currency || row.currency === currency) &&
    (!category || row.category === category) &&
    (!merchant || spendingMerchantKey(row.merchantLabel ?? row.description) === merchant && row.kind === 'purchase'))
  const selected = transaction ? matches.find(row => row.id === transaction) : undefined
  const rows = selected ? [selected] : matches
  const unlistedMonth = month && !months.includes(month)
  const locale = localeFor(language)
  const count = new Intl.NumberFormat(locale).format
  const money = {
    USD: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    KRW: new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW' }),
  }
  const amount = (minor: number, currency: keyof typeof money) => money[currency].format(minor / (currency === 'USD' ? 100 : 1))
  const transactionAmount = (row: typeof ledgerRows[number]) => {
    const converted = spendingInKrw(row, rates).amount
    return converted === null ? EMPTY_VALUE : amount(converted, 'KRW')
  }
  const selectedRate = selected && spendingInKrw(selected, rates).quote
  const name = (id: string) => accounts.get(id)?.label ?? id
  const accountIds = [...new Set(snapshot.coverage.map(item => item.accountId))]
  const href = (target: View, options: Record<string, string | undefined> = {}) => {
    const query = new URLSearchParams({ view: target, period: String(period) })
    if (account) query.set('account', account)
    for (const [key, value] of Object.entries(options)) {
      if (value) query.set(key, value)
      else query.delete(key)
    }
    return base + '?' + query.toString()
  }
  const lastPage = Math.max(1, Math.ceil(rows.length / pageSize))
  const requestedPage = param('page')
  const page = requestedPage && /^\d{1,6}$/.test(requestedPage) ? Math.max(1, Math.min(Number(requestedPage), lastPage)) : 1
  const shown = rows.slice((page - 1) * pageSize, page * pageSize)
  const pageHref = (next: number) => href('transactions', { month, currency, category, merchant, page: String(next) })
  const transactionHref = (row: typeof ledgerRows[number]) => href('transactions', {
    month: row.activityDate.slice(0, 7), transaction: row.id,
  })
  const merchantTitle = merchant && (matches[0]?.merchantLabel ?? matches[0]?.description ?? merchant)
  const byAccount = new Map<string, SpendingHold[]>()
  const holdReasons = new Map<string, number>()
  for (const hold of holds) {
    holdReasons.set(hold.reason, (holdReasons.get(hold.reason) ?? 0) + 1)
    const group = byAccount.get(hold.accountId) ?? []
    group.push(hold)
    byAccount.set(hold.accountId, group)
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        <nav aria-label={copy.title} className="flex flex-wrap gap-1 border-b border-line">
          {views.map(item => <Link key={item} href={href(item)} aria-current={view === item ? 'page' : undefined}
            className={filterLink + (view === item ? ' bg-surface font-medium text-ink' : ' text-ink-2 hover:text-ink')}>
            {copy.views[item]}
          </Link>)}
        </nav>
        <div className="flex flex-wrap items-end gap-3">
          <nav aria-label={copy.periodChoices} className="flex flex-wrap gap-1 rounded-lg border border-line bg-card p-1">
            {SPENDING_PERIODS.map(item => <Link key={item} href={href(view, { period: String(item), month, currency, category, merchant })}
              aria-current={period === item ? 'true' : undefined} aria-label={copy.periods[item]}
              className={filterLink + (period === item ? ' bg-surface font-medium text-ink' : ' text-ink-2 hover:text-ink')}>
              {copy.shortPeriods[item]}
            </Link>)}
          </nav>
          {view === 'transactions' ? <form key={JSON.stringify([view, period, month, account, currency, category, merchant])}
            method="get" action={base}
            className="flex min-w-36 flex-1 flex-wrap items-end gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="period" value={period} />
            {currency ? <input type="hidden" name="currency" value={currency} /> : null}
            {category ? <input type="hidden" name="category" value={category} /> : null}
            {merchant ? <input type="hidden" name="merchant" value={merchant} /> : null}
            <label className="min-w-28 space-y-1 text-caption text-ink-2">
              <span>{copy.detailMonth}</span>
              <select className={selectStyle} name="month" defaultValue={month ?? ''}>
                <option value="">{copy.periods[period]}</option>
                {unlistedMonth ? <option value={month}>{month}</option> : null}
                {months.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="min-w-0 max-w-60 flex-1 space-y-1 text-caption text-ink-2">
              <span>{copy.account}</span>
              <select className={selectStyle} name="account" defaultValue={account ?? ''}>
                <option value="">{copy.allAccounts}</option>
                {accountIds.map(id =>
                  <option key={id} value={id}>{name(id)}</option>)}
              </select>
            </label>
            <Button type="submit" className="min-h-11">{copy.apply}</Button>
          </form> : <details key={view + ':' + (account ?? '')} className="relative min-w-32 max-w-60 flex-1">
            <summary className="min-h-11 cursor-pointer rounded-md border border-line bg-card px-3 py-3 text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info">
              {account ? name(account) : copy.allAccounts}
            </summary>
            <ul className="absolute right-0 z-20 mt-1 max-h-72 w-60 max-w-[80vw] overflow-y-auto rounded-md border border-line bg-card p-1">
              {['', ...accountIds].map(id => <li key={id}>
                <Link href={href(view, { account: id })} aria-current={(account ?? '') === id ? 'true' : undefined}
                  className={filterLink + ' w-full hover:bg-surface'}>
                  {id ? name(id) : copy.allAccounts}
                </Link>
              </li>)}
            </ul>
          </details>}
        </div>

        {view === 'summary' ? <>
          <Card title={copy.combinedNet} id="spending-period">
            <p className="mb-3 text-caption text-ink-2">{copy.window(analytics.firstDay, analytics.lastDay)}</p>
            <MetricField label={copy.convertedKrw} size="metric"
              value={<span className="break-words font-mono">{analytics.combined.net === null ? EMPTY_VALUE : amount(analytics.combined.net, 'KRW')}</span>} />
            <p className="mt-1 text-caption text-ink-2">{copy.observedMonths(count(analytics.combined.observedMonths), count(analytics.months.length))}</p>
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-caption">
              {currencies.map(unit => {
                const total = analytics.totals[unit]
                return <div key={unit} className="flex flex-wrap items-baseline gap-2">
                  <dt className="text-ink-2">{copy.nativeNet[unit]}</dt>
                  <dd className="font-mono tabular-nums">{total.net === null ? EMPTY_VALUE : amount(total.net, unit)}</dd>
                </div>
              })}
            </dl>
            <Note size="caption" spacing="above-3">{copy.exchangePolicy}</Note>
            {analytics.combined.missingFx ? <p role="status" className="mt-2 text-caption text-warning">
              {copy.exchangeMissing(count(analytics.combined.missingFx))}
            </p> : null}
          </Card>
          <SpendingAnalytics data={analytics} language={language} amount={amount} count={count}
            monthHref={target => href('transactions', { month: target })}
            rankingHref={(filter, term) => href('transactions', {
              [filter]: filter === 'merchant' ? spendingMerchantKey(term) : term,
            })}
            transactionHref={transactionHref} />
        </> : null}

        {view === 'review' ? <>
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
          {holdReasons.size ? <dl className="mt-3 divide-y divide-line-subtle">
            {[...holdReasons].sort((a, b) => b[1] - a[1]).map(([reason, total]) =>
              <div key={reason} className="flex justify-between gap-4 py-2 text-body">
                <div>
                  <dt>{copy.reasons[reason] ?? copy.unknownReason}</dt>
                  {copy.evidenceForHold[reason] ? <dd className="text-caption text-ink-2">{copy.evidenceForHold[reason]}</dd> : null}
                </div>
                <dd className="shrink-0 font-mono">{count(total)}</dd>
              </div>)}
          </dl> : null}
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

        </> : null}

        {view === 'transactions' ? <Card title={selected ? copy.selectedTransaction : copy.transactions} id="spending-transactions">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-caption text-ink-2">
            <p>{[month ?? copy.periods[period], currency, category, merchantTitle].filter(Boolean).join(' · ')}</p>
            {selected ? <TextLink href={href('transactions', { month })}>{copy.backToMatches}</TextLink> : null}
            {!selected && (category || merchant || currency) ? <TextLink href={href('transactions', { month })}>{copy.clearDetail}</TextLink> : null}
          </div>
          <p className="mb-3 text-caption text-ink-2">{copy.pageSummary(count(shown.length), count(rows.length))}</p>
          {selectedRate ? <p className="mb-3 text-caption text-ink-2">
            {copy.rateDetail(selectedRate.date, new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(selectedRate.rate), selectedRate.source)}
          </p> : null}
          {shown.length ? <ol className="divide-y divide-line-subtle md:hidden">
            {shown.map(row => <li key={row.id} className="flex items-start justify-between gap-3 py-3 text-body">
              <div className="min-w-0 break-words">
                {selected ? <p>{row.description}</p> : <TextLink href={transactionHref(row)}>{row.merchantLabel ?? row.description}</TextLink>}
                <p className="text-caption text-ink-2">{row.activityDate} · {name(row.accountId)}</p>
                <p className="text-caption text-ink-2">{[copy.kinds[row.kind], row.category].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="shrink-0 text-right font-mono tabular-nums">
                <div>{transactionAmount(row)}</div>
                {row.currency === 'USD' ? <div className="text-caption text-ink-2">{amount(row.amountMinor, row.currency)}</div> : null}
              </div>
            </li>)}
          </ol> : <p className="text-body text-ink-2 md:hidden">{copy.noRows}</p>}
          <div className="hidden md:block">
          <DataTable rows={shown} caption={copy.transactions} minWidth="42rem" emptyMessage={copy.noRows}
            getRowKey={row => row.id}
            columns={[
              { key: 'activityDate', label: copy.activityDate, nowrap: true, render: row => <span className="font-mono">{row.activityDate}</span> },
              { key: 'accountId', label: copy.account, render: row => name(row.accountId) },
              { key: 'description', label: copy.description, render: row => selected ? row.description
                : <TextLink href={transactionHref(row)}>{row.merchantLabel ?? row.description}</TextLink> },
              { key: 'kind', label: copy.type, render: row => copy.kinds[row.kind] },
              { key: 'category', label: copy.category, render: row => row.category ?? EMPTY_VALUE },
              { key: 'amount', label: copy.originalAmount, nowrap: true, align: 'right',
                render: row => <span className="font-mono">{amount(row.amountMinor, row.currency)}</span> },
              { key: 'converted', label: copy.convertedKrw, nowrap: true, align: 'right',
                render: row => <span className="font-mono">{transactionAmount(row)}</span> },
            ]}
          />
          </div>
          {lastPage > 1 ? (
            <div className="mt-3 flex flex-wrap gap-4">
              {page > 1 ? <TextLink href={pageHref(page - 1)} className="flex min-h-8 items-center">{copy.previous}</TextLink> : null}
              {page < lastPage ? <TextLink href={pageHref(page + 1)} className="flex min-h-8 items-center">{copy.next}</TextLink> : null}
            </div>
          ) : null}
        </Card> : null}
      </div>
    </>
  )
}
