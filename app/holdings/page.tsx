import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { FilterBar } from '@/components/FilterBar'
import { Badge, Card, Note, Signed, marketTone } from '@/components/ui'
import { FreshnessInline } from '@/components/Freshness'
import { HelpPopover } from '@/components/HelpPopover'
import { Total, TotalsStrip } from '@/components/layout'
import { getHoldings, getOperationalHealth, getPositionTrendRows, type FreshnessItem } from '@/lib/adapters/portfolio-db'
import { holdingWeight, trendChangePct, trendDates, trendSeries, weightTotal } from '@/lib/holdings-view'
import { marketColor } from '@/lib/palette'
import { DivergingBar, InlineBar } from '@/components/bars'
import { Sparkline } from '@/components/Sparkline'
import { freshnessLabel } from '@/lib/freshness-text'
import { getGlossary } from '@/lib/glossary'
import { createMoneyFormatter } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { fmtNumber, fmtPct, fmtQuantity } from '@/lib/format'
import { getLanguage } from '@/lib/i18n-server'
import { holdingsTotals } from '@/lib/holdings-totals'
import { positionHref } from '@/lib/position-url'
import { getPageCopy, getUiCopy } from '@/lib/ui-copy'
import { applyFilters, applySearch, filterOptions, readFilters, withParam, type FilterGroup } from '@/lib/table-filter'
import { columnSortValue, formatSort, knownSort, parseSort, sortRows, sortableKeys, type TableSort } from '@/lib/table-sort'
import { COST_BASIS_STATUS_TONE } from '@/lib/tone'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { AccountCell } from '@/components/PositionCell'
import { accountSortValue } from '@/lib/account-label'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/holdings')

const BASE = '/holdings'

// `status` keeps the parameter name /cost-basis used, so its old links land on
// the same filter here.
const GROUPS: FilterGroup<any>[] = [
  { key: 'market', label: 'Market' },
  { key: 'brokerage', label: 'Broker' },
  { key: 'account', label: 'Account' },
  { key: 'status', label: 'Status', valueFor: (row) => row.cost_status },
]

// Statuses under which a row's own cost or value is missing.
const ROW_FIGURES_INCOMPLETE = new Set(['missing_cost', 'unpriced'])

const DEFAULT_SORT: TableSort = { key: 'base_market_value', direction: 'desc' }

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const language = await getLanguage()
  const copy = getPageCopy('holdings', language)
  const labels = getUiCopy(language).common
  const money = createMoneyFormatter(await getCurrencyPreferences())
  const rows = getHoldings(1000)
  // The price and FX dates behind the value and gain columns, for the markets the list holds.
  const glossary = getGlossary(language)
  const marketsHeld = new Set(rows.map((r) => r.market))
  const priceKeys = [marketsHeld.has('KR') && 'kr_prices', marketsHeld.has('US') && 'us_prices', marketsHeld.has('CRYPTO') && 'crypto_prices', 'fx_rates']
  const basisItems = getOperationalHealth().snapshots.filter((item): item is FreshnessItem => priceKeys.includes(item.key))

  const selected = readFilters(params, GROUPS)
  const options = filterOptions(rows, GROUPS, selected)
  const query = typeof params.q === 'string' ? params.q : ''
  // Filtered before the columns are built: the weight column divides by the
  // displayed total, which the sort does not change.
  const matched = applySearch(applyFilters(rows, GROUPS, selected), query, (r) => [r.ticker, r.name, r.account, r.brokerage])
  const displayedValue = weightTotal(matched)
  // Bars are drawn against the largest weight, so the list reads as a ranking.
  const maxWeight = Math.max(0, ...matched.map((r) => holdingWeight(r.base_market_value, displayedValue) ?? 0))

  // Month-end values per security, for the trend column. Absent (no
  // position_snapshots table) or flat-empty, the column is left out.
  const trendRows = getPositionTrendRows()
  const trendAxis = trendRows ? trendDates([...new Set(trendRows.map((row) => row.date))]) : []
  const trends = trendRows && trendAxis.length >= 2 ? trendSeries(trendRows, trendAxis, rows) : null

  // A KRW line under a foreign-currency figure; a KRW row shows one line.
  const twoCurrencies = (native: number | null, base: number | null, currency: string, render: (value: number | null, currency: string) => ReactNode) => (
    <>
      <span className="block">{render(native, currency)}</span>
      {currency !== 'KRW' && <span className="mt-0.5 block text-label text-ink-3">{render(base, 'KRW')}</span>}
    </>
  )
  const amount = (value: number | null, currency: string) => (value == null ? labels.noValue : money(value, currency))
  const signedAmount = (value: number | null, currency: string) => <Signed value={value} format={(m) => money(m, currency)} />

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      key: 'ticker',
      label: copy.instrument,
      sortable: true,
      sortFirst: 'asc',
      sortValue: (r) => r.name ?? r.ticker,
      // The market badge sits with the ticker it qualifies, which saves the
      // column it used to fill; the market filter above still selects by it.
      render: (r) => (
        <Link href={positionHref(r.market, r.ticker)} className="block min-w-[11rem] hover:underline">
          <span className="flex items-center gap-1.5">
            <Badge tone={marketTone(r.market)}>{r.market}</Badge>
            <span className="font-mono text-caption text-info">{r.ticker}</span>
          </span>
          <span className="mt-1 block max-w-[13rem] truncate text-caption font-medium text-ink">{r.name}</span>
          {/* Below 2xl the status column is hidden, so a row whose own figures
              are incomplete says so here. The figures of an estimated row are
              whole (only its tax-lot coverage is not), so it stays quiet. */}
          {ROW_FIGURES_INCOMPLETE.has(r.cost_status) && (
            <span className="mt-1 block 2xl:hidden">
              <Badge tone={COST_BASIS_STATUS_TONE[r.cost_status] ?? 'neutral'}>{copy.costStatus[r.cost_status] ?? r.cost_status}</Badge>
            </span>
          )}
        </Link>
      ),
    },
    { key: 'account', label: copy.account, sortable: true, sortFirst: 'asc', sortValue: accountSortValue, priority: 'secondary', render: (r) => <AccountCell brokerage={r.brokerage} account={r.account} /> },
    {
      key: 'weight',
      label: copy.weight,
      description: copy.weightDescription,
      align: 'right',
      sortable: true,
      sortValue: (r) => r.base_market_value,
      nowrap: true,
      render: (r) => {
        const weight = holdingWeight(r.base_market_value, displayedValue)
        if (weight == null) return <span className="text-ink-3">{labels.noValue}</span>
        return (
          <div className="min-w-[4rem]">
            <span className="tabular-nums">{fmtPct(weight)}</span>
            <InlineBar pct={maxWeight > 0 ? (weight / maxWeight) * 100 : 0} color={marketColor(r.market)} />
          </div>
        )
      },
    },
    { key: 'quantity', label: copy.quantity, priority: 'wide', align: 'right', sortable: true, nowrap: true, render: (r) => fmtQuantity(r.quantity, 2) },
    {
      key: 'base_cost',
      label: copy.costBasis,
      description: copy.costDescription,
      align: 'right',
      sortable: true,
      sortValue: (r) => r.base_cost ?? r.total_cost_krw,
      priority: 'secondary',
      nowrap: true,
      render: (r) => twoCurrencies(r.native_cost, r.base_cost ?? r.total_cost_krw, r.currency, amount),
    },
    {
      key: 'base_market_value',
      label: copy.marketValue,
      description: copy.marketValueDescription,
      align: 'right',
      sortable: true,
      nowrap: true,
      render: (r) => twoCurrencies(r.native_market_value, r.base_market_value, r.currency, amount),
    },
    {
      key: 'base_unrealized_gl',
      label: copy.sort.gain,
      description: copy.gainDescription,
      align: 'right',
      sortable: true,
      priority: 'secondary',
      nowrap: true,
      render: (r) => twoCurrencies(r.native_unrealized_gl, r.base_unrealized_gl, r.currency, signedAmount),
    },
    {
      key: 'native_unrealized_gl_pct',
      label: copy.sort.return,
      description: copy.returnDescription,
      align: 'right',
      sortable: true,
      nowrap: true,
      render: (r) => (
        <div className="min-w-[4rem]">
          <Signed value={r.native_unrealized_gl_pct} format={(m) => fmtPct(m)} />
          <DivergingBar value={r.native_unrealized_gl_pct} />
        </div>
      ),
    },
    {
      key: 'lot_count',
      label: copy.taxLots,
      description: copy.taxLotsDescription,
      align: 'right',
      sortable: true,
      priority: 'wide',
      nowrap: true,
      render: (r) => (
        <>
          <span className="block tabular-nums">{copy.taxLotSummary(fmtNumber(r.long_term_qty, 2), fmtNumber(r.short_term_qty, 2))}</span>
          {r.lot_count != null && <span className="mt-0.5 block text-label text-ink-3">{copy.lotCount(Number(r.lot_count), fmtNumber(r.lot_count))}</span>}
        </>
      ),
    },
    {
      key: 'cost_status',
      label: copy.costStatusColumn,
      // What each status means, said once here instead of in a per-row note
      // column: that column repeated the badge as a sentence, and as the
      // last column of the table, unwrapped, it collapsed to a few pixels and
      // stretched every row to hundreds of pixels tall.
      // Spans, not <p>/<dl>: the help panel is itself a span inside the header.
      description: (
        <>
          <span className="block">{copy.costStatusDescription}</span>
          {Object.keys(copy.costStatus).map((status) => (
            <span key={status} className="mt-1.5 block">
              <span className="block font-medium text-ink">{copy.costStatus[status]}</span>
              <span className="block">{copy.costNotes[status]}</span>
            </span>
          ))}
        </>
      ),
      priority: 'wide',
      sortable: true,
      sortFirst: 'asc',
      nowrap: true,
      render: (r) => <Badge tone={COST_BASIS_STATUS_TONE[r.cost_status] ?? 'neutral'}>{copy.costStatus[r.cost_status] ?? r.cost_status}</Badge>,
    },
  ]
  // Last, so its help opens inward: the status column before it is hidden
  // below 2xl. Pushed rather than spread into the array, so the column scan in
  // tests/table-priority.test.ts still reads the literal.
  if (trends) {
    columns.push({
      key: 'trend',
      label: copy.trend,
      description: copy.trendDescription,
      priority: 'secondary',
      render: (r) => {
        const values = trends.get(`${r.market}:${r.ticker}`) ?? []
        const change = trendChangePct(values)
        return (
          <Sparkline
            values={values}
            color={marketColor(r.market)}
            label={copy.trendLabel(r.name ?? r.ticker, change == null ? null : fmtPct(change, { signed: true }))}
          />
        )
      },
    })
  }
  const sort = knownSort(parseSort(params.sort, DEFAULT_SORT), sortableKeys(columns), DEFAULT_SORT)
  const filtered = sortRows(matched, sort, columnSortValue(columns))
  const totals = holdingsTotals(filtered)
  const incompleteTotals = filtered.length > 0 && Object.values(totals).includes(null)

  const groupLabels: Record<string, string> = {
    market: copy.market,
    brokerage: copy.broker,
    account: copy.account,
    status: copy.costStatusFilter,
  }

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/holdings', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle(fmtNumber(rows.length))}
      />
      <Card title={copy.caption}>
        <div className="space-y-3">
          <FilterBar
            basePath={BASE}
            params={params}
            search={{ key: 'q', label: labels.search, placeholder: copy.searchPlaceholder, value: query }}
            groups={GROUPS.map((group) => ({
              key: group.key,
              label: groupLabels[group.key] ?? group.label,
              // The status column stores a machine value; the chip shows the
              // wording, and the URL keeps the value.
              options: options[group.key].map((value: string) => ({
                value,
                label: group.key === 'status' ? (copy.costStatus[value] ?? value) : value,
              })),
              selected: selected[group.key],
            }))}
          />
          <TotalsStrip columns="sm-4">
            <Total label={copy.filtered} value={<>{fmtNumber(filtered.length)} / {fmtNumber(rows.length)}</>} />
            <Total label={copy.costBasis} value={totals.cost == null ? labels.noValue : money(totals.cost, 'KRW')} />
            <Total label={copy.marketValue} value={totals.marketValue == null ? labels.noValue : money(totals.marketValue, 'KRW')} />
            <Total label={copy.sort.gain} value={<Signed value={totals.unrealized} format={(m) => money(m, 'KRW')} />} />
          </TotalsStrip>
          {incompleteTotals && <p className="text-caption text-ink-2">{copy.incompleteTotals}</p>}
          {/* How old the prices and FX behind the value and gain columns are, under the totals they qualify. */}
          {basisItems.length > 0 && (
            <Note row>
              {basisItems.map((item) => (
                <span key={item.key} className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-2">{freshnessLabel(item, language)}</span>
                  <FreshnessInline item={item} language={language} />
                </span>
              ))}
              <HelpPopover>{glossary.freshness.description}</HelpPopover>
            </Note>
          )}
          <DataTable
            rows={filtered}
            caption={copy.caption}
            emptyMessage={rows.length ? copy.noMatchingHoldings : copy.noHoldings}
            sort={sort}
            sortHref={(next: TableSort) => withParam(BASE, params, 'sort', formatSort(next))}
            columns={columns}
          />
        </div>
      </Card>
    </>
  )
}
