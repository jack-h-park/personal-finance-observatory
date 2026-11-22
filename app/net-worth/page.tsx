import { AssetCoverageNote } from '@/components/AssetCoverageNote'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Card, Label, Note } from '@/components/ui'
import { CardRow, Columns, KpiBand } from '@/components/layout'
import { TotalAssetsChangeField } from '@/components/TotalAssetsChangeField'
import { StackedAssetChart } from '@/components/charts'
import { getAssetCoverageReview, getAssetAllocation, getAssetEvents, getChildAssets, getMeta, getNetWorth, getSnapshotDates, getTotalAssetsSeries, portfolioToday } from '@/lib/adapters/portfolio-db'
import { convertMoney, createMoneyFormatter, formatKrw, formatUsd } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { fmtDate, fmtDateTime, fmtSigned } from '@/lib/format'
import { compactAmount } from '@/lib/chart-format'
import { signClass } from '@/lib/tone'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { ASSET_CLASSES, type NetWorth, type TotalAssetsPoint } from '@/lib/net-worth'
import { chartMarkers, snapEventDates } from '@/lib/asset-events'
import { AssetEventList } from '@/components/AssetEventList'
import { AllocationShares } from '@/components/AllocationShares'
import { TrendRangeLinks } from '@/components/TrendRangeLinks'
import { LinkChip } from '@/components/LinkChips'
import { DEFAULT_TREND_RANGE, resolveTrendRange, trendRangeDays, type TrendRange } from '@/lib/trend-ranges'
import type { AllocationClass } from '@/lib/asset-allocation'
import { ASSET_CLASS_COLOR, WRAPPER_COLOR } from '@/lib/palette'
import { getPageCopy } from '@/lib/ui-copy'
import { maskAccountLabel } from '@/lib/account-label'
import { monthEndBefore, previousYearEnd, totalAssetsChange } from '@/lib/total-assets-change'
import { ASSET_CLASS_KEYS, historyRows, resolveClasses, resolveHistoryWindow, toggleClass, viewPoints } from '@/lib/total-assets-view'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/net-worth')

type CashRow = NetWorth['cash'][number]
type HistoryRow = TotalAssetsPoint & { month: string; children?: number | null }
type ShownHistoryRow = HistoryRow & { change: number | null }
type ChildRow = { key: string; owner: string; account: string; asOf: string | null; valueKrw: number; subtotal?: boolean }

export default async function NetWorthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const language = await getLanguage()
  const copy = getPageCopy('netWorth', language)
  // Every KRW figure in the display currency, as the Overview shows it. The
  // Balance column stays in each account's own currency.
  const currencyPreferences = await getCurrencyPreferences()
  const money = createMoneyFormatter(currencyPreferences)
  const toDisplay = (krw: number) =>
    convertMoney(krw, 'KRW', currencyPreferences.displayCurrency, currencyPreferences.usdKrwRate).value
  const meta = getMeta()
  const netWorth = getNetWorth()
  const allocation = getAssetAllocation(netWorth)
  const allocationCopy = copy.allocation
  // Per class, the securities a mapping moved in from their market's class.
  const movedDetails = Object.fromEntries(
    Object.entries(allocation.reclassified).map(([key, rows]) => [
      key,
      <span key={key} className="flex flex-col gap-1 text-left">
        <span>{allocationCopy.movedTitle(allocationCopy.classes[key as AllocationClass])}</span>
        {rows!.map((row) => (
          <span key={`${row.market}:${row.ticker}`} className="flex justify-between gap-3">
            <span>
              {row.ticker} <span className="text-ink-3">{row.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">{money(row.valueKrw)}</span>
          </span>
        ))}
      </span>,
    ]),
  ) as Partial<Record<AllocationClass, React.ReactNode>>
  const classes = ASSET_CLASSES
  // Every snapshot date, plus today. The month-end table keeps the last point of
  // each month: the month's last snapshot, and today for the current month.
  const totalAssets = getTotalAssetsSeries(getSnapshotDates(100 * 365), netWorth)
  // The same changes as the Overview hero, from the same month-end bases.
  const overviewCopy = getPageCopy('overview', language)
  const today = portfolioToday()
  const changeSince = (since: string) => totalAssetsChange(totalAssets.points, since)
  const changes = [
    { label: overviewCopy.changeMtd, change: changeSince(monthEndBefore(today, 1)) },
    { label: overviewCopy.change3m, change: changeSince(monthEndBefore(today, 3)) },
    { label: overviewCopy.changeYtd, change: changeSince(previousYearEnd(today)) },
    { label: overviewCopy.change1y, change: changeSince(monthEndBefore(today, 12)) },
  ]
  // The chart and its events cover the selected period only (?trend=, 2Y by
  // default, as on the overview); the month-end table keeps every month.
  const selectedRange = resolveTrendRange(params.trend)
  const trendAssets = getTotalAssetsSeries(getSnapshotDates(trendRangeDays(selectedRange.days)), netWorth)
  const eventMarkers = snapEventDates(getAssetEvents(), trendAssets.points.map((point) => point.date))
  const eventsCopy = getPageCopy('assetEvents', language)
  // Self only unless ?children=1. Even then the children are their own band,
  // column and table: never inside a total on this page.
  const includeChildren = (Array.isArray(params.children) ? params.children[0] : params.children) === '1'
  const childAssets = includeChildren ? getChildAssets(totalAssets.points.map((point) => point.date)) : null
  const childrenOn = new Map((childAssets?.points ?? []).map((point) => [point.date, point.total]))
  const childCopy = copy.children
  // Chart filters: which classes to draw (?classes=, every class when absent)
  // and amounts or shares (?view=share). Both shape the chart only; the total
  // and the period changes above it always cover every class.
  const selectedClasses = resolveClasses(params.classes)
  const allClasses = selectedClasses.length === ASSET_CLASS_KEYS.length
  const shareView = (Array.isArray(params.view) ? params.view[0] : params.view) === 'share'
  const classesParam = allClasses ? null : selectedClasses.join(',')
  const historyParam = (Array.isArray(params.history) ? params.history[0] : params.history) ?? null
  const hrefWith = (next: { children?: boolean; trend?: TrendRange['key']; classes?: string | null; share?: boolean; history?: string | null }) => {
    const query = new URLSearchParams()
    const trend = next.trend ?? selectedRange.key
    if (trend !== DEFAULT_TREND_RANGE.key) query.set('trend', trend)
    const classesValue = next.classes === undefined ? classesParam : next.classes
    if (classesValue) query.set('classes', classesValue)
    if (next.share ?? shareView) query.set('view', 'share')
    if (next.children ?? includeChildren) query.set('children', '1')
    const historyValue = next.history === undefined ? historyParam : next.history
    if (historyValue) query.set('history', historyValue)
    const text = query.toString()
    return text ? `/net-worth?${text}` : '/net-worth'
  }
  // Composition: each class's value and share of the total, and its change
  // since the previous month end (the same base as the band above).
  const classShares = classes
    .filter((key) => netWorth.byClass[key] !== 0)
    .map((key) => ({ key, valueKrw: netWorth.byClass[key], pct: netWorth.totalKrw > 0 ? (netWorth.byClass[key] / netWorth.totalKrw) * 100 : 0 }))
  const monthChange = changes[0].change
  const classMonthChange = Object.fromEntries(
    (monthChange?.byClass ?? []).map((driver) => [
      driver.key,
      <span key={driver.key} className={signClass(driver.change)}>
        {fmtSigned(driver.change, (v) => compactAmount(v, { kind: 'money', currency: 'KRW' }, language))}
      </span>,
    ]),
  )
  // The change over the selected range, from its first plotted point.
  const rangeChange = trendAssets.points.length ? changeSince(trendAssets.points[0].date) : null
  const rangeLabel = copy.rangeChange(selectedRange.key === 'all' ? copy.rangeAll : selectedRange.label)
  const chartPoints = viewPoints(trendAssets.points, selectedClasses, shareView)
  // Children are never inside a share: the band is drawn in the amount view only.
  const childrenBandShown = includeChildren && !shareView
  const childRows: ChildRow[] = (childAssets?.owners ?? []).flatMap((owner) => [
    ...owner.accounts.map((account) => ({ key: `${owner.owner}|${account.account}`, owner: owner.label, account: account.account, asOf: account.asOf, valueKrw: account.valueKrw })),
    { key: `${owner.owner}|total`, owner: owner.label, account: childCopy.subtotal(owner.label), asOf: null, valueKrw: owner.totalKrw, subtotal: true },
  ])
  const monthEnds = new Map<string, HistoryRow>()
  for (const point of totalAssets.points)
    monthEnds.set(point.date.slice(0, 7), { ...point, month: point.date.slice(0, 7), ...(includeChildren ? { children: childrenOn.get(point.date) ?? null } : {}) })
  const history = [...monthEnds.values()]
  // The month-end table: the latest 12 months by default, one year, or all.
  const historyYears = [...new Set(history.map((row) => row.month.slice(0, 4)))].reverse()
  const historyWindow = resolveHistoryWindow(params.history, historyYears)
  const shownHistory = historyRows(history, historyWindow)
  // Cash balances, largest first; a balance with no rate (no won value) goes last.
  const cashRows = [...netWorth.cash].sort((a, b) => (b.krw ?? -Infinity) - (a.krw ?? -Infinity))
  const notesFor = (key: (typeof ASSET_CLASSES)[number]) =>
    netWorth.asOfNotes.filter((note) => note.assetClass === key).map((note) => copy.asOfNote(maskAccountLabel(note.label), fmtDate(note.asOf, language))).join(' · ')
  const amount = (value: number | null) => <span className="tabular-nums">{value == null ? copy.none : money(value)}</span>
  const kindLabel = (kind: string) => (kind in copy.kinds ? copy.kinds[kind as keyof typeof copy.kinds] : kind)

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/net-worth', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle(fmtDateTime(meta.ingested_at, language))}
      />
      <AssetCoverageNote summary={netWorth} language={language} review={getAssetCoverageReview(netWorth)} />

      <Card
        id="net-worth-trend"
        title={copy.trend}
        info={
          <span className="flex flex-col gap-2">
            <span>{copy.trendStarts(classes.filter((key) => totalAssets.startsOn[key]).map((key) => copy.classSince(copy.classes[key], fmtDate(totalAssets.startsOn[key]!, language))))}</span>
            <span>{copy.trendNote}</span>
          </span>
        }
        accent
        className="mb-5"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <TrendRangeLinks selected={selectedRange} hrefFor={(trend) => hrefWith({ trend })} />
            <LinkChip
              href={hrefWith({ children: !includeChildren })}
              active={includeChildren}
              ariaCurrent="none"
              aria-label={childCopy.toggleAria(includeChildren)}
              title={childCopy.toggleHint}
            >
              {childCopy.toggle}
            </LinkChip>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label variant="eyebrow">{copy.total}</Label>
            <div className="mt-2 text-hero-sm font-medium leading-none tracking-normal text-ink sm:text-hero">{money(netWorth.totalKrw)}</div>
          </div>
          <KpiBand columns={4}>
            {changes.map(({ label, change }) => (
              <TotalAssetsChangeField key={label} label={label} change={change} labels={overviewCopy} money={(krw) => money(krw)} language={language} />
            ))}
          </KpiBand>
          <div className="flex flex-col gap-3 border-t border-line-subtle pt-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <TotalAssetsChangeField label={rangeLabel} change={rangeChange} labels={overviewCopy} money={(krw) => money(krw)} language={language} />
            </div>
            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-label text-ink-3">{copy.classFilter}</span>
                {ASSET_CLASS_KEYS.map((key) => (
                  <LinkChip
                    key={key}
                    href={hrefWith({ classes: toggleClass(selectedClasses, key) })}
                    active={selectedClasses.includes(key)}
                    ariaCurrent="none"
                    aria-label={copy.classToggleAria(copy.classes[key], selectedClasses.includes(key))}
                  >
                    {copy.classes[key]}
                  </LinkChip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-label text-ink-3">{copy.viewFilter}</span>
                <LinkChip href={hrefWith({ share: false })} active={!shareView}>
                  {copy.viewAmount}
                </LinkChip>
                <LinkChip href={hrefWith({ share: true })} active={shareView}>
                  {copy.viewShare}
                </LinkChip>
              </div>
            </div>
          </div>
          {shareView && includeChildren ? <Note>{copy.shareChildrenNote}</Note> : null}
          <StackedAssetChart
            points={chartPoints.map((point) => {
              const value = (v: number | null) => (v == null ? null : shareView ? v : toDisplay(v))
              const child = childrenOn.get(point.date)
              return {
                date: point.date,
                stocks: value(point.stocks),
                crypto: value(point.crypto),
                cash: value(point.cash),
                pensions: value(point.pensions),
                gold: value(point.gold),
                total: shareView ? point.total : toDisplay(point.total),
                ...(childrenBandShown ? { children: child == null ? null : toDisplay(child) } : {}),
              }
            })}
            classes={selectedClasses}
            childrenBand={childrenBandShown ? { label: childCopy.band, combinedLabel: childCopy.combined } : undefined}
            startsOn={trendAssets.startsOn}
            labels={{ ...copy.classes, total: allClasses ? copy.historyColumns.total : copy.shownTotal }}
            axisLabel={shareView ? copy.chartAxisShare : currencyPreferences.displayCurrency === 'USD' ? copy.chartAxisUsd : copy.chartAxisKrw}
            unit={shareView ? { kind: 'percent' } : { kind: 'money', currency: currencyPreferences.displayCurrency }}
            language={language}
            emptyMessage={copy.noTrend}
            height={320}
            markers={chartMarkers(eventMarkers, trendAssets.points[0]?.date)}
          />
        </div>
        {eventMarkers.length ? (
          <details className="-mx-4 -mb-4 mt-4 border-t border-line-subtle">
            <summary className="cursor-pointer px-4 py-3 text-label text-ink-2">{copy.eventsToggle(eventsCopy.title, eventMarkers.length)}</summary>
            <AssetEventList markers={eventMarkers} copy={eventsCopy} money={(krw) => money(krw)} language={language} />
          </details>
        ) : null}
      </Card>


      <Card id="net-worth-composition" title={copy.composition} info={allocationCopy.note} className="mb-5">
        <Columns columns="lg-3" className="-m-4 divide-y divide-line-subtle lg:divide-x lg:divide-y-0">
          <div>
            <AllocationShares
              title={copy.byClass}
              shares={classShares}
              labels={copy.classes}
              colors={ASSET_CLASS_COLOR}
              money={money}
              columns={allocationCopy.columns}
              extra={{ label: overviewCopy.changeMtd, values: classMonthChange }}
            />
            {netWorth.asOfNotes.length ? (
              <div className="px-4 pb-4">
                <Note relaxed>
                  {classes.map((key) => notesFor(key) && `${copy.classes[key]}: ${notesFor(key)}`).filter(Boolean).join(' · ')} {copy.asOfNotesHint}
                </Note>
              </div>
            ) : null}
          </div>
          <AllocationShares
            title={allocationCopy.byClass}
            shares={allocation.classes}
            labels={allocationCopy.classes}
            colors={ASSET_CLASS_COLOR}
            money={money}
            columns={allocationCopy.columns}
            details={movedDetails}
            detailLabel={allocationCopy.movedLabel}
          />
          <AllocationShares
            title={allocationCopy.byWrapper}
            shares={allocation.wrappers}
            labels={allocationCopy.wrappers}
            colors={WRAPPER_COLOR}
            money={money}
            columns={allocationCopy.columns}
            note={allocationCopy.wrapperNote}
          />
        </Columns>
        {allocation.marketDefaults.length || allocation.unclassified.length ? (
          <div className="-mx-4 -mb-4 mt-4 flex flex-col gap-1 border-t border-line-subtle bg-surface px-4 py-3 text-label leading-relaxed text-ink-3">
            {allocation.marketDefaults.length ? (
              <details>
                <summary className="cursor-pointer">
                  {allocationCopy.marketDefaults(allocation.marketDefaults.length)} {allocationCopy.showDefaults}
                </summary>
                <span className="mt-1 block">
                  {allocation.marketDefaults.map((row) => `${row.market}:${row.ticker} ${row.name} (${allocationCopy.classes[row.market === 'US' ? 'us_equity' : 'kr_equity']})`).join(' · ')}
                </span>
              </details>
            ) : null}
            {allocation.unclassified.length ? <span>{allocationCopy.unclassified(allocation.unclassified.map((row) => row.name).join(', '))}</span> : null}
          </div>
        ) : null}
      </Card>


      {includeChildren ? (
        <Card title={childCopy.title} className="mb-5">
          <Note band="bottom" relaxed>
            {childCopy.note}
            {(childAssets?.owners ?? [])
              .filter((owner) => owner.derivation && owner.derivedFrom && owner.derivedUntil)
              .map((owner) => (
                <span key={owner.owner} className="mt-1 block">
                  {childCopy.derivedNote(owner.label, fmtDate(owner.derivedFrom!, language), fmtDate(owner.derivedUntil!, language), owner.derivation!)}
                </span>
              ))}
          </Note>
          <DataTable
            caption={childCopy.title}
            rows={childRows}
            getRowKey={(row: ChildRow) => row.key}
            emptyMessage={childCopy.empty}
            columns={[
              { key: 'owner', label: childCopy.columns.owner, render: (row: ChildRow) => <span className="font-medium text-ink">{row.owner}</span> },
              { key: 'account', label: childCopy.columns.account, render: (row: ChildRow) => (row.subtotal ? <span className="font-medium text-ink">{row.account}</span> : maskAccountLabel(row.account)) },
              { key: 'asOf', label: childCopy.columns.asOf, nowrap: true, render: (row: ChildRow) => <span className="tabular-nums">{row.asOf ? fmtDate(row.asOf, language) : ''}</span> },
              {
                key: 'value',
                label: childCopy.columns.value,
                align: 'right',
                nowrap: true,
                render: (row: ChildRow) => <span className={`tabular-nums ${row.subtotal ? 'font-medium text-ink' : ''}`}>{money(row.valueKrw)}</span>,
              },
            ]}
          />
        </Card>
      ) : null}

      <CardRow columns={1} spacing="none">
        {history.length ? (
          <Card
            id="net-worth-history"
            title={copy.history}
            info={
              <span className="flex flex-col gap-2">
                <span>{copy.historyNote}</span>
                <span>{copy.historyFxNote}</span>
              </span>
            }
            action={
              <div className="flex flex-wrap items-center justify-end gap-1">
                <LinkChip href={hrefWith({ history: null })} active={historyWindow.kind === 'recent'}>
                  {copy.historyRecent}
                </LinkChip>
                {historyYears.map((year) => (
                  <LinkChip key={year} href={hrefWith({ history: year })} active={historyWindow.kind === 'year' && historyWindow.year === year}>
                    {year}
                  </LinkChip>
                ))}
                <LinkChip href={hrefWith({ history: 'all' })} active={historyWindow.kind === 'all'}>
                  {copy.historyAll}
                </LinkChip>
              </div>
            }
          >
            <DataTable
              caption={copy.history}
              rows={shownHistory}
              getRowKey={(row: ShownHistoryRow) => row.month}
              emptyMessage={copy.empty}
              columns={[
                { key: 'month', label: copy.historyColumns.month, render: (row: ShownHistoryRow) => <span className="tabular-nums">{row.month}</span> },
                ...classes.map((key) => ({
                  key,
                  label: copy.historyColumns[key],
                  align: 'right' as const,
                  priority: 'secondary' as const,
                  render: (row: ShownHistoryRow) => amount(row[key]),
                })),
                {
                  key: 'total',
                  label: copy.historyColumns.total,
                  align: 'right' as const,
                  render: (row: ShownHistoryRow) => <span className="font-medium tabular-nums text-ink">{money(row.total)}</span>,
                },
                {
                  key: 'change',
                  label: copy.historyColumns.change,
                  align: 'right' as const,
                  nowrap: true,
                  render: (row: ShownHistoryRow) => (
                    <span className={`tabular-nums ${row.change ? signClass(row.change) : ''}`}>{row.change == null ? copy.none : fmtSigned(row.change, (v) => money(v))}</span>
                  ),
                },
                ...(includeChildren
                  ? [
                      {
                        key: 'children',
                        label: childCopy.historyColumn,
                        align: 'right' as const,
                        render: (row: ShownHistoryRow) => amount(row.children ?? null),
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
        ) : null}

        <Card title={copy.balances}>
          {netWorth.unpricedCash.length ? (
            <div className="border-b border-line-subtle bg-surface px-4 py-3 text-label leading-relaxed text-ink-3">
              <p>{copy.unpriced(netWorth.unpricedCash.map(maskAccountLabel).join(', '))}</p>
            </div>
          ) : null}
          <DataTable
            caption={copy.balances}
            rows={cashRows}
            getRowKey={(row: CashRow) => `${row.institution}|${row.account}`}
            emptyMessage={copy.empty}
            columns={[
              { key: 'institution', label: copy.columns.institution, render: (row: CashRow) => <span className="font-medium text-ink">{row.institution}</span> },
              { key: 'account', label: copy.columns.account, render: (row: CashRow) => maskAccountLabel(row.account) },
              { key: 'kind', label: copy.columns.kind, priority: 'secondary', render: (row: CashRow) => kindLabel(row.kind) },
              {
                key: 'asOf',
                label: copy.columns.asOf,
                nowrap: true,
                render: (row: CashRow) => (
                  <span className="tabular-nums">
                    {fmtDate(row.asOfDate, language)}
                    {row.derived ? (
                      <>
                        {' '}
                        <Badge tone="info">{copy.derived}</Badge>
                      </>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'balance',
                label: copy.columns.balance,
                align: 'right',
                nowrap: true,
                render: (row: CashRow) => <span className="tabular-nums">{row.currency === 'USD' ? formatUsd(row.balance) : formatKrw(row.balance)}</span>,
              },
              {
                key: 'krw',
                label: copy.columns.krw,
                align: 'right',
                nowrap: true,
                render: (row: CashRow) => <span className="tabular-nums">{row.krw == null ? copy.none : money(row.krw)}</span>,
              },
            ]}
          />
        </Card>
      </CardRow>
    </>
  )
}
