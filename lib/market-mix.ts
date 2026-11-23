/**
 * The /holdings market-mix trend: how the held securities split between the
 * Korean, US and crypto markets on each snapshot date, in KRW or as shares.
 * Pure, so the shaping is tested without a database.
 */

export const MIX_MARKETS = ['KR', 'US', 'CRYPTO'] as const
export type MixMarket = (typeof MIX_MARKETS)[number]

export type MixPoint = { date: string; total: number } & Record<MixMarket, number | null>

type SnapshotValues = {
  snapshot_date: string
  kr_market_value: number | null
  us_market_value_base: number | null
  crypto_market_value_base: number | null
}

const finite = (value: number | null | undefined) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value))

/**
 * One point per past snapshot, then today's from the holdings themselves, so
 * the last point is the table's own total rather than the morning's snapshot.
 * A snapshot on or after `today` is replaced by that point. A market a
 * snapshot does not value is null (no area), not zero; a date with no market
 * valued at all is dropped.
 */
export function marketMixSeries(
  snapshots: readonly SnapshotValues[],
  holdings: readonly { market: string; base_market_value: number | null }[],
  today: string
): MixPoint[] {
  const points: MixPoint[] = []
  for (const snapshot of [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))) {
    if (snapshot.snapshot_date >= today) continue
    const values = {
      KR: finite(snapshot.kr_market_value),
      US: finite(snapshot.us_market_value_base),
      CRYPTO: finite(snapshot.crypto_market_value_base),
    }
    if (MIX_MARKETS.every((market) => values[market] == null)) continue
    points.push({ date: snapshot.snapshot_date, ...values, total: MIX_MARKETS.reduce((sum, market) => sum + (values[market] ?? 0), 0) })
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
