import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { FilterBar } from '@/components/FilterBar'
import { Badge, Card, marketTone } from '@/components/ui'
import { Total, TotalsStrip } from '@/components/layout'
import { getTaxLots } from '@/lib/adapters/portfolio-db'
import { createMoneyFormatter } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { fmtNumber, fmtQuantity } from '@/lib/format'
import { getLanguage } from '@/lib/i18n-server'
import { positionHref } from '@/lib/position-url'
import { getPageCopy, getUiCopy } from '@/lib/ui-copy'
import { TickerFilterChip } from '@/components/TickerFilterChip'
import { applyFilters, applySearch, applyTicker, filterOptions, readFilters, readTicker, withParam, type FilterGroup } from '@/lib/table-filter'
import { columnSortValue, formatSort, knownSort, parseSort, sortRows, sortableKeys, type TableSort } from '@/lib/table-sort'
import { bucketTone } from '@/lib/tone'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { AccountCell } from '@/components/PositionCell'
import { accountSortValue } from '@/lib/account-label'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/lots')

const BASE = '/lots'

// `label` is a key into the page copy, resolved per language at render time.
const GROUPS: FilterGroup<any>[] = [
  { key: 'market', label: 'market' },
  { key: 'brokerage', label: 'broker' },
  { key: 'account', label: 'account' },
  { key: 'term', label: 'term', valueFor: (row) => row.tax_term || 'Unknown' },
]

// Longest-held first: the question this page answers is what has crossed, or
// is about to cross, the long-term boundary.
const DEFAULT_SORT: TableSort = { key: 'holding_days', direction: 'desc' }

export default async function LotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const language = await getLanguage()
  const copy = getPageCopy('lots', language)
  const money = createMoneyFormatter(await getCurrencyPreferences())
  const rows = getTaxLots(1000)
  // A position page links here with its exact ticker; the market is the ordinary filter.
  const ticker = readTicker(params)
  const scoped = applyTicker(rows, ticker)

  const selected = readFilters(params, GROUPS)
  const options = filterOptions(scoped, GROUPS, selected)
  const query = typeof params.q === 'string' ? params.q : ''
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: 'market', label: copy.columns.market, sortable: true, sortFirst: 'asc', render: (r) => <Badge tone={marketTone(r.market)}>{r.market}</Badge> },
    { key: 'account', label: copy.columns.account, sortable: true, sortFirst: 'asc', sortValue: accountSortValue, priority: 'secondary', render: (r) => <AccountCell brokerage={r.brokerage} account={r.account} /> },
    {
      key: 'ticker',
      label: copy.columns.instrument,
      sortable: true,
      sortFirst: 'asc',
      sortValue: (r) => r.name ?? r.ticker,
      // The row used to open a summary panel above the table showing
      // what the position detail page already shows in full. One link,
      // to the page that answers the question.
      render: (r) => (
        <Link href={positionHref(r.market, r.ticker)} className="block min-w-[13rem] hover:underline">
          <span className="font-mono text-caption text-info">{r.ticker}</span>
          <span className="mt-1 block max-w-[18rem] truncate text-caption font-medium text-ink">{r.name}</span>
        </Link>
      ),
    },
    { key: 'acquired_date', label: copy.columns.acquired, sortable: true, nowrap: true },
    { key: 'open_quantity', label: copy.columns.quantity, align: 'right', sortable: true, render: (r) => fmtNumber(r.open_quantity, 2) },
    { key: 'native_cost_basis', label: copy.columns.costBasis, align: 'right', sortable: true, render: (r) => money(r.native_cost_basis, r.currency) },
    { key: 'cost_basis_krw', label: copy.columns.baseCost, align: 'right', sortable: true, render: (r) => money(r.cost_basis_krw, 'KRW') },
    { key: 'holding_days', label: copy.columns.days, align: 'right', sortable: true },
    { key: 'tax_term', label: copy.columns.term, sortable: true, sortFirst: 'asc', render: (r) => <Badge tone={bucketTone(r.tax_term)}>{copy.terms[r.tax_term] ?? r.tax_term ?? copy.unknownTerm}</Badge> },
  ]
  const sort = knownSort(parseSort(params.sort, DEFAULT_SORT), sortableKeys(columns), DEFAULT_SORT)

  const filtered = sortRows(
    applySearch(applyFilters(scoped, GROUPS, selected), query, (r) => [r.ticker, r.name, r.account, r.brokerage, r.source]),
    sort,
    columnSortValue(columns)
  )

  const totals = filtered.reduce(
    (acc, row) => ({
      cost: acc.cost + Number(row.cost_basis_krw ?? 0),
      quantity: acc.quantity + Number(row.open_quantity ?? 0),
    }),
    { cost: 0, quantity: 0 }
  )

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/lots', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle}
      />
      <Card title={copy.card}>
        <div className="space-y-3">
          <FilterBar
            basePath={BASE}
            params={params}
            search={{ key: 'q', label: getUiCopy(language).common.search, placeholder: copy.searchPlaceholder, value: query }}
            groups={GROUPS.map((group) => ({
              key: group.key,
              label: copy.filters[group.label as keyof typeof copy.filters],
              // The term column stores English; the chip shows the wording and the URL keeps the value.
              options: options[group.key].map((value: string) => ({ value, label: group.key === 'term' ? (copy.terms[value] ?? value) : value })),
              selected: selected[group.key],
            }))}
          />
          {ticker ? (
            <TickerFilterChip clearHref={withParam(BASE, params, 'ticker', null)} label={getUiCopy(language).common.tickerFilter(ticker)} removeLabel={getUiCopy(language).common.removeTickerFilter(ticker)} />
          ) : null}
          <TotalsStrip columns="sm-3">
            <Total label={copy.filtered} value={<>{fmtNumber(filtered.length)} / {fmtNumber(scoped.length)}</>} />
            <Total label={copy.openQuantity} value={fmtQuantity(totals.quantity, 2)} />
            <Total label={copy.baseCost} value={money(totals.cost, 'KRW')} />
          </TotalsStrip>
          <DataTable
            rows={filtered}
            sort={sort}
            sortHref={(next: TableSort) => withParam(BASE, params, 'sort', formatSort(next))}
            columns={columns}
          />
        </div>
      </Card>
    </>
  )
}
