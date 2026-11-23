import { notFound } from 'next/navigation'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { FilterBar } from '@/components/FilterBar'
import { Tabs } from '@/components/Tabs'
import { ALL } from '@/lib/table-filter'
import { spendingCategoryName, withCanonicalCategories } from '@/lib/spending-categories'
import { resolveSpendingView, SPENDING_VIEWS, spendingFilterParams, spendingHref, type SpendingView } from '@/lib/spending-links'
import { SpendingAnalytics } from '@/components/SpendingAnalytics'
import { Callout, Card, Label, MetricField, Note, TextLink } from '@/components/ui'
import { KpiBand } from '@/components/layout'
import { portfolioToday } from '@/lib/adapters/portfolio-db'
import { loadSpendingPilot } from '@/lib/adapters/spending-view'
import { readSpendingFxRates } from '@/lib/adapters/spending-fx'
import { analyzeSpending, compareSpendingPeriods, projectSpending, resolveSpendingPeriod, SPENDING_PERIODS, spendingInKrw, spendingMerchantKey, type SpendingHold } from '@/lib/domain/spending-view'
import { EMPTY_VALUE, fmtDate, fmtMonth, fmtPct, localeFor } from '@/lib/format'
import { fractionPct } from '@/lib/cash-inflow-format'
import { spendingLinkedIssues, type HeaderStatus } from '@/lib/header-status'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeName, routeSection } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/spending')

const pageSize = 25
const currencies = ['USD', 'KRW'] as const

export default async function SpendingPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const pilot = loadSpendingPilot()
  if (pilot.status === 'disabled') notFound()
  const language = await getLanguage()
  const copy = getPageCopy('spending', language)
  const source = pilot.status === 'available' && pilot.publicationDate ? copy.published(pilot.publicationDate) : copy.pilot
  const header = (status?: HeaderStatus) => (
    <PageHeader
      status={status}
      eyebrow={routeSection('/spending', language)}
      title={routeName('/spending', language)}
      subtitle={<>{copy.subtitle}<span className="mt-1 block text-caption text-ink-3">{source}</span></>}
      autoRefresh={false}
    />
  )
  if (pilot.status === 'unavailable') {
    return <>{header()}<Callout tone="danger" role="alert"><p>{copy.unavailable}</p><p>{copy.unavailableHint}</p></Callout></>
  }

  const { snapshot } = pilot
  // One category list: issuer and BankSalad labels read as the same keys everywhere on the page.
  const categorized = { ...snapshot, rows: withCanonicalCategories(snapshot.rows) }
  const accounts = pilot.accounts[language]
  const params = await searchParams
  const param = (key: string) => typeof params[key] === 'string' ? params[key] : undefined
  const requestedView = param('view')
  const { account, month, rows: ledgerRows, coverage, holds } =
    projectSpending(categorized, { account: param('account'), month: requestedView === 'review' ? undefined : param('month') })
  const period = resolveSpendingPeriod(param('period'))
  const today = portfolioToday()
  // Rates are read on every tab: the header pill counts transactions without one.
  const rates = readSpendingFxRates()
  const analytics = analyzeSpending(categorized.rows, { today, period, account, rates })
  const comparison = compareSpendingPeriods(categorized.rows, { today, period, account, rates })
  const view = resolveSpendingView(requestedView, { month, page: param('page') })
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
  const href = (target: SpendingView, options: Record<string, string | undefined> = {}) => spendingHref(target, { period, account }, options)
  const filterParams = spendingFilterParams({ view, period, account, month, currency, category, merchant })
  // Months of the period with spending activity, newest first, plus a month the URL names outside it.
  const monthChoices = [...(month && !analytics.months.some(item => item.month === month) ? [month] : []),
    ...analytics.months.filter(item => item.USD !== null || item.KRW !== null).map(item => item.month)]
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

  const linked = spendingLinkedIssues(copy, {
    holds: holds.length,
    reviewIncomplete: snapshot.reviewIncomplete,
    missingFx: analytics.combined.missingFx,
    reviewHref: href('review') + '#spending-holds',
  })

  return (
    <>
      {header(linked.status)}
      <div className="space-y-4">
        <Tabs label={copy.title} current={view}
          items={SPENDING_VIEWS.map(item => ({ key: item, href: href(item), label: copy.views[item] }))} />
        <FilterBar basePath="/spending" params={filterParams} groups={[
          { key: 'period', label: copy.filterPeriod, selected: String(period), defaultValue: '12',
            options: SPENDING_PERIODS.map(item => ({ value: String(item), label: copy.periods[item] })) },
          { key: 'account', label: copy.account, selected: account ?? ALL,
            options: [{ value: ALL, label: copy.allAccounts }, ...accountIds.map(id => ({ value: id, label: name(id) }))] },
          ...(view === 'transactions' ? [{ key: 'month', label: copy.filterMonth, selected: month ?? ALL,
            options: [{ value: ALL, label: copy.periods[period] }, ...monthChoices.map(item => ({ value: item, label: fmtMonth(item, language, { year: true }) }))] }] : []),
        ]} />

        {view === 'summary' ? <>
          {/* The lead answers the page's question: how much, against what, over which months. */}
          <Card id="spending-lead" title={copy.combinedNet} info={copy.exchangePolicy} accent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <Label variant="eyebrow">{`${copy.convertedKrw} · ${copy.periods[period]}`}</Label>
                  <div className="mt-2 text-hero-sm font-medium leading-none tracking-normal text-ink sm:text-hero">
                    {analytics.combined.net === null ? EMPTY_VALUE : amount(analytics.combined.net, 'KRW')}
                  </div>
                  <Note size="caption" spacing="above-2">{copy.window(fmtDate(analytics.firstDay, language), fmtDate(analytics.lastDay, language))}</Note>
                </div>
                <div className="min-w-0 sm:max-w-[50%] sm:text-right">
                  <MetricField
                    label={copy.change}
                    labelClassName="sm:justify-end"
                    info={copy.changeInfo}
                    infoAlign="right"
                    value={fmtPct(fractionPct(comparison.change), { signed: true, nullText: copy.notAvailable })}
                    hint={comparison.change === null ? null : <>
                      {comparison.previous === null ? null : copy.changePrevious(amount(comparison.previous, 'KRW'))}
                      {comparison.previous !== null && comparison.comparedThrough ? ' · ' : null}
                      {comparison.comparedThrough ? copy.changeThrough(fmtMonth(comparison.comparedThrough, language, { year: true })) : null}
                    </>}
                  />
                </div>
              </div>
              <KpiBand columns={4}>
                <MetricField label={copy.monthlyAverage} value={comparison.monthlyAverage === null ? EMPTY_VALUE : amount(Math.round(comparison.monthlyAverage), 'KRW')} />
                {currencies.map(unit => (
                  <MetricField key={unit} label={copy.nativeNet[unit]}
                    value={analytics.totals[unit].net === null ? EMPTY_VALUE : amount(analytics.totals[unit].net!, unit)} />
                ))}
                <MetricField label={copy.monthsRecorded} value={`${count(analytics.combined.observedMonths)} / ${count(analytics.months.length)}`} />
              </KpiBand>
              {analytics.combined.missingFx ? (
                <Callout tone="warning" emphasis="soft" size="caption" role="status">{copy.exchangeMissing(count(analytics.combined.missingFx))}</Callout>
              ) : null}
            </div>
          </Card>
          <SpendingAnalytics data={analytics} language={language} currentMonth={today.slice(0, 7)} amount={amount} count={count}
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

        <Card title={copy.holds} id="spending-holds" issues={linked.issues}
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
            <p>{[month ?? copy.periods[period], currency, category && spendingCategoryName(category, copy.categoryNames), merchantTitle].filter(Boolean).join(' · ')}</p>
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
                <p className="text-caption text-ink-2">{[copy.kinds[row.kind], row.category && spendingCategoryName(row.category, copy.categoryNames)].filter(Boolean).join(' · ')}</p>
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
              { key: 'category', label: copy.category, render: row => row.category ? spendingCategoryName(row.category, copy.categoryNames) : EMPTY_VALUE },
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
