import { getDayChangeRows, getPositionSnapshots, getRealizedGains, getSnapshotDates, portfolioToday } from '@/lib/adapters/portfolio-db'
import type { PeriodChangeView } from '@/components/PeriodChangeCard'
import { cumulativeEffect, dailyChangeSeries } from '@/lib/daily-change'
import { previousMonthEnd } from '@/lib/calendar-dates.mjs'
import { dayChange } from '@/lib/day-change'
import { pricedSnapshotDates } from '@/lib/market-attribution'
import { actualSummary, isLongPeriod, longPeriodSnapshotDates, nominalStart, periodStart, type Basis, type Period } from '@/lib/period-change'

/** Days of snapshot dates read to find a period start: allow for 3Y, leap days and an earlier month-end fallback. */
const SNAPSHOT_LOOKBACK_DAYS = 400 * 3

/**
 * The dates inside the range that have position rows, or null when fewer than
 * two do: one date has nothing to compare with (every row would read as bought
 * and the end as zero).
 */
export function measuredDates(dates: readonly string[], rows: readonly { date: string }[]): string[] | null {
  // Only dates with position rows can be measured: a date without them would read as selling (or buying) everything.
  const rowDates = new Set(rows.map((r) => r.date))
  const measured = dates.filter((d) => rowDates.has(d))
  return measured.length >= 2 ? measured : null
}

/**
 * 1D reads live quotes. Longer periods compare snapshots or use the start as a
 * quote reference for today's holdings. 2Y and 3Y read month-ends and the two
 * endpoints, matching the reference date produced by the history backfill.
 */
export function periodChangeView(period: Period, basis: Basis, held: readonly { market: string; ticker: string }[]): PeriodChangeView {
  if (period === '1d') return { kind: 'live', change: dayChange(getDayChangeRows()) }

  const today = portfolioToday()
  const dates = getSnapshotDates(SNAPSHOT_LOOKBACK_DAYS, { daily: true })
  const long = isLongPeriod(period)
  const latest = long ? dates.findLast((date) => date <= today) : today
  if (!latest) return { kind: 'empty' }

  // Backfill uses the latest stored date for its long-range reference dates.
  const requestedStart = long ? nominalStart(period, latest) : undefined
  const referenceRows = requestedStart
    ? getPositionSnapshots([requestedStart, previousMonthEnd(requestedStart)], { longPeriod: true }) ?? []
    : []
  const start = periodStart(period, latest, long ? pricedSnapshotDates(referenceRows, held) : dates)
  if (!start) return { kind: 'empty' }

  if (basis === 'held') {
    return { kind: 'held', change: dayChange(getDayChangeRows({ referenceDate: start.date })), from: start.date, clamped: start.clamped, requestedStart }
  }

  const inRange = long
    ? longPeriodSnapshotDates(dates.filter((date) => date !== requestedStart), start.date, latest)
    : dates.filter((date) => date >= start.date)
  const positionRows = getPositionSnapshots(long ? inRange.slice(1) : inRange)
  if (!positionRows) return { kind: 'empty' }
  if (long && pricedSnapshotDates(positionRows.filter((row) => row.date === latest), held).length === 0) return { kind: 'empty' }
  const rows = long ? [...referenceRows.filter((row) => row.date === start.date), ...positionRows] : positionRows
  const measured = measuredDates(inRange, rows)
  if (!measured) return { kind: 'empty' }
  const from = measured[0]
  const to = measured[measured.length - 1]
  const realized = getRealizedGains(from, to)
  const summary = actualSummary({
    from,
    to,
    clamped: start.clamped,
    rows: rows.filter((r) => r.date === from || r.date === to),
    realized,
    held,
  })
  const points = dailyChangeSeries({ dates: measured, rows, realized, held })
  return { kind: 'actual', summary, requestedStart, cumulative: cumulativeEffect(from, points), gaps: points.reduce((sum, p) => sum + p.gaps, 0) }
}
