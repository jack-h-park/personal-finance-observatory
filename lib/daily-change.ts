import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'
import { attribute } from '@/lib/market-attribution'

export type DailyChangePoint = {
  date: string
  KR: number
  US: number
  CRYPTO: number
  /** Sum of the three market effects. */
  total: number
  /** Priced portfolio value on the previous plotted date (the pair's start value). */
  previousTotal: number
  /** Securities the pair left out because they were unpriced on either date. */
  gaps: number
}

/**
 * One point per plotted date after the first: the market effect of each
 * market between that date and the one before it, with purchases and sales
 * kept out. A realized gain counts in the pair whose (from, to] contains its
 * sale date.
 */
export function dailyChangeSeries(input: {
  dates: readonly string[]
  rows: readonly PositionSnapshotRow[]
  realized: readonly RealizedGainRow[]
  held: readonly { market: string; ticker: string }[]
}): DailyChangePoint[] {
  const { dates } = input
  const indexOf = new Map<string, number>()
  dates.forEach((d, i) => indexOf.set(d, i))

  const rowsByDate = new Map<string, PositionSnapshotRow[]>()
  for (const r of input.rows) {
    if (!indexOf.has(r.date)) continue
    const list = rowsByDate.get(r.date)
    if (list) list.push(r)
    else rowsByDate.set(r.date, [r])
  }

  // Pair i runs from dates[i] to dates[i + 1]; a gain belongs to the first pair whose end is on or after its sale.
  const gainsByPair = new Map<number, RealizedGainRow[]>()
  for (const g of input.realized) {
    if (dates.length < 2 || g.soldDate <= dates[0] || g.soldDate > dates[dates.length - 1]) continue
    let lo = 1
    let hi = dates.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (dates[mid] >= g.soldDate) hi = mid
      else lo = mid + 1
    }
    const pair = lo - 1
    const list = gainsByPair.get(pair)
    if (list) list.push(g)
    else gainsByPair.set(pair, [g])
  }

  const points: DailyChangePoint[] = []
  for (let i = 0; i + 1 < dates.length; i++) {
    const from = dates[i]
    const to = dates[i + 1]
    const a = attribute({
      from,
      to,
      rows: [...(rowsByDate.get(from) ?? []), ...(rowsByDate.get(to) ?? [])],
      realized: gainsByPair.get(i) ?? [],
      held: input.held,
    })
    const { KR, US, CRYPTO } = a.byMarket
    points.push({
      date: to,
      KR: KR.marketEffect,
      US: US.marketEffect,
      CRYPTO: CRYPTO.marketEffect,
      total: KR.marketEffect + US.marketEffect + CRYPTO.marketEffect,
      previousTotal: a.startValue,
      gaps: a.breakdown.unpriced.length,
    })
  }
  return points
}

/** Each market effect and the total as a percent of the previous total (0 when that is 0). */
export function dailyChangeShares(points: readonly DailyChangePoint[]): DailyChangePoint[] {
  return points.map((p) => {
    const pct = (v: number) => (p.previousTotal === 0 ? 0 : (v / p.previousTotal) * 100)
    return { ...p, KR: pct(p.KR), US: pct(p.US), CRYPTO: pct(p.CRYPTO), total: pct(p.total) }
  })
}

export type CumulativeEffectPoint = Pick<DailyChangePoint, 'date' | 'total'>

/** Running sum on the measured dates, with a zero baseline on the first snapshot. */
export function cumulativeEffect(from: string, points: readonly DailyChangePoint[]): CumulativeEffectPoint[] {
  let sum = 0
  return [{ date: from, total: 0 }, ...points.map(({ date, total }) => ({ date, total: (sum += total) }))]
}
