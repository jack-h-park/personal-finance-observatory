import { isCalendarMonthEnd, LONG_HOLDINGS_PERIOD_MONTHS, monthsBack, previousMonthEnd } from '@/lib/calendar-dates.mjs'
import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'
import { ATTRIBUTION_MARKETS, attribute, type AttributionMarket } from '@/lib/market-attribution'
import { topDrivers, type SecurityDriver } from '@/lib/range-breakdown'

export const PERIODS = ['1d', '1w', '1m', '3m', 'ytd', '1y', '2y', '3y'] as const
export type Period = (typeof PERIODS)[number]
export type Basis = 'actual' | 'held'

export function resolvePeriod(param: unknown): Period {
  return PERIODS.find((p) => p === param) ?? '1d'
}

export function resolveBasis(param: unknown): Basis {
  return param === 'held' ? 'held' : 'actual'
}

export function isLongPeriod(period: Period): period is keyof typeof LONG_HOLDINGS_PERIOD_MONTHS {
  return Object.hasOwn(LONG_HOLDINGS_PERIOD_MONTHS, period)
}

/** The calendar date a period reaches back to, before snapshots are consulted. */
export function nominalStart(period: Exclude<Period, '1d'>, today: string): string {
  switch (period) {
    case '1w': {
      const t = new Date(`${today}T00:00:00Z`)
      t.setUTCDate(t.getUTCDate() - 7)
      return t.toISOString().slice(0, 10)
    }
    case '1m':
      return monthsBack(today, 1)
    case '3m':
      return monthsBack(today, 3)
    case 'ytd':
      return `${Number(today.slice(0, 4)) - 1}-12-31`
    case '1y':
      return monthsBack(today, 12)
    case '2y':
    case '3y':
      return monthsBack(today, LONG_HOLDINGS_PERIOD_MONTHS[period])
  }
}

/** The chart includes the selected start, calendar month-ends, and the latest evaluation. */
export function longPeriodSnapshotDates(dates: readonly string[], from: string, latest: string): string[] {
  return [from, ...dates.filter((date) => date > from && date <= latest && (date === latest || isCalendarMonthEnd(date)))]
}

/** How far past the nominal start a snapshot may sit, and how far before it one may sit, to be taken as the start. */
const START_TOLERANCE_DAYS = 4

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000

/**
 * Long ranges use the exact reference date or the previous calendar month-end. Short ranges use the stored snapshot nearest the nominal start: the latest one on or before
 * it, unless that is more than four days early (or absent) and one exists
 * within four days after it, which then wins. 365 days is 52 weeks and a day,
 * and a leap span adds another, so the weekday window of stored snapshots can
 * begin just after the nominal date. With neither, the earliest snapshot,
 * flagged as clamped.
 */
export function periodStart(
  period: Exclude<Period, '1d'>,
  today: string,
  snapshotDates: readonly string[],
): { date: string; clamped: boolean } | null {
  if (snapshotDates.length === 0) return null
  const nominal = nominalStart(period, today)
  if (isLongPeriod(period)) {
    if (snapshotDates.includes(nominal)) return { date: nominal, clamped: false }
    const monthEnd = previousMonthEnd(nominal)
    return snapshotDates.includes(monthEnd) ? { date: monthEnd, clamped: false } : null
  }
  const nominalDay = dayNumber(nominal)
  let before: string | null = null
  let after: string | null = null
  let earliest = snapshotDates[0]
  for (const d of snapshotDates) {
    if (d < earliest) earliest = d
    if (d <= nominal) {
      if (before === null || d > before) before = d
    } else if (dayNumber(d) - nominalDay <= START_TOLERANCE_DAYS && (after === null || d < after)) {
      after = d
    }
  }
  const beforeIsClose = before !== null && nominalDay - dayNumber(before) <= START_TOLERANCE_DAYS
  if (before !== null && (beforeIsClose || after === null)) return { date: before, clamped: false }
  if (after !== null) return { date: after, clamped: false }
  return { date: earliest, clamped: true }
}

export type ActualSummary = {
  from: string
  to: string
  clamped: boolean
  startValue: number
  endValue: number
  moneyIn: number
  marketEffect: number
  pct: number | null
  markets: { market: AttributionMarket; marketEffect: number; moneyIn: number; pct: number | null }[]
  up: SecurityDriver[]
  down: SecurityDriver[]
  unpriced: number
}

const ratio = (effect: number, start: number) => (start > 0 ? effect / start : null)

export function actualSummary(input: {
  from: string
  to: string
  clamped: boolean
  rows: readonly PositionSnapshotRow[]
  realized: readonly RealizedGainRow[]
  held: readonly { market: string; ticker: string }[]
}): ActualSummary {
  const a = attribute(input)
  const markets = ATTRIBUTION_MARKETS.map((market) => {
    const t = a.byMarket[market]
    return { market, marketEffect: t.marketEffect, moneyIn: t.moneyIn, pct: ratio(t.marketEffect, t.startValue) }
  })
  const moneyIn = markets.reduce((s, m) => s + m.moneyIn, 0)
  const marketEffect = markets.reduce((s, m) => s + m.marketEffect, 0)
  const nonZero = a.breakdown.securities.filter((s) => s.marketEffect !== 0)
  const up = topDrivers(
    nonZero.filter((s) => s.marketEffect > 0).sort((x, y) => y.marketEffect - x.marketEffect),
    5,
  ).shown
  const down = topDrivers(
    nonZero.filter((s) => s.marketEffect < 0).sort((x, y) => x.marketEffect - y.marketEffect),
    5,
  ).shown
  return {
    from: input.from,
    to: input.to,
    clamped: input.clamped,
    startValue: a.startValue,
    endValue: a.endValue,
    moneyIn,
    marketEffect,
    pct: ratio(marketEffect, a.startValue),
    markets,
    up,
    down,
    unpriced: a.breakdown.unpriced.length,
  }
}
