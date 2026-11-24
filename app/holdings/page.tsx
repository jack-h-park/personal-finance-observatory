import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Tabs } from '@/components/Tabs'
import { HOLDINGS_VIEWS, holdingsViewHref, resolveHoldingsView } from '@/lib/holdings-tabs'
import { MarketMixView } from './MarketMixView'
import { WeightsView } from './WeightsView'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { FilterBar } from '@/components/FilterBar'
import { Badge, Card, Note, Signed, marketTone } from '@/components/ui'
import { FreshnessInline } from '@/components/Freshness'
import { HelpPopover } from '@/components/HelpPopover'
import { Columns, MiniStat, MiniStatGrid, Total, TotalsStrip } from '@/components/layout'
import { Panel } from '@/components/card'
import { Label } from '@/components/metric'
import { DivergingBarList, RankedBarList } from '@/components/RankedBars'
import { aggregateSecurities, concentration, gainContributors, securityWeights } from '@/lib/holdings-composition'
import { getHoldings, getOperationalHealth, getPositionTrendRows, type FreshnessItem } from '@/lib/adapters/portfolio-db'
import { LinkChip } from '@/components/LinkChips'
import { groupBySecurity, holdingWeight, trendChangePct, trendDates, trendSeries, weightTotal, type GroupAccount } from '@/lib/holdings-view'
import { marketColor } from '@/lib/palette'
import { DivergingBar, InlineBar, ShareBar } from '@/components/bars'
import { Sparkline } from '@/components/Sparkline'
import { freshnessLabel } from '@/lib/freshness-text'
import { getGlossary } from '@/lib/glossary'
import { createMoneyFormatter, formatMoneyIn, needsDisplayLine } from '@/lib/currency'
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
import { AccountCell, AccountGroupCell } from '@/components/PositionCell'
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

/** A table row: one holding, or with ?group=security one security across the accounts listed in `accounts`. */
type TableRow = Omit<ReturnType<typeof getHoldings>[number], 'id'> & { id: number | string; accounts?: GroupAccount[] }

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
  const currencyPreferences = await getCurrencyPreferences()
  const money = createMoneyFormatter(currencyPreferences)
  const rows = getHoldings(1000, true)
  const view = resolveHoldingsView(params.view)
  const header = (
    <>
      <PageHeader
        eyebrow={routeSection('/holdings', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle(fmtNumber(rows.length))}
      />
      <Tabs
        label={copy.title}
        current={view}
        items={HOLDINGS_VIEWS.map((v) => ({ key: v, href: holdingsViewHref(params, v), label: copy.views[v], description: copy.viewDescriptions[v] }))}
      />
    </>
  )
  // The trend tabs load their own data; everything below is the holdings tab's.
  if (view === 'mix') {
    return (
      <>
        {header}
        <MarketMixView params={params} rows={rows} language={language} />
      </>
    )
  }
  if (view === 'weights') {
    return (
      <>
        {header}
        <WeightsView params={params} rows={rows} language={language} />
      </>
    )
  }

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
  // ?group=security folds the accounts that hold one security into one row,
  // after the filters, so an account filter still narrows what is summed.
  const perSecurity = (Array.isArray(params.group) ? params.group[0] : params.group) === 'security'
  const shownRows: TableRow[] = perSecurity ? groupBySecurity(matched) : matched
  const displayedValue = weightTotal(shownRows)
  // Bars are drawn against the largest weight, so the list reads as a ranking.
  const maxWeight = Math.max(0, ...shownRows.map((r) => holdingWeight(r.base_market_value, displayedValue) ?? 0))

  // Month-end values per security, for the trend column. Absent (no
  // position_snapshots table) or flat-empty, the column is left out.
  const trendRows = getPositionTrendRows()
  const trendAxis = trendRows ? trendDates([...new Set(trendRows.map((row) => row.date))]) : []
  const trends = trendRows && trendAxis.length >= 2 ? trendSeries(trendRows, trendAxis, rows) : null

  // The native figure in its own currency, never converted; under it, the KRW
  // base figure in the display currency, left out when it would repeat the
  // first line's currency.
  type Format = (value: number) => string
  const twoCurrencies = (native: number | null, base: number | null, currency: string, render: (value: number | null, format: Format) => ReactNode) => (
    <>
      <span className="block">{render(native, (n) => formatMoneyIn(n, currency))}</span>
      {needsDisplayLine(currency, currencyPreferences) && <span className="mt-0.5 block text-label text-ink-3">{render(base, (n) => money(n, 'KRW'))}</span>}
    </>
  )
  const amount = (value: number | null, format: Format) => (value == null ? labels.noValue : format(value))
  const signedAmount = (value: number | null, format: Format) => <Signed value={value} format={format} />

  const columns: DataTableColumn<TableRow>[] = [
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
    { key: 'account', label: copy.account, sortable: true, sortFirst: 'asc', sortValue: accountSortValue, priority: 'secondary',
      render: (r) =>
        r.accounts && r.accounts.length > 1 ? (
          <AccountGroupCell
            accounts={r.accounts}
            countLabel={copy.accountCount(fmtNumber(r.accounts.length))}
            shareText={(share) => (share == null ? labels.noValue : fmtPct(share, { digits: 0 }))}
          />
        ) : (
          <AccountCell brokerage={r.brokerage} account={r.account} />
        ),
    },
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
  const filtered = sortRows(shownRows, sort, columnSortValue(columns))
  const totals = holdingsTotals(filtered)
  const incompleteTotals = filtered.length > 0 && Object.values(totals).includes(null)

  // Composition panels over the rows the table shows (filters apply), per
  // security across accounts.
  const compositionCopy = copy.composition
  const securities = aggregateSecurities(matched)
  const topSecurities = securityWeights(securities).slice(0, 10)
  const concentrationNow = concentration(securities)
  const contributors = gainContributors(securities)
  const krw = (value: number) => money(value, 'KRW')
  const securityItem = (s: { key: string; market: string; ticker: string; name: string }) => ({ key: s.key, label: s.name, href: positionHref(s.market, s.ticker) })


  const groupLabels: Record<string, string> = {
    market: copy.market,
    brokerage: copy.broker,
    account: copy.account,
    status: copy.costStatusFilter,
  }

  return (
    <>
      {header}
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
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-label text-ink-3">{copy.rowsFilter}</span>
            <LinkChip href={withParam(BASE, params, 'group', null)} active={!perSecurity}>
              {copy.perAccount}
            </LinkChip>
            <LinkChip href={withParam(BASE, params, 'group', 'security')} active={perSecurity}>
              {copy.perSecurity}
            </LinkChip>
          </div>
          <TotalsStrip columns="sm-4">
            <Total label={copy.filtered} value={<>{fmtNumber(filtered.length)} / {fmtNumber(perSecurity ? new Set(rows.map((r) => `${r.market}:${r.ticker}`)).size : rows.length)}</>} />
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
          <Columns columns="lg-3" gap={3}>
            <Panel pad="md" layout="stack-2">
              <Label size="micro" className="flex items-center">
                {compositionCopy.topTitle}
                <HelpPopover>{compositionCopy.topInfo}</HelpPopover>
              </Label>
              {topSecurities.length ? (
                <RankedBarList
                  items={topSecurities.map((s) => ({ ...securityItem(s), value: s.pct, valueText: fmtPct(s.pct, { digits: 1 }), color: marketColor(s.market) }))}
                />
              ) : (
                <Note size="caption">{compositionCopy.empty}</Note>
              )}
            </Panel>
            <Panel pad="md" layout="stack-2">
              <Label size="micro" className="flex items-center">
                {compositionCopy.concentrationTitle}
                <HelpPopover>{compositionCopy.concentrationInfo}</HelpPopover>
              </Label>
              {concentrationNow ? (
                <>
                  <MiniStatGrid columns={3}>
                    <MiniStat label={compositionCopy.top5} value={fmtPct(concentrationNow.top5Pct, { digits: 1 })} />
                    <MiniStat label={compositionCopy.top10} value={fmtPct(concentrationNow.top10Pct, { digits: 1 })} />
                    <MiniStat
                      label={compositionCopy.effective}
                      value={compositionCopy.effectiveValue(fmtNumber(concentrationNow.effectiveCount, 1), fmtNumber(concentrationNow.count))}
                    />
                  </MiniStatGrid>
                  <ShareBar
                    ariaHidden
                    height="md"
                    segments={[
                      { key: 'top5', pct: concentrationNow.top5Pct, className: 'bg-info' },
                      { key: 'next5', pct: concentrationNow.top10Pct - concentrationNow.top5Pct, className: 'bg-ink-3' },
                    ]}
                  />
                  <div className="flex flex-wrap gap-x-4 text-label text-ink-3" aria-hidden="true">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-pill bg-info" />
                      {compositionCopy.barTop5}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-pill bg-ink-3" />
                      {compositionCopy.barNext5}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-pill bg-line-subtle" />
                      {compositionCopy.barRest}
                    </span>
                  </div>
                </>
              ) : (
                <Note size="caption">{compositionCopy.empty}</Note>
              )}
            </Panel>
            <Panel pad="md" layout="stack-2">
              <Label size="micro" className="flex items-center">
                {compositionCopy.gainTitle}
                <HelpPopover>{compositionCopy.gainInfo}</HelpPopover>
              </Label>
              <span className="block text-label text-ink-3">{compositionCopy.gainers}</span>
              {contributors.gainers.length ? (
                <DivergingBarList
                  items={contributors.gainers.map((s) => ({ ...securityItem(s), value: s.gain, valueText: <Signed value={s.gain} format={krw} /> }))}
                />
              ) : (
                <Note size="caption">{compositionCopy.noGainers}</Note>
              )}
              <span className="block pt-1 text-label text-ink-3">{compositionCopy.losers}</span>
              {contributors.losers.length ? (
                <DivergingBarList
                  items={contributors.losers.map((s) => ({ ...securityItem(s), value: s.gain, valueText: <Signed value={s.gain} format={krw} /> }))}
                />
              ) : (
                <Note size="caption">{compositionCopy.noLosers}</Note>
              )}
            </Panel>
          </Columns>
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
