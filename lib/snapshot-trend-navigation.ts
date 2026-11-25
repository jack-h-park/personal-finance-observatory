import { resolveTrendScope, TREND_METRICS, type TrendMetricKey } from './overview-trend'
import { resolveTrendRange } from './trend-ranges'

export const SNAPSHOT_TREND_ID = 'snapshot-trend'

type SearchParams = Record<string, string | string[] | undefined>

const LEGACY_METRICS: Record<string, TrendMetricKey> = {
  global_base_market_value: 'market_value',
  global_base_cost: 'cost_basis',
  global_base_unrealized_gl: 'unrealized_gl',
  global_base_return_pct: 'return_pct',
}

export function resolveSnapshotTrendSelection(params: SearchParams) {
  const read = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  const metric = read('metric')
  const metricKey = metric && Object.hasOwn(LEGACY_METRICS, metric) ? LEGACY_METRICS[metric] : metric
  const view: 'single' | 'combined' = read('view') === 'single' ? 'single' : 'combined'
  const realizedAxis: 'shared' | 'right' = read('realizedAxis') === 'shared' ? 'shared' : 'right'

  return {
    trend: resolveTrendRange(params.trend).key,
    scope: resolveTrendScope(read('scope')),
    metric: TREND_METRICS.find(({ key }) => key === metricKey)?.key ?? TREND_METRICS[0].key,
    view,
    realizedAxis,
  }
}

export type SnapshotTrendSelection = ReturnType<typeof resolveSnapshotTrendSelection>

export const HOLDINGS_SNAPSHOT_PARAMS = {
  trend: 'snapshotRange',
  scope: 'snapshotScope',
  metric: 'snapshotMetric',
  view: 'snapshotView',
  realizedAxis: 'realizedAxis',
} as const satisfies Record<keyof SnapshotTrendSelection, string>

const selectionKeys = Object.keys(HOLDINGS_SNAPSHOT_PARAMS) as (keyof SnapshotTrendSelection)[]

export function holdingsSnapshotSelection(params: SearchParams): SnapshotTrendSelection {
  return resolveSnapshotTrendSelection(Object.fromEntries(
    selectionKeys.map((key) => [key, params[HOLDINGS_SNAPSHOT_PARAMS[key]]]),
  ))
}

export function snapshotTrendDetailsHref(selection: SnapshotTrendSelection): string {
  const query = new URLSearchParams(selectionKeys.map((key) => [HOLDINGS_SNAPSHOT_PARAMS[key], selection[key]]))
  return `/holdings?${query}#${SNAPSHOT_TREND_ID}`
}
