'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ASSET_CLASS_COLOR, CHILDREN_COLOR, marketColor } from '@/lib/palette'
import { EMPTY_VALUE } from '@/lib/format'
import { axisTick, hasPlottablePoint, tooltipValue, type ChartUnit } from '@/lib/chart-format'
import type { Language } from '@/lib/i18n'
import { EmptyState } from '@/components/ui'
import { orderedDragRange, rangeHref } from '@/lib/range-selection'

const AXIS = { fontSize: 10, fill: 'var(--text-tertiary)' }

// Brand 4-color cycle for `multicolor` bars — one solid color per bar (no
// per-bar gradient). Used on time-series trends to carry the brand identity
// without sacrificing readability. Categorical charts keep a single `color`.
const BRAND_BARS = ['var(--brand-pink)', 'var(--brand-purple)', 'var(--brand-blue)', 'var(--brand-cyan)']
/**
 * The tooltip's surface. Four charts declared this object inline, so a change
 * to the chrome meant finding all four.
 */
const TOOLTIP_SURFACE = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  fontSize: 12,
} as const

/**
 * The chart contract, shared by all five charts: raw values in `unit`, short
 * ticks on the Y axis, the full amount in the tooltip.
 */
type ChartContract = {
  unit: ChartUnit
  language: Language
  /** Shown instead of the chart when no series has a finite value. */
  emptyMessage: ReactNode
}

const tickFormatter = (unit: ChartUnit, language: Language) => (value: number) => axisTick(value, unit, language)

/**
 * Percent ticks print whole percents, so a half-percent step would repeat a
 * label (0.5% and 1% both read "1%"). Percent axes ask recharts for integer ticks.
 */
const integerTicks = (unit: ChartUnit, allowDecimals?: boolean) => (unit.kind === 'percent' ? false : allowDecimals)

const tooltipFormatter = (unit: ChartUnit, language: Language) => (value: number, name: string) =>
  [tooltipValue(value, unit, language), name] as [string, string]

// marketColor lives in lib/palette.ts with the other chart colours. This
// re-export has no reader left and is kept for one release only; import it
// from '@/lib/palette'.
export { marketColor }

const MARKET_BARS: Record<string, string> = Object.fromEntries(
  ['KR', 'US', 'CRYPTO', 'KRW', 'USD'].map((key) => [key, marketColor(key)])
)

export function TrendBarChart({
  data,
  xKey,
  yKey,
  color = 'var(--brand-blue)',
  multicolor = false,
  height = 180,
  selectedKey,
  onBarSelect,
  xTickFormatter,
  xAxisInterval,
  xAxisHeight = 30,
  xTickAngle = 0,
  barColorKey,
  barColorMap = MARKET_BARS,
  allowDecimals = false,
  yAxisLabel,
  valueName,
  unit,
  language,
  emptyMessage,
}: ChartContract & {
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  /** The series name in the tooltip, in the page language. */
  valueName: string
  color?: string
  // Cycle each bar through the brand palette (pink→purple→blue→cyan). Leave off
  // for categorical charts that encode meaning with a single deliberate color.
  multicolor?: boolean
  height?: number
  // Cross-filter affordance: when set, the bar whose xKey value === selectedKey is
  // drawn at full opacity and the rest are dimmed; clicking any bar calls onBarSelect
  // with that bar's xKey value. Omitting both keeps the chart a plain read-only trend.
  selectedKey?: string
  onBarSelect?: (key: string) => void
  xTickFormatter?: (value: string) => string
  xAxisInterval?: number | 'preserveStart' | 'preserveEnd' | 'preserveStartEnd' | 'equidistantPreserveStart'
  xAxisHeight?: number
  xTickAngle?: number
  barColorKey?: string
  barColorMap?: Record<string, string>
  allowDecimals?: boolean
  yAxisLabel?: string
}) {
  if (!hasPlottablePoint(data, [yKey])) return <EmptyState>{emptyMessage}</EmptyState>
  const interactive = !!onBarSelect
  const hasSelection = selectedKey != null && selectedKey !== ''
  const chartData = data.map((d) => {
    const value = Number(d[yKey])
    return { ...d, [yKey]: Number.isFinite(value) ? value : 0 }
  })
  const values = chartData.map((d) => Number(d[yKey])).filter(Number.isFinite)
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(0, ...values)
  const domainPadding = Math.max(1, (maxValue - minValue) * 0.1)
  const yDomain: [number, number] = [
    Math.floor(minValue < 0 ? minValue - domainPadding : 0),
    Math.ceil(maxValue + domainPadding),
  ]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={AXIS}
          tickLine={false}
          axisLine={{ stroke: 'var(--border-default)' }}
          tickFormatter={xTickFormatter}
          interval={xAxisInterval}
          height={xAxisHeight}
          angle={xTickAngle}
          textAnchor={xTickAngle === 0 ? 'middle' : 'end'}
        />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          allowDecimals={integerTicks(unit, allowDecimals)}
          domain={yDomain}
          tickFormatter={tickFormatter(unit, language)}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', style: AXIS } : undefined}
        />
        <Tooltip
          cursor={{ fill: 'var(--bg-surface)' }}
          contentStyle={TOOLTIP_SURFACE}
          formatter={tooltipFormatter(unit, language)}
        />
        <Bar
          dataKey={yKey}
          name={valueName}
          fill={color}
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
          minPointSize={2}
          cursor={interactive ? 'pointer' : undefined}
          onClick={interactive ? (entry: Record<string, unknown>) => onBarSelect!(String(entry[xKey])) : undefined}
        >
          {chartData.map((d, i) => {
            const isSelected = hasSelection && String(d[xKey]) === selectedKey
            const dimmed = hasSelection && !isSelected
            const mappedColor = barColorKey ? barColorMap[String(d[barColorKey])] : undefined
            // Selected bar: full opacity + a dark outline so it pops; others fade hard.
            return (
              <Cell
                key={i}
                fill={mappedColor ?? (multicolor ? BRAND_BARS[i % BRAND_BARS.length] : color)}
                fillOpacity={dimmed ? 0.25 : 1}
                stroke={isSelected ? 'var(--text-primary)' : undefined}
                strokeWidth={isSelected ? 1.5 : 0}
              />
            )
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function PortfolioTrendChart({
  data,
  dataKey,
  color = 'var(--brand-blue)',
  height = 240,
  axisLabel,
  valueName,
  unit,
  language,
  emptyMessage,
}: ChartContract & {
  data: { date: string; value: number | null }[]
  dataKey: string
  color?: string
  height?: number
  axisLabel?: string
  /** The series name in the tooltip, in the page language. */
  valueName: string
}) {
  if (!hasPlottablePoint(data, [dataKey])) return <EmptyState>{emptyMessage}</EmptyState>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border-default)' }} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          allowDecimals={integerTicks(unit)}
          tickFormatter={tickFormatter(unit, language)}
          label={axisLabel ? { value: axisLabel, angle: -90, position: 'insideLeft', style: AXIS } : undefined}
        />
        <Tooltip
          contentStyle={TOOLTIP_SURFACE}
          formatter={(value: number) => [tooltipValue(value, unit, language), valueName]}
        />
        <Line
          type="linear"
          dataKey={dataKey}
          name={valueName}
          connectNulls={false}
          stroke={color}
          strokeWidth={2}
          dot={data.length <= 80 ? { r: 2, strokeWidth: 1 } : false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function PortfolioMultiTrendChart({
  data,
  series,
  height = 240,
  axisLabel,
  rightAxisLabel,
  unit,
  language,
  emptyMessage,
}: ChartContract & {
  data: { date: string; [key: string]: number | string | null }[]
  // `axis: 'right'` puts a series on its own scale, for one far smaller than
  // the rest that would otherwise draw as a flat line along the bottom.
  series: { dataKey: string; name: string; color: string; axis?: 'left' | 'right' }[]
  height?: number
  axisLabel?: string
  rightAxisLabel?: string
}) {
  if (!hasPlottablePoint(data, series.map((item) => item.dataKey))) return <EmptyState>{emptyMessage}</EmptyState>
  const formatTick = tickFormatter(unit, language)
  const rightSeries = series.filter((item) => item.axis === 'right')
  // Ticks take the series color when one series owns the axis, so the scale
  // reads as belonging to that line rather than to the chart.
  const rightTick = rightSeries.length === 1 ? { ...AXIS, fill: rightSeries[0].color } : AXIS
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: rightSeries.length ? -18 : 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border-default)' }} />
        <YAxis
          yAxisId="left"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          allowDecimals={integerTicks(unit)}
          tickFormatter={formatTick}
          label={axisLabel ? { value: axisLabel, angle: -90, position: 'insideLeft', style: AXIS } : undefined}
        />
        {rightSeries.length > 0 && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={rightTick}
            tickLine={false}
            axisLine={false}
            allowDecimals={integerTicks(unit)}
            tickFormatter={formatTick}
            label={rightAxisLabel ? { value: rightAxisLabel, angle: 90, position: 'insideRight', style: rightTick } : undefined}
          />
        )}
        <Tooltip
          contentStyle={TOOLTIP_SURFACE}
          formatter={tooltipFormatter(unit, language)}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((item) => (
          <Line
            key={item.dataKey}
            yAxisId={item.axis ?? 'left'}
            type="linear"
            dataKey={item.dataKey}
            name={item.name}
            connectNulls={false}
            stroke={item.color}
            strokeWidth={2}
            dot={data.length <= 80 ? { r: 2, strokeWidth: 1 } : false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

type AssetClass = 'stocks' | 'crypto' | 'cash' | 'pensions' | 'gold'
const STACK_ORDER: readonly AssetClass[] = ['stocks', 'crypto', 'cash', 'pensions', 'gold']

/**
 * `children` is the children's accounts, present only when the page includes
 * them: drawn as its own band on top, never folded into `total`, which stays the
 * maintainer's own.
 */
type StackedAssetPoint = { date: string; total: number; children?: number | null } & Record<AssetClass, number | null>

/**
 * Every asset class stacked, one area each, values already in the display
 * currency. A class that has not started is null and draws nothing
 * (recharts stacks it as zero), and a dashed line marks where each class after
 * the first date begins. The tooltip lists every class, with a dash for one not
 * yet started, and the total.
 */
export function StackedAssetChart({
  points,
  startsOn,
  labels,
  height = 260,
  axisLabel,
  markers = [],
  childrenBand,
  classes = STACK_ORDER,
  unit,
  language,
  emptyMessage,
  rangeSelect,
}: ChartContract & {
  points: StackedAssetPoint[]
  startsOn: Partial<Record<AssetClass, string>>
  labels: Record<AssetClass | 'total', string>
  height?: number
  axisLabel?: string
  /** Numbered event markers (lib/asset-events chartMarkers), one per plotted date. */
  markers?: { date: string; label: string }[]
  /** Labels for the children's band and the combined total, when the page includes the children. Absent: no band. */
  childrenBand?: { label: string; combinedLabel: string }
  /** The classes drawn, in any order (stack order is fixed); a class left out draws no area, start line or tooltip row. */
  classes?: readonly AssetClass[]
  /**
   * Turns on drag-to-select: dragging across the plot navigates to `baseHref`
   * with `from`/`to` set. `from`/`to` are the period already in the URL (drawn
   * as a persistent band, with a clear link); `baseHref` must carry no #fragment.
   */
  rangeSelect?: { from: string | null; to: string | null; baseHref: string; clearHref: string; clearLabel: string }
}) {
  const router = useRouter()
  const [dragStart, setDragStart] = useState<string | null>(null)
  const [dragEnd, setDragEnd] = useState<string | null>(null)
  const shown = STACK_ORDER.filter((key) => classes.includes(key))
  const seriesKeys: string[] = childrenBand ? [...shown, 'children'] : [...shown]
  if (!hasPlottablePoint(points, seriesKeys)) return <EmptyState>{emptyMessage}</EmptyState>
  const formatValue = (value: number) => tooltipValue(value, unit, language)
  const firstDate = points[0]?.date
  const starts = shown.filter((key) => startsOn[key] && startsOn[key] !== firstDate)
  const endDrag = () => {
    const range = orderedDragRange(dragStart, dragEnd)
    setDragStart(null)
    setDragEnd(null)
    // Stay where the reader is: the default scrolls a client navigation to the top.
    if (range && rangeSelect) router.push(rangeHref(rangeSelect.baseHref, range[0], range[1]), { scroll: false })
  }
  const dragging = rangeSelect ? orderedDragRange(dragStart, dragEnd) : null
  const selectedBand = rangeSelect?.from && rangeSelect.to ? [rangeSelect.from, rangeSelect.to] : null
  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={points}
        margin={{ top: markers.length ? 18 : 8, right: 8, bottom: 0, left: -18 }}
        style={rangeSelect ? { cursor: 'crosshair', userSelect: 'none' } : undefined}
        onMouseDown={rangeSelect ? (state) => { setDragStart(state?.activeLabel ?? null); setDragEnd(null) } : undefined}
        onMouseMove={rangeSelect ? (state) => { if (dragStart) setDragEnd(state?.activeLabel ?? null) } : undefined}
        onMouseUp={rangeSelect ? endDrag : undefined}
        onMouseLeave={rangeSelect ? () => { setDragStart(null); setDragEnd(null) } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border-default)' }} />
        <YAxis
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          allowDecimals={integerTicks(unit)}
          tickFormatter={tickFormatter(unit, language)}
          domain={unit.kind === 'percent' ? [0, 100] : undefined}
          label={axisLabel ? { value: axisLabel, angle: -90, position: 'insideLeft', style: AXIS } : undefined}
        />
        <Tooltip
          content={({ active, label, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as StackedAssetPoint
            return (
              <div style={{ ...TOOLTIP_SURFACE, padding: '6px 8px' }}>
                <div style={{ marginBottom: 4, color: 'var(--text-tertiary)' }}>{label}</div>
                {childrenBand ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: CHILDREN_COLOR }}>{childrenBand.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{point.children == null ? EMPTY_VALUE : formatValue(point.children)}</span>
                  </div>
                ) : null}
                {[...shown].reverse().map((key) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ color: ASSET_CLASS_COLOR[key] }}>{labels[key]}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{point[key] == null ? EMPTY_VALUE : formatValue(point[key]!)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4, borderTop: '1px solid var(--border-subtle)', paddingTop: 4, fontWeight: 500 }}>
                  <span>{labels.total}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(point.total)}</span>
                </div>
                {childrenBand ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{childrenBand.combinedLabel}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(point.total + (point.children ?? 0))}</span>
                  </div>
                ) : null}
              </div>
            )
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {starts.map((key) => (
          <ReferenceLine key={key} x={startsOn[key]} stroke={ASSET_CLASS_COLOR[key]} strokeDasharray="3 3" />
        ))}
        {markers.map((marker) => (
          <ReferenceLine
            key={`event-${marker.date}`}
            x={marker.date}
            stroke="var(--text-tertiary)"
            strokeDasharray="2 4"
            label={{ value: marker.label, position: 'top', fontSize: 10, fill: 'var(--text-secondary)' }}
          />
        ))}
        {shown.map((key) => (
          <Area
            key={key}
            type="linear"
            dataKey={key}
            name={labels[key]}
            stackId="assets"
            stroke={ASSET_CLASS_COLOR[key]}
            fill={ASSET_CLASS_COLOR[key]}
            fillOpacity={0.35}
            strokeWidth={1.5}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
        {childrenBand ? (
          <Area
            key="children"
            type="linear"
            dataKey="children"
            name={childrenBand.label}
            stackId="assets"
            stroke={CHILDREN_COLOR}
            fill={CHILDREN_COLOR}
            fillOpacity={0.2}
            strokeDasharray="4 2"
            strokeWidth={1.5}
            connectNulls={false}
            isAnimationActive={false}
          />
        ) : null}
        {selectedBand && !dragging ? (
          <ReferenceArea x1={selectedBand[0]} x2={selectedBand[1]} fill="var(--accent-link)" fillOpacity={0.12} stroke="var(--accent-link)" strokeOpacity={0.5} ifOverflow="visible" />
        ) : null}
        {dragging ? (
          <ReferenceArea x1={dragging[0]} x2={dragging[1]} fill="var(--accent-link)" fillOpacity={0.2} ifOverflow="visible" />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  )
  if (!rangeSelect) return chart
  return (
    <div>
      {selectedBand ? (
        <div className="mb-1 flex justify-end">
          <Link
            href={rangeSelect.clearHref}
            className="inline-flex min-h-6 items-center text-caption font-medium text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
          >
            {rangeSelect.clearLabel}
          </Link>
        </div>
      ) : null}
      {chart}
    </div>
  )
}

export function StackedBarChart({
  data,
  xKey,
  series,
  height = 240,
  yAxisLabel,
  allowDecimals = false,
  linkKey,
  toggleable = false,
  partial,
  unit,
  language,
  emptyMessage,
}: ChartContract & {
  data: Record<string, unknown>[]
  xKey: string
  series: { key: string; label: string; color: string }[]
  /** When set, `data[i][linkKey][seriesKey]` is the href a click on that
   *  segment opens. The hrefs are built by the page; the chart only navigates. */
  linkKey?: string
  height?: number
  yAxisLabel?: string
  allowDecimals?: boolean
  /** Clicking a legend item hides or shows that series, in this chart only. */
  toggleable?: boolean
  /** Rows whose `data[i][partial.key]` is true are drawn lighter, and their
   *  tooltip title adds `partial.label`: a period still in progress. */
  partial?: { key: string; label: string }
}) {
  const router = useRouter()
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: unknown) => {
    if (typeof key !== 'string') return
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const open = (seriesKey: string) => (entry: { payload?: Record<string, unknown> }) => {
    const links = linkKey ? (entry?.payload?.[linkKey] as Record<string, string> | undefined) : undefined
    const href = links?.[seriesKey]
    if (href) router.push(href)
  }
  if (!hasPlottablePoint(data, series.map((s) => s.key))) return <EmptyState>{emptyMessage}</EmptyState>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--border-default)' }} />
        <YAxis
          width={64}
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          allowDecimals={integerTicks(unit, allowDecimals)}
          tickFormatter={tickFormatter(unit, language)}
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', style: AXIS } : undefined}
        />
        <Tooltip
          cursor={{ fill: 'var(--bg-surface)' }}
          contentStyle={TOOLTIP_SURFACE}
          formatter={tooltipFormatter(unit, language)}
          labelFormatter={
            partial
              ? (label: ReactNode, payload: ReadonlyArray<{ payload?: Record<string, unknown> }>) =>
                  payload?.[0]?.payload?.[partial.key] ? `${label} · ${partial.label}` : label
              : undefined
          }
        />
        <Legend
          wrapperStyle={{ fontSize: 11, cursor: toggleable ? 'pointer' : undefined }}
          onClick={toggleable ? (entry: { dataKey?: unknown }) => toggle(entry.dataKey) : undefined}
        />
        {series.map((s) => (
          <Bar
            key={s.key}
            hide={hidden.has(s.key)}
            dataKey={s.key}
            stackId="a"
            fill={s.color}
            name={s.label}
            maxBarSize={28}
            onClick={linkKey ? open(s.key) : undefined}
            style={linkKey ? { cursor: 'pointer' } : undefined}
          >
            {partial ? data.map((row, i) => {
              const inProgress = Boolean(row[partial.key])
              return (
                <Cell
                  key={i}
                  fillOpacity={inProgress ? 0.4 : 1}
                  stroke={inProgress ? 'var(--text-secondary)' : undefined}
                />
              )
            }) : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
