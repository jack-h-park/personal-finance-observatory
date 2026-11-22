import { TREND_RANGES, trendRangeDays, type TrendRange } from '@/lib/trend-ranges'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function validIsoDate(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value
  if (!text || !ISO_DATE.test(text)) return null
  const parsed = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) return null
  return text
}

/**
 * The `?from=&to=` period as two plotted snapshot dates, or null when either
 * is not a date or both land on the same snapshot. Reversed params are swapped
 * and each side snaps to the latest snapshot on or before it; a start before
 * the first snapshot snaps to the first.
 */
export function resolveRangeSelection(
  from: string | string[] | undefined,
  to: string | string[] | undefined,
  dates: string[],
): { from: string; to: string } | null {
  const a = validIsoDate(from)
  const b = validIsoDate(to)
  if (!a || !b || dates.length === 0) return null
  const sorted = [...dates].sort()
  const snap = (date: string) => {
    let found = sorted[0]
    for (const candidate of sorted) {
      if (candidate <= date) found = candidate
      else break
    }
    return found
  }
  const [low, high] = a <= b ? [a, b] : [b, a]
  const snappedFrom = snap(low)
  const snappedTo = snap(high)
  if (snappedFrom === snappedTo) return null
  return { from: snappedFrom, to: snappedTo }
}

/**
 * The trend window that still contains `from`: the selected one when it
 * reaches that far back, else the smallest wider period, else All.
 */
export function trendRangeCovering(selected: TrendRange, from: string, today: string): TrendRange {
  const [y, m, d] = today.split('-').map(Number)
  const now = new Date(y, m - 1, d)
  const reaches = (range: TrendRange) => {
    const start = new Date(y, m - 1, d - trendRangeDays(range.days, now))
    const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    return iso <= from
  }
  if (reaches(selected)) return selected
  const wider = TREND_RANGES.filter((range) => range.days !== 'ytd')
    .sort((p, q) => (p.days as number) - (q.days as number))
    .find(reaches)
  return wider ?? TREND_RANGES.find((range) => range.key === 'all')!
}

/**
 * Whether a trend link keeps the selected period. A window that reaches back
 * to `from` keeps it; a narrower one drops it, because an explicit narrower
 * choice wins over a selection the reader can no longer see.
 */
export function keepsSelection(trend: TrendRange, from: string, today: string): boolean {
  return trendRangeCovering(trend, from, today).key === trend.key
}

/** `baseHref` with `from` and `to` set (replacing any present); other params stay. */
export function rangeHref(baseHref: string, from: string, to: string): string {
  const [path, query = ''] = baseHref.split('?')
  const params = new URLSearchParams(query)
  params.set('from', from)
  params.set('to', to)
  return `${path}?${params.toString()}`
}

/**
 * The two labels of a chart drag as `[earlier, later]`, whichever way it was
 * dragged; null when either end is missing (the drag left the plotted points)
 * or both ends are the same point.
 */
export function orderedDragRange(
  startLabel: string | null | undefined,
  endLabel: string | null | undefined,
): [string, string] | null {
  if (!startLabel || !endLabel || startLabel === endLabel) return null
  return startLabel < endLabel ? [startLabel, endLabel] : [endLabel, startLabel]
}
