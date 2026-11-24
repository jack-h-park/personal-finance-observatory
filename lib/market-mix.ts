/**
 * The /holdings market-mix trend: how the held securities split between the
 * Korean, US and crypto markets on each snapshot date, in KRW or as shares.
 * Pure, so the shaping is tested without a database.
 */

import { rowMarket } from './position-shares'

export const MIX_MARKETS = ['KR', 'US', 'CRYPTO'] as const
export type MixMarket = (typeof MIX_MARKETS)[number]

export type MixPoint = { date: string; total: number } & Record<MixMarket, number | null>

const finite = (value: number | null | undefined) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value))

/**
 * One point per plotted date before today, then today's from the holdings
 * themselves, so the last point is the table's own total rather than the
 * morning's snapshot. Each position row goes to the market it is held in now
 * (a Toss US stock is keyed KR in the snapshots), so the last past point does
 * not jump when today's holdings take over. A row with no value is skipped; a
 * market no row values is null (no area), not zero; a date with no market
 * valued at all is dropped. Dates on or after `today` are replaced by that point.
 */
export function marketMixSeries(
  rows: readonly { date: string; market: string; ticker: string; marketValueKrw: number | null }[],
  dates: readonly string[],
  holdings: readonly { market: string; ticker: string; base_market_value: number | null }[],
  today: string
): MixPoint[] {
  const held = new Map<string, Set<string>>()
  for (const h of holdings) {
    const markets = held.get(h.ticker) ?? new Set<string>()
    markets.add(h.market)
    held.set(h.ticker, markets)
  }
  const byDate = new Map<string, Record<MixMarket, number | null>>()
  for (const row of rows) {
    const value = finite(row.marketValueKrw)
    if (value == null) continue
    const market = rowMarket(row.market, row.ticker, held)
    if (!(MIX_MARKETS as readonly string[]).includes(market)) continue
    const values = byDate.get(row.date) ?? { KR: null, US: null, CRYPTO: null }
    values[market as MixMarket] = (values[market as MixMarket] ?? 0) + value
    byDate.set(row.date, values)
  }
  const points: MixPoint[] = []
  for (const date of [...new Set(dates)].sort()) {
    const values = byDate.get(date)
    if (date >= today || !values) continue
    points.push({ date, ...values, total: MIX_MARKETS.reduce((sum, market) => sum + (values[market] ?? 0), 0) })
  }

  const now: Record<MixMarket, number | null> = { KR: null, US: null, CRYPTO: null }
  for (const row of holdings) {
    if (!(MIX_MARKETS as readonly string[]).includes(row.market)) continue
    const value = finite(row.base_market_value)
    if (value == null) continue
    const market = row.market as MixMarket
    now[market] = (now[market] ?? 0) + value
  }
  if (MIX_MARKETS.some((market) => now[market] != null)) {
    points.push({ date: today, ...now, total: MIX_MARKETS.reduce((sum, market) => sum + (now[market] ?? 0), 0) })
  }
  return points
}

/** The same points as shares of each date's total, in percent; a market with no value stays null. */
export function mixShares(points: readonly MixPoint[]): MixPoint[] {
  return points.map((point) => {
    const share = (market: MixMarket) => (point[market] == null || point.total <= 0 ? null : (point[market]! / point.total) * 100)
    return { date: point.date, KR: share('KR'), US: share('US'), CRYPTO: share('CRYPTO'), total: point.total > 0 ? 100 : 0 }
  })
}

export type MixShare = { market: MixMarket; pct: number; changePp: number | null }

/**
 * Each market's share on the last point, and how many percentage points it
 * moved since the first point of the range. A market absent from the last
 * point is left out; its change is null when the first point did not value it.
 */
export function mixSummary(points: readonly MixPoint[]): MixShare[] {
  const shares = mixShares(points)
  const first = shares[0]
  const last = shares[shares.length - 1]
  if (!last) return []
  return MIX_MARKETS.flatMap((market) => {
    const pct = last[market]
    if (pct == null || pct <= 0) return []
    const start = shares.length > 1 ? first[market] : null
    return [{ market, pct, changePp: start == null ? null : pct - start }]
  })
}
