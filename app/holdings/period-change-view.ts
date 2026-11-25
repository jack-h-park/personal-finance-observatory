import { getDayChangeRows, getPositionSnapshots, getRealizedGains, getSnapshotDates, portfolioToday } from '@/lib/adapters/portfolio-db'
import type { PeriodChangeView } from '@/components/PeriodChangeCard'
import { cumulativeEffect, dailyChangeSeries } from '@/lib/daily-change'
import { dayChange } from '@/lib/day-change'
import { actualSummary, periodStart, type Basis, type Period } from '@/lib/period-change'

/** Days of snapshot dates read to find a period start: comfortably more than 1Y plus the YTD reach. */
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
 * Reads only what the selected period needs. 1D is the live day's change and
 * reads no snapshot history. Holdings return reads the day's-change rows with
 * the period start as the reference date. Actual P&L reads the snapshot rows
 * for the dates inside the period and the gains realized in it, once, and
 * takes both the headline (start and end rows) and the daily line from them.
 * Start and end are the first and last dates inside the period that have
 * position rows.
 */
export function periodChangeView(period: Period, basis: Basis, held: readonly { market: string; ticker: string }[]): PeriodChangeView {
  if (period === '1d') return { kind: 'live', change: dayChange(getDayChangeRows()) }

  const dates = getSnapshotDates(SNAPSHOT_LOOKBACK_DAYS, { daily: true })
  const start = periodStart(period, portfolioToday(), dates)
  if (!start) return { kind: 'empty' }

  if (basis === 'held') {
    return { kind: 'held', change: dayChange(getDayChangeRows({ referenceDate: start.date })), from: start.date, clamped: start.clamped }
  }

  const inRange = dates.filter((d) => d >= start.date)
  const rows = getPositionSnapshots(inRange)
  if (!rows) return { kind: 'empty' }
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
  // The line starts at zero on the period start.
  const points = dailyChangeSeries({ dates: measured, rows, realized, held })
  return { kind: 'actual', summary, spark: [0, ...cumulativeEffect(points)], gaps: points.reduce((sum, p) => sum + p.gaps, 0) }
}
