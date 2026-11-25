import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'
import { ATTRIBUTION_MARKETS, attribute, type AttributionMarket } from '@/lib/market-attribution'
import { topDrivers, type SecurityDriver } from '@/lib/range-breakdown'

export const PERIODS = ['1d', '1w', '1m', '3m', 'ytd', '1y'] as const
export type Period = (typeof PERIODS)[number]
export type Basis = 'actual' | 'held'

export function resolvePeriod(param: unknown): Period {
  return PERIODS.find((p) => p === param) ?? '1d'
}

export function resolveBasis(param: unknown): Basis {
  return param === 'held' ? 'held' : 'actual'
}

const pad = (n: number) => String(n).padStart(2, '0')
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Steps back whole months, clamping to the last day of the target month. */
function monthsBack(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const index = y * 12 + (m - 1) - months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${pad(month)}-${pad(Math.min(d, daysIn(year, month)))}`
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
  }
}

/** Latest snapshot on or before the nominal start; the earliest one, flagged, when none reaches back that far. */
export function periodStart(
  period: Exclude<Period, '1d'>,
  today: string,
  snapshotDates: readonly string[],
): { date: string; clamped: boolean } | null {
  if (snapshotDates.length === 0) return null
  const nominal = nominalStart(period, today)
  let best: string | null = null
  let earliest = snapshotDates[0]
  for (const d of snapshotDates) {
    if (d < earliest) earliest = d
    if (d <= nominal && (best === null || d > best)) best = d
  }
  return best !== null ? { date: best, clamped: false } : { date: earliest, clamped: true }
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
