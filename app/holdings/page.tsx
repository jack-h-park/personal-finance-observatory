import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'
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
import { getHoldings, getOperationalHealth, getPositionTrendRows, portfolioToday, type FreshnessItem } from '@/lib/adapters/portfolio-db'
import { holdingsChartDates } from '@/lib/snapshot-density'
import { MIX_MARKETS, marketMixSeries, mixShares, mixSummary } from '@/lib/market-mix'
import { DEFAULT_TREND_RANGE, resolveTrendRange, trendRangeDays } from '@/lib/trend-ranges'
import { PortfolioMultiTrendChart, StackedSeriesChart } from '@/components/charts'
import { SHARE_SCOPES, positionShares, shareMoves, type ShareScope } from '@/lib/position-shares'
import { weightChanges, type WeightChange } from '@/lib/weight-changes'
import { resolveRangeSelection } from '@/lib/range-selection'
import { RangeSelectForm } from '@/components/RangeSelectForm'
import { TrendRangeLinks } from '@/components/TrendRangeLinks'
import { LinkChip } from '@/components/LinkChips'
import { groupBySecurity, holdingWeight, trendChangePct, trendDates, trendSeries, weightTotal, type GroupAccount } from '@/lib/holdings-view'
import { OTHER_SERIES_COLOR, SERIES_COLORS, marketColor } from '@/lib/palette'
import { DivergingBar, InlineBar, ShareBar } from '@/components/bars'
import { Sparkline } from '@/components/Sparkline'
import { freshnessLabel } from '@/lib/freshness-text'
import { getGlossary } from '@/lib/glossary'
import { convertMoney, createMoneyFormatter, formatMoneyIn, needsDisplayLine } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { fmtDate, fmtNumber, fmtPct, fmtQuantity } from '@/lib/format'
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

  // The market-mix trend (?trend= period, ?mix=share for shares). It reads the
  // position snapshots and today's holdings, so it ignores the table filters.
  const mixCopy = copy.mix
  const mixRange = resolveTrendRange(params.trend)
  const mixShareView = (Array.isArray(params.mix) ? params.mix[0] : params.mix) === 'share'
  const chartRangeDays = trendRangeDays(mixRange.days)
  const chartRows = getPositionTrendRows(chartRangeDays) ?? []
  const chartDates = holdingsChartDates(chartRows.map((row) => row.date), chartRangeDays)
  const mixPoints = marketMixSeries(chartRows, chartDates, rows, portfolioToday())
  const mixShown = mixShareView ? mixShares(mixPoints) : mixPoints
  const toDisplay = (krw: number | null) => (krw == null ? null : convertMoney(krw, 'KRW', currencyPreferences.displayCurrency, currencyPreferences.usdKrwRate).value)
  const mixSeries = MIX_MARKETS.filter((market) => mixPoints.some((point) => point[market] != null)).map((market) => ({
    key: market,
    label: mixCopy.markets[market],
    color: marketColor(market),
  }))
  const mixNow = mixSummary(mixPoints)
  const mixRangeLabel = mixRange.key === 'all' ? mixCopy.rangeAll : mixRange.label

  // The security-weight trend under it: same period (?trend=), its own scope
  // (?wscope=), stacked or lines (?wview=lines), and securities pinned out of
  // Other (?pin=KR:005930,US:NVDA). Also blind to the table filters.
  const weightCopy = copy.weights
  const weightScope: ShareScope = (SHARE_SCOPES as readonly string[]).includes(String(params.wscope)) ? (params.wscope as ShareScope) : 'all'
  const weightLines = (Array.isArray(params.wview) ? params.wview[0] : params.wview) === 'lines'
  const pins = (typeof params.pin === 'string' ? params.pin.split(',') : []).filter(Boolean)
  const weights = positionShares({ rows: chartRows, dates: chartDates, held: rows, scope: weightScope, pins })

  const weightColor = (index: number) => SERIES_COLORS[index] ?? OTHER_SERIES_COLOR
  const weightMoves = shareMoves(weights.points, weights.series)
  // The worst date's exclusion, for the note under the chart: how many
  // positions and how much cost were ever left out.
  const weightExcluded = weights.excluded.length
    ? {
        count: Math.max(...weights.excluded.map((e) => e.count)),
        costPct: weights.excluded.some((e) => e.costPct != null) ? Math.max(...weights.excluded.map((e) => e.costPct ?? 0)) : null,
      }
    : null
  const otherNow = weights.points.filter((point) => point.other != null).at(-1)?.other ?? null
  // Pin candidates: the largest securities held now in this scope that have no
  // band of their own, plus any already pinned (to unpin).
  const drawnKeys = new Set(weights.series.map((s) => s.key))
  const heldNow = new Map<string, { name: string; value: number }>()
  for (const row of rows) {
    if (weightScope !== 'all' && row.market !== weightScope) continue
    const key = `${row.market}:${row.ticker}`
    const current = heldNow.get(key) ?? { name: row.name ?? row.ticker, value: 0 }
    current.value += row.base_market_value ?? 0
    heldNow.set(key, current)
  }
  const pinCandidates = [...heldNow.entries()]
    .filter(([key]) => pins.includes(key) || !drawnKeys.has(key))
    .sort((a, b) => Number(pins.includes(b[0])) - Number(pins.includes(a[0])) || b[1].value - a[1].value)
    .slice(0, 12)
  const pinHref = (key: string) => {
    const next = pins.includes(key) ? pins.filter((pin) => pin !== key) : [...pins, key]
    return withParam(BASE, params, 'pin', next.length ? next.join(',') : null)
  }

  // Composition panels over the rows the table shows (filters apply), per
  // security across accounts.
  const compositionCopy = copy.composition
  const securities = aggregateSecurities(matched)
  const topSecurities = securityWeights(securities).slice(0, 10)
  const concentrationNow = concentration(securities)
  const contributors = gainContributors(securities)
  const krw = (value: number) => money(value, 'KRW')
  const securityItem = (s: { key: string; market: string; ticker: string; name: string }) => ({ key: s.key, label: s.name, href: positionHref(s.market, s.ticker) })

  // The weight-change table (?from=&to=, snapped to the plotted dates; the
  // whole plotted window by default), in the weights card's scope.
  const changeCopy = copy.changes
  const selection = resolveRangeSelection(params.from, params.to, chartDates)
  const changeFrom = selection?.from ?? chartDates[0] ?? null
  const changeTo = selection?.to ?? chartDates.at(-1) ?? null
  const changes = changeFrom && changeTo && changeFrom !== changeTo ? weightChanges({ rows: chartRows, from: changeFrom, to: changeTo, held: rows, scope: weightScope }) : null
  const shownChanges = (changes?.changes ?? []).slice(0, 15)
  const maxChangePp = Math.max(0, ...shownChanges.map((c) => Math.abs(c.changePp)))
  const clearRangeHref = (() => {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      const single = Array.isArray(value) ? value[0] : value
      if (single != null && key !== 'from' && key !== 'to') next.set(key, single)
    }
    const query = next.toString()
    return query ? `${BASE}?${query}` : BASE
  })()
  const keepParams = Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const single = Array.isArray(value) ? value[0] : value
      return single == null ? [] : [[key, single]]
    })
  )
  const changeColumns: DataTableColumn<WeightChange>[] = [
    {
      key: 'name',
      label: changeCopy.instrument,
      render: (c) => (
        <Link href={positionHref(c.market, c.ticker)} className="flex min-w-[10rem] items-center gap-1.5 hover:underline">
          <Badge tone={marketTone(c.market)}>{c.market}</Badge>
          <span className="max-w-[14rem] truncate text-caption font-medium text-ink">{c.name}</span>
        </Link>
      ),
    },
    { key: 'startPct', label: changeCopy.startPct, align: 'right', priority: 'secondary', nowrap: true, render: (c) => fmtPct(c.startPct, { digits: 1 }) },
    { key: 'endPct', label: changeCopy.endPct, align: 'right', nowrap: true, render: (c) => fmtPct(c.endPct, { digits: 1 }) },
    {
      key: 'changePp',
      label: changeCopy.changePp,
      description: changeCopy.changeDescription,
      align: 'right',
      nowrap: true,
      render: (c) => (
        <div className="min-w-[4.5rem]">
          <span className="tabular-nums text-ink">{fmtPct(c.changePp, { digits: 1, signed: true, unit: 'pp' })}</span>
          <DivergingBar value={c.changePp} scale={maxChangePp || 1} neutral />
        </div>
      ),
    },
    { key: 'valueChange', label: changeCopy.valueChange, align: 'right', priority: 'secondary', nowrap: true, render: (c) => <Signed value={c.endValue - c.startValue} format={krw} /> },
    { key: 'trade', label: changeCopy.trade, description: changeCopy.tradeDescription, align: 'right', priority: 'tertiary', nowrap: true, render: (c) => <Signed value={c.tradeKrw} format={krw} /> },
    { key: 'price', label: changeCopy.price, description: changeCopy.priceDescription, align: 'right', priority: 'tertiary', nowrap: true, render: (c) => <Signed value={c.priceKrw} format={krw} /> },
  ]

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
      <Card
        title={mixCopy.title}
        info={mixCopy.info}
        className="mb-5"
        action={<TrendRangeLinks selected={mixRange} hrefFor={(key) => withParam(BASE, params, 'trend', key === DEFAULT_TREND_RANGE.key ? null : key)} />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-label text-ink-3">{mixCopy.viewFilter}</span>
            <LinkChip href={withParam(BASE, params, 'mix', null)} active={!mixShareView}>
              {mixCopy.viewAmount}
            </LinkChip>
            <LinkChip href={withParam(BASE, params, 'mix', 'share')} active={mixShareView}>
              {mixCopy.viewShare}
            </LinkChip>
          </div>
          <StackedSeriesChart
            points={mixShown.map((point) => ({
              date: point.date,
              KR: mixShareView ? point.KR : toDisplay(point.KR),
              US: mixShareView ? point.US : toDisplay(point.US),
              CRYPTO: mixShareView ? point.CRYPTO : toDisplay(point.CRYPTO),
              total: mixShareView ? point.total : (toDisplay(point.total) ?? 0),
            }))}
            series={mixSeries}
            totalLabel={mixCopy.total}
            axisLabel={mixShareView ? mixCopy.axisShare : currencyPreferences.displayCurrency === 'USD' ? mixCopy.axisUsd : mixCopy.axisKrw}
            unit={mixShareView ? { kind: 'percent' } : { kind: 'money', currency: currencyPreferences.displayCurrency }}
            language={language}
            emptyMessage={mixCopy.empty}
            height={240}
          />
          {mixNow.length > 0 && (
            <div>
              <ShareBar
                ariaHidden
                height="md"
                segments={mixNow.map((share) => ({ key: share.market, pct: share.pct, style: { backgroundColor: marketColor(share.market) } }))}
              />
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-2" aria-label={mixCopy.shareNow}>
                {mixNow.map((share) => (
                  <li key={share.market} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-pill" style={{ backgroundColor: marketColor(share.market) }} />
                    <span>{mixCopy.markets[share.market]}</span>
                    <span className="font-medium tabular-nums text-ink">{fmtPct(share.pct, { digits: 1 })}</span>
                    {share.changePp != null && (
                      // Neutral ink: a market gaining share is not good news in itself.
                      <span className="tabular-nums text-ink-3">
                        {mixCopy.shareChange(fmtPct(share.changePp, { digits: 1, signed: true, unit: 'pp' }), mixRangeLabel)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
      <Card
        title={weightCopy.title}
        info={weightCopy.info}
        className="mb-5"
        action={<TrendRangeLinks selected={mixRange} hrefFor={(key) => withParam(BASE, params, 'trend', key === DEFAULT_TREND_RANGE.key ? null : key)} />}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-label text-ink-3">{weightCopy.scopeFilter}</span>
              {SHARE_SCOPES.map((scope) => (
                <LinkChip key={scope} href={withParam(BASE, params, 'wscope', scope === 'all' ? null : scope)} active={weightScope === scope}>
                  {weightCopy.scopes[scope]}
                </LinkChip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-label text-ink-3">{weightCopy.viewFilter}</span>
              <LinkChip href={withParam(BASE, params, 'wview', null)} active={!weightLines}>
                {weightCopy.viewStack}
              </LinkChip>
              <LinkChip href={withParam(BASE, params, 'wview', 'lines')} active={weightLines}>
                {weightCopy.viewLines}
              </LinkChip>
            </div>
          </div>
          {weightLines ? (
            <PortfolioMultiTrendChart
              data={weights.points}
              series={weights.series.map((s, i) => ({ dataKey: s.id, name: s.name, color: weightColor(i) }))}
              axisLabel={weightCopy.axis}
              unit={{ kind: 'percent' }}
              language={language}
              emptyMessage={weightCopy.empty}
              height={260}
            />
          ) : (
            <StackedSeriesChart
              rangeSelect={{ from: selection?.from ?? null, to: selection?.to ?? null, baseHref: clearRangeHref, clearHref: clearRangeHref, clearLabel: changeCopy.clear }}
              points={weights.points}
              series={[
                ...weights.series.map((s, i) => ({ key: s.id, label: s.name, color: weightColor(i) })),
                ...(otherNow != null && otherNow > 0 ? [{ key: 'other', label: weightCopy.other, color: OTHER_SERIES_COLOR }] : []),
              ]}
              totalLabel={weightCopy.total}
              axisLabel={weightCopy.axis}
              unit={{ kind: 'percent' }}
              language={language}
              emptyMessage={weightCopy.empty}
              height={260}
            />
          )}
          {weights.series.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-ink-2" aria-label={weightCopy.scopeHint[weightScope]}>
              {weights.series.map((s, i) => {
                const move = weightMoves[i]
                return (
                  <li key={s.key} className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2 w-2 rounded-pill" style={{ backgroundColor: weightColor(i) }} />
                    <span>{s.name}</span>
                    <span className="font-medium tabular-nums text-ink">{fmtPct(move.pct, { digits: 1 })}</span>
                    {move.changePp != null && (
                      <span className="tabular-nums text-ink-3">{mixCopy.shareChange(fmtPct(move.changePp, { digits: 1, signed: true, unit: 'pp' }), mixRangeLabel)}</span>
                    )}
                  </li>
                )
              })}
              {otherNow != null && otherNow > 0 && (
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2 w-2 rounded-pill" style={{ backgroundColor: OTHER_SERIES_COLOR }} />
                  <span>{weightCopy.other}</span>
                  <span className="font-medium tabular-nums text-ink">{fmtPct(otherNow, { digits: 1 })}</span>
                </li>
              )}
            </ul>
          )}
          {weightExcluded && (
            <Note size="label">
              {weightCopy.excludedNote(
                fmtNumber(weights.excluded.length),
                fmtNumber(weightExcluded.count),
                weightExcluded.costPct == null ? labels.noValue : fmtPct(weightExcluded.costPct, { digits: 2 })
              )}
            </Note>
          )}
          {pinCandidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-label text-ink-3">{weightCopy.pinFilter}</span>
              {pinCandidates.map(([key, held]) => (
                <LinkChip key={key} href={pinHref(key)} active={pins.includes(key)} ariaCurrent="none" aria-label={weightCopy.pinAria(held.name, pins.includes(key))}>
                  {held.name}
                </LinkChip>
              ))}
            </div>
          )}
        </div>
      </Card>
      <Card id="weight-changes" title={changeCopy.title} info={changeCopy.info} className="mb-5">
        <div className="space-y-3">
          {changeFrom && changeTo && changeFrom !== changeTo ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <div className="text-caption font-medium tabular-nums text-ink">
                  {changeCopy.period(fmtDate(changeFrom, language), fmtDate(changeTo, language), weightCopy.scopes[weightScope])}
                </div>
                <Note size="label">{changeCopy.selectHint}</Note>
              </div>
              <RangeSelectForm
                dates={chartDates}
                from={changeFrom}
                to={changeTo}
                keep={keepParams}
                action={BASE}
                labels={{ from: changeCopy.fromLabel, to: changeCopy.toLabel, submit: changeCopy.apply }}
                formatDate={(date) => fmtDate(date, language)}
              />
            </div>
          ) : null}
          {changes == null ? (
            <Note size="caption">{chartDates.length >= 2 ? changeCopy.unavailable : changeCopy.empty}</Note>
          ) : (
            <>
              <DataTable rows={shownChanges} getRowKey={(c) => c.key} caption={changeCopy.title} columns={changeColumns} emptyMessage={changeCopy.empty} />
              {changes.changes.length > shownChanges.length && <Note size="label">{changeCopy.shown(fmtNumber(shownChanges.length), fmtNumber(changes.changes.length))}</Note>}
              {changes.excluded && (
                <Note size="label">{changeCopy.excludedNote(fmtNumber(changes.excluded.count), changes.excluded.costPct == null ? labels.noValue : fmtPct(changes.excluded.costPct, { digits: 2 }))}</Note>
              )}
            </>
          )}
        </div>
      </Card>
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
