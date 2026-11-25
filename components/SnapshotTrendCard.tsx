import { SnapshotTaxContext } from '@/components/SnapshotTaxContext'
import { Card, EmptyState, Panel, TextLink } from '@/components/ui'
import { PortfolioMultiTrendChart, PortfolioTrendChart } from '@/components/charts'
import { ChipGroup, LinkSegmentedControl } from '@/components/LinkChips'
import { TrendRangeLinks } from '@/components/TrendRangeLinks'
import { dbAvailable, getPortfolioSnapshots, withGoldScope } from '@/lib/adapters/portfolio-db'
import type { ChartUnit } from '@/lib/chart-format'
import { convertMoney, createMoneyFormatter, type CurrencyPreferences } from '@/lib/currency'
import { EMPTY_VALUE, fmtDateTime, fmtNumber, fmtPct, fmtSigned } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import {
  HEALTHY_TREND_COST_COVERAGE,
  MIN_TREND_COST_COVERAGE,
  TREND_COVERAGE_FIELDS,
  TREND_METRICS,
  TREND_SCOPES,
  combinedTrendPoints,
  isSnapshotStale,
  snapshotPriceDates,
  singleTrendPoints,
} from '@/lib/overview-trend'
import { SNAPSHOT_TREND_ID, type SnapshotTrendSelection } from '@/lib/snapshot-trend-navigation'
import { resolveTrendRange, trendRangeDays } from '@/lib/trend-ranges'
import { signClass } from '@/lib/tone'
import { getPageCopy } from '@/lib/ui-copy'

export function SnapshotTrendCard({
  language,
  currencyPreferences,
  selection,
  hrefFor,
  detailsHref,
}: {
  language: Language
  currencyPreferences: CurrencyPreferences
  selection: SnapshotTrendSelection
  hrefFor: <Key extends keyof SnapshotTrendSelection>(key: Key, value: SnapshotTrendSelection[Key]) => string
  detailsHref?: string
}) {
  const copy = getPageCopy('overview', language)
  const money = createMoneyFormatter(currencyPreferences)
  const displayBaseValue = (value: number) =>
    convertMoney(value, 'KRW', currencyPreferences.displayCurrency, currencyPreferences.usdKrwRate).value
  const moneyUnit: ChartUnit = { kind: 'money', currency: currencyPreferences.displayCurrency }
  const displayAxisLabel = currencyPreferences.displayCurrency === 'USD' ? copy.chartAxisUsd : copy.chartAxisKrw
  const selectedRange = resolveTrendRange(selection.trend)
  const selectedScope = selection.scope
  const selectedView = detailsHref ? 'combined' : selection.view
  const realizedAxis = selection.realizedAxis
  const selectedMetric = TREND_METRICS.find(({ key }) => key === (selectedView === 'combined' ? 'market_value' : selection.metric)) ?? TREND_METRICS[0]
  const selectedMetricLabel = copy.metricLabels[selectedMetric.key]
  const selectedCoverageField = TREND_COVERAGE_FIELDS[selectedScope]
  const selectedScopeLabel = copy.scopeLabels[selectedScope]
  const combinedMetrics = TREND_METRICS.filter((metric) => metric.key !== 'return_pct')

  const storedSnapshots = dbAvailable() ? getPortfolioSnapshots(trendRangeDays(selectedRange.days)) : []
  // The gold scope is derived on read (lib/gold-trend.ts), so only that scope pays for it.
  const portfolioSnapshots = selectedScope === 'GOLD' ? withGoldScope(storedSnapshots) : storedSnapshots
  const trendData = singleTrendPoints(portfolioSnapshots, selectedScope, selectedMetric.key, displayBaseValue)
  const combinedTrendData = combinedTrendPoints(portfolioSnapshots, selectedScope, displayBaseValue)
  const valuedTrendData = trendData.filter((point): point is typeof point & { value: number } => typeof point.value === 'number')
  const firstTrendPoint = valuedTrendData[0]
  const latestTrendPoint = valuedTrendData[valuedTrendData.length - 1]
  const firstTrendValue = firstTrendPoint?.value ?? 0
  const latestTrendValue = latestTrendPoint?.value ?? 0
  const trendChange = latestTrendValue - firstTrendValue
  const trendChangePct = firstTrendValue !== 0 ? (trendChange / Math.abs(firstTrendValue)) * 100 : null
  const latestSnapshot = portfolioSnapshots[portfolioSnapshots.length - 1]
  const latestTrendCoverage = latestSnapshot?.[selectedCoverageField] ?? null
  const latestPositionCoverage = selectedScope === 'global' ? latestSnapshot?.position_coverage ?? null : null
  const missingTrendPoints = trendData.length - valuedTrendData.length
  // Which prices the latest point was valued at, and whether the ingest that
  // wrote it is recent: a failed refresh leaves the last good snapshot in place.
  const latestPriceDates = snapshotPriceDates(latestSnapshot, selectedScope)
  const latestSnapshotStale = isSnapshotStale(latestSnapshot?.captured_at)
  const trendValueLabel = (value: number) => selectedMetric.key === 'return_pct' ? fmtPct(value, { digits: 1 }) : money(value, currencyPreferences.displayCurrency)
  const trendChangeLabel = selectedMetric.key === 'return_pct'
    ? fmtPct(trendChange, { digits: 1, unit: 'pp', signed: true })
    : `${fmtSigned(trendChange, trendValueLabel)}${trendChangePct == null ? '' : ` · ${fmtPct(trendChangePct, { digits: 1, signed: true })}`}`

  // What the snapshot card used to print under the chart: which prices the
  // latest point used, the range it covers and how it is built.
  const trendInfo = (
    <span className="flex flex-col gap-2">
      {selectedScope === 'GOLD' ? <span>{copy.goldScopeInfo}</span> : null}
      {latestSnapshot ? (
        <span className="tabular-nums">
          {latestPriceDates.length ? (
            <>
              {copy.priceBasis}{' '}
              {latestPriceDates.map((item, index) => (
                <span key={item.market}>
                  {index ? ' · ' : ''}{copy.scopeLabels[item.market]} {item.newest}{item.oldest ? ` (${copy.priceOldest(item.oldest)})` : ''}
                </span>
              ))}
              {' · '}
            </>
          ) : null}
          {copy.snapshotWritten(fmtDateTime(latestSnapshot.captured_at, language))}
        </span>
      ) : null}
      <span>{trendData.length ? copy.trendRangeSummary(trendData[0].date, trendData[trendData.length - 1].date, valuedTrendData.length, trendData.length, missingTrendPoints) : copy.snapshotsOnce}</span>
      <span>{copy.trendExplanation}</span>
    </span>
  )

  return (
    <Card
      id={detailsHref ? undefined : SNAPSHOT_TREND_ID}
      title={copy.snapshotTrend(selectedScopeLabel)}
      info={trendInfo}
      className="mb-5"
      action={
        <div className="flex flex-wrap items-center justify-end gap-1">
          <TrendRangeLinks selected={selectedRange} hrefFor={(key) => hrefFor('trend', key)} />
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          {selectedView === 'combined' ? (
            <>
              <div className="text-caption text-ink-3">{copy.combinedTrendSummary(selectedScopeLabel, displayAxisLabel)}</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {combinedMetrics.map((metric) => {
                  const latest = combinedTrendData[combinedTrendData.length - 1]?.[metric.key]
                  return (
                    <div key={metric.key}>
                      <div className="flex items-center gap-1.5 text-label text-ink-3"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />{copy.metricLabels[metric.key]}</div>
                      <div className="mt-0.5 text-title font-medium tabular-nums text-ink">{typeof latest === 'number' ? money(latest, currencyPreferences.displayCurrency) : EMPTY_VALUE}</div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="text-caption text-ink-3">
                {copy.trendUnit(`${selectedScopeLabel} · ${selectedMetricLabel}`, selectedMetric.key === 'return_pct' ? copy.percentagePoints : displayAxisLabel)}
                {latestTrendCoverage != null && latestTrendCoverage < 1 ? ` · ${copy.costPriced(fmtNumber(latestTrendCoverage * 100, 2))}` : ''}
                {latestPositionCoverage != null && latestPositionCoverage < 1 ? ` · ${copy.positionsPriced(fmtNumber(latestPositionCoverage * 100, 1))}` : ''}
              </div>
              <div className="mt-1 text-title font-medium tabular-nums text-ink">{valuedTrendData.length ? trendValueLabel(latestTrendValue) : copy.noCoveredHistory}</div>
              {latestTrendCoverage != null && latestTrendCoverage >= MIN_TREND_COST_COVERAGE && latestTrendCoverage < HEALTHY_TREND_COST_COVERAGE && (
                <div className="mt-1 text-label text-warning">{copy.partialValuation}</div>
              )}
            </>
          )}
        </div>
        {selectedView === 'single' && <div className={`text-right text-caption tabular-nums ${signClass(trendChange)}`}>{valuedTrendData.length > 1 ? <>{trendChangeLabel}<div className="text-micro font-normal text-ink-3">{copy.since(firstTrendPoint.date)}</div></> : copy.needTwoSnapshots}</div>}
      </div>
      {/* The price basis lives in the info popover; only a stale snapshot is said out loud. */}
      {latestSnapshot && latestSnapshotStale ? (
        <div className="-mt-1 mb-3 text-label text-warning">{copy.snapshotStale}</div>
      ) : null}
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          {detailsHref ? null : (
            <ChipGroup label={copy.trendViewFilter}>
              <LinkSegmentedControl
                items={[
                  { key: 'single', href: hrefFor('view', 'single'), label: copy.individual },
                  { key: 'combined', href: hrefFor('view', 'combined'), label: copy.combined },
                ]}
                current={selectedView}
              />
            </ChipGroup>
          )}
          <ChipGroup label={copy.trendScopeFilter}>
            <LinkSegmentedControl
              items={TREND_SCOPES.map((scope) => ({
                key: scope.key,
                href: hrefFor('scope', scope.key),
                label: copy.scopeLabels[scope.key],
                title: scope.key === 'GOLD' ? copy.scopeHints.GOLD : undefined,
              }))}
              current={selectedScope}
            />
          </ChipGroup>
          {selectedView === 'combined' ? (
            <ChipGroup label={copy.realizedAxisFilter}>
              <LinkSegmentedControl
                items={[
                  { key: 'shared', label: copy.realizedAxisShared, href: hrefFor('realizedAxis', 'shared') },
                  { key: 'right', label: copy.realizedAxisRight, href: hrefFor('realizedAxis', 'right') },
                ]}
                current={realizedAxis}
              />
            </ChipGroup>
          ) : (
            <ChipGroup label={copy.trendMetricFilter}>
              <LinkSegmentedControl
                items={TREND_METRICS.map((metric) => ({
                  key: metric.key,
                  href: hrefFor('metric', metric.key),
                  label: copy.metricLabels[metric.key],
                }))}
                current={selectedMetric.key}
              />
            </ChipGroup>
          )}
        </div>
        {selectedScope === 'GOLD' ? (
          <div className="lg:max-w-md">
            <Panel as="p" bordered={false} text="label-note">{copy.goldScopeNote}</Panel>
          </div>
        ) : null}
      </div>
      {selectedView === 'combined' ? (
        combinedTrendData.length === 0 ? (
          <EmptyState hint={copy.firstSnapshotHint}>{copy.noCombinedHistory}</EmptyState>
        ) : (
          <PortfolioMultiTrendChart
            data={combinedTrendData}
            series={combinedMetrics.map((metric) => metric.key === 'realized_gl' && realizedAxis === 'right'
              ? { dataKey: metric.key, name: copy.onRightAxis(copy.metricLabels[metric.key]), color: metric.color, axis: 'right' as const }
              : { dataKey: metric.key, name: copy.metricLabels[metric.key], color: metric.color })}
            axisLabel={displayAxisLabel}
            rightAxisLabel={realizedAxis === 'right' ? `${copy.metricLabels.realized_gl} · ${displayAxisLabel}` : undefined}
            unit={moneyUnit}
            language={language}
            emptyMessage={copy.noCombinedHistory}
          />
        )
      ) : valuedTrendData.length === 0 ? (
        <EmptyState hint={copy.firstSnapshotHint}>{copy.noPortfolioHistory}</EmptyState>
      ) : (
        <PortfolioTrendChart
          data={trendData}
          dataKey="value"
          color={selectedMetric.color}
          axisLabel={selectedMetric.key === 'return_pct' ? copy.chartAxisReturn : displayAxisLabel}
          valueName={copy.chartValueName}
          unit={selectedMetric.key === 'return_pct' ? { kind: 'percent' } : moneyUnit}
          language={language}
          emptyMessage={copy.noPortfolioHistory}
        />
      )}
      {detailsHref ? <TextLink href={detailsHref} className="mt-2">{copy.snapshotDetails}</TextLink> : <SnapshotTaxContext language={language} />}
    </Card>
  )
}
