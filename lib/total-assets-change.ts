import type { TotalAssetsPoint } from '@/lib/net-worth'

const CLASS_KEYS = ['stocks', 'crypto', 'cash', 'pensions', 'gold'] as const
export type ClassKey = (typeof CLASS_KEYS)[number]

export type TotalAssetsChange = {
  /** The snapshot the change is measured from: the latest one on or before `since`. */
  baseDate: string
  change: number
  /** Null when the base total is zero. */
  pct: number | null
  /** Classes with no value at the base date that have one now; their arrival is part of the change. */
  addedClasses: ClassKey[]
  /** Each class's share of the change, largest move first; classes that did not move are left out. */
  byClass: ClassDriver[]
}

export type ClassDriver = { key: ClassKey; change: number }

/**
 * The change in total assets from the latest point on or before `since` to the
 * last point. Null when no point is that old, or the last point is the base:
 * an unavailable change, not a zero one.
 */
export function totalAssetsChange(points: TotalAssetsPoint[], since: string): TotalAssetsChange | null {
  const latest = points[points.length - 1]
  let base: TotalAssetsPoint | undefined
  for (const point of points) if (point.date <= since) base = point
  if (!latest || !base || base.date >= latest.date) return null
  const change = latest.total - base.total
  return {
    baseDate: base.date,
    change,
    pct: base.total !== 0 ? (change / Math.abs(base.total)) * 100 : null,
    addedClasses: CLASS_KEYS.filter((key) => base[key] == null && latest[key] != null),
    byClass: CLASS_KEYS.map((key) => ({ key, change: (latest[key] ?? 0) - (base[key] ?? 0) }))
      .filter((driver) => driver.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
  }
}

/** ISO date `days` before `today` (YYYY-MM-DD in, YYYY-MM-DD out, UTC arithmetic). */
export function isoDaysBefore(today: string, days: number): string {
  const at = new Date(`${today}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() - days)
  return at.toISOString().slice(0, 10)
}

/**
 * The last day of the month `months` before the month of `today`: 1 is the
 * previous month's end. History keeps month-end snapshots, so a period measured
 * from a month end compares like with like; "30 days ago" would fall mid-month
 * and reach back to the month end before it.
 */
export function monthEndBefore(today: string, months: number): string {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) - 1
  return new Date(Date.UTC(year, month - months + 1, 0)).toISOString().slice(0, 10)
}

/** The last day of the previous year: the base of a year-to-date change. */
export function previousYearEnd(today: string): string {
  return `${Number(today.slice(0, 4)) - 1}-12-31`
}

/** A portfolio snapshot's gains: unrealized at that date, and realized to date (running sum of every sale). */
export type InvestmentPoint = { date: string; unrealized: number | null; realized: number | null }

export type InvestmentResult = { unrealized: number; realized: number; total: number }

/**
 * What investing earned between the latest snapshot on or before `since` and
 * the last snapshot: the change in unrealized gain plus the gain realized in
 * between. Money moved in or out is not in it, so beside a change in total
 * assets it separates returns from savings. Null when no snapshot is that old,
 * the last snapshot is the base, or either end has no unrealized figure.
 */
export function investmentResult(points: InvestmentPoint[], since: string): InvestmentResult | null {
  const latest = points[points.length - 1]
  let base: InvestmentPoint | undefined
  for (const point of points) if (point.date <= since) base = point
  if (!latest || !base || base.date >= latest.date || latest.unrealized == null || base.unrealized == null) return null
  const unrealized = latest.unrealized - base.unrealized
  const realized = (latest.realized ?? 0) - (base.realized ?? 0)
  return { unrealized, realized, total: unrealized + realized }
}
