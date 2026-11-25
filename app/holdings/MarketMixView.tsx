import { getPositionTrendRows, getRealizedGains, portfolioToday, type HoldingWithCostStatus } from '@/lib/adapters/portfolio-db'
import { holdingsChartDates } from '@/lib/snapshot-density'
import { Card } from '@/components/ui'
import { DailyChangeBarChart, StackedSeriesChart } from '@/components/charts'
import { TrendRangeLinks } from '@/components/TrendRangeLinks'
import { ChipGroup, LinkChip } from '@/components/LinkChips'
import { ShareBar } from '@/components/bars'
import { MIX_MARKETS, marketMixSeries, mixShares, mixSummary } from '@/lib/market-mix'
import { DEFAULT_TREND_RANGE, resolveTrendRange, trendRangeDays } from '@/lib/trend-ranges'
import { marketColor } from '@/lib/palette'
import { dailyChangeSeries, dailyChangeShares } from '@/lib/daily-change'
import { convertMoney } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { fmtPct } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'
import { withParam } from '@/lib/table-filter'

const BASE = '/holdings'

/** The market mix tab: KR / US / crypto over time, by amount or share. */
export async function MarketMixView({ params, rows, language }: { params: Record<string, string | string[] | undefined>; rows: HoldingWithCostStatus[]; language: Language }) {
  const copy = getPageCopy('holdings', language)
  // The market-mix trend (?trend= period, ?mix=share for shares). It sums the
  // per-security snapshots (each row's market matched to today's holdings) and
  // today's holdings, so it ignores the table filters.
  const mixCopy = copy.mix
  const currencyPreferences = await getCurrencyPreferences()
  const mixRange = resolveTrendRange(params.trend)
  const mixShareView = (Array.isArray(params.mix) ? params.mix[0] : params.mix) === 'share'
  const rangeDays = trendRangeDays(mixRange.days)
  const chartRows = getPositionTrendRows(rangeDays) ?? []
  const chartDates = holdingsChartDates(chartRows.map((row) => row.date), rangeDays)
  const toDisplay = (krw: number | null) => (krw == null ? null : convertMoney(krw, 'KRW', currencyPreferences.displayCurrency, currencyPreferences.usdKrwRate).value)
  const today = portfolioToday()
  const mixPoints = marketMixSeries(chartRows, chartDates, rows, today)
  const dailyPoints = chartDates.length > 1 ? dailyChangeSeries({ dates: chartDates, rows: chartRows, realized: getRealizedGains(chartDates[0], today), held: rows }) : []
  const dailyShown = mixShareView
    ? dailyChangeShares(dailyPoints)
    : dailyPoints.map((point) => ({
        ...point,
        KR: toDisplay(point.KR) ?? 0,
        US: toDisplay(point.US) ?? 0,
        CRYPTO: toDisplay(point.CRYPTO) ?? 0,
        total: toDisplay(point.total) ?? 0,
      }))
  const monthly = rangeDays > 366
  const mixShown = mixShareView ? mixShares(mixPoints) : mixPoints
  const mixSeries = MIX_MARKETS.filter((market) => mixPoints.some((point) => point[market] != null)).map((market) => ({
    key: market,
    label: mixCopy.markets[market],
    color: marketColor(market),
  }))
  const mixNow = mixSummary(mixPoints)
  const mixRangeLabel = mixRange.key === 'all' ? mixCopy.rangeAll : mixRange.label

  return (
      <Card
        title={mixCopy.title}
        info={mixCopy.info}
        action={<TrendRangeLinks selected={mixRange} hrefFor={(key) => withParam(BASE, params, 'trend', key === DEFAULT_TREND_RANGE.key ? null : key)} />}
      >
        <div className="space-y-3">
          <ChipGroup label={mixCopy.viewFilter}>
            <LinkChip href={withParam(BASE, params, 'mix', null)} active={!mixShareView}>
              {mixCopy.viewAmount}
            </LinkChip>
            <LinkChip href={withParam(BASE, params, 'mix', 'share')} active={mixShareView}>
              {mixCopy.viewShare}
            </LinkChip>
          </ChipGroup>
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
          <div>
            <p className="mb-1 text-caption font-medium text-ink-2">{monthly ? mixCopy.dailyMonthlyTitle : mixCopy.dailyTitle}</p>
            <DailyChangeBarChart
              points={dailyShown}
              series={mixSeries}
              totalLabel={mixCopy.dailyTotal}
              gapLabel={mixCopy.dailyGap}
              monthly={monthly}
              unit={mixShareView ? { kind: 'percent' } : { kind: 'money', currency: currencyPreferences.displayCurrency }}
              language={language}
              emptyMessage={mixCopy.empty}
              height={140}
            />
          </div>
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
  )
}
