import Link from 'next/link'
import { getPositionTrendRows, type HoldingWithCostStatus } from '@/lib/adapters/portfolio-db'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { Badge, Card, Note, Signed, marketTone } from '@/components/ui'
import { PortfolioMultiTrendChart, StackedSeriesChart } from '@/components/charts'
import { RangeSelectForm } from '@/components/RangeSelectForm'
import { TrendRangeLinks } from '@/components/TrendRangeLinks'
import { LinkChip } from '@/components/LinkChips'
import { DivergingBar } from '@/components/bars'
import { DEFAULT_TREND_RANGE, resolveTrendRange, trendRangeDays } from '@/lib/trend-ranges'
import { SHARE_SCOPES, positionShares, shareDates, shareMoves, type ShareScope } from '@/lib/position-shares'
import { weightChanges, type WeightChange } from '@/lib/weight-changes'
import { resolveRangeSelection } from '@/lib/range-selection'
import { OTHER_SERIES_COLOR, SERIES_COLORS } from '@/lib/palette'
import { createMoneyFormatter } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { fmtDate, fmtNumber, fmtPct } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { positionHref } from '@/lib/position-url'
import { getPageCopy, getUiCopy } from '@/lib/ui-copy'
import { withParam } from '@/lib/table-filter'

const BASE = '/holdings'

/**
 * The weights tab: the security-weight trend and, under it, the table of what
 * moved between two of its dates. The chart's range selection drives the
 * table, so the two stay on one tab.
 */
export async function WeightsView({ params, rows, language }: { params: Record<string, string | string[] | undefined>; rows: HoldingWithCostStatus[]; language: Language }) {
  const copy = getPageCopy('holdings', language)
  const labels = getUiCopy(language).common
  const money = createMoneyFormatter(await getCurrencyPreferences())
  const krw = (value: number) => money(value, 'KRW')
  const mixCopy = copy.mix
  const mixRange = resolveTrendRange(params.trend)
  const mixRangeLabel = mixRange.key === 'all' ? mixCopy.rangeAll : mixRange.label

  // The security-weight trend under it: same period (?trend=), its own scope
  // (?wscope=), stacked or lines (?wview=lines), and securities pinned out of
  // Other (?pin=KR:005930,US:NVDA). Also blind to the table filters.
  const weightCopy = copy.weights
  const weightScope: ShareScope = (SHARE_SCOPES as readonly string[]).includes(String(params.wscope)) ? (params.wscope as ShareScope) : 'all'
  const weightLines = (Array.isArray(params.wview) ? params.wview[0] : params.wview) === 'lines'
  const pins = (typeof params.pin === 'string' ? params.pin.split(',') : []).filter(Boolean)
  const weightRows = getPositionTrendRows(trendRangeDays(mixRange.days)) ?? []
  const weightDates = shareDates(weightRows.map((row) => row.date))
  const weights = positionShares({ rows: weightRows, dates: weightDates, held: rows, scope: weightScope, pins })

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
  // The weight-change table (?from=&to=, snapped to the plotted dates; the
  // whole plotted window by default), in the weights card's scope.
  const changeCopy = copy.changes
  const selection = resolveRangeSelection(params.from, params.to, weightDates)
  const changeFrom = selection?.from ?? weightDates[0] ?? null
  const changeTo = selection?.to ?? weightDates.at(-1) ?? null
  const changes = changeFrom && changeTo && changeFrom !== changeTo ? weightChanges({ rows: weightRows, from: changeFrom, to: changeTo, held: rows, scope: weightScope }) : null
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

  return (
    <>
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
      <Card id="weight-changes" title={changeCopy.title} info={changeCopy.info}>
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
                dates={weightDates}
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
            <Note size="caption">{weightDates.length >= 2 ? changeCopy.unavailable : changeCopy.empty}</Note>
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
    </>
  )
}
