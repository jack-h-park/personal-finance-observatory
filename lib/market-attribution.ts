import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'
import { rowMarket } from '@/lib/position-shares'
import { rangeBreakdown, type RangeBreakdown } from '@/lib/range-breakdown'

export const ATTRIBUTION_MARKETS = ['KR', 'US', 'CRYPTO'] as const
export type AttributionMarket = (typeof ATTRIBUTION_MARKETS)[number]
export type MarketEffects = Record<AttributionMarket, number>

export type MarketTotals = { marketEffect: number; moneyIn: number; valueChange: number; startValue: number; endValue: number }

export type Attribution = {
  /** Over the remapped rows and gains. */
  breakdown: RangeBreakdown
  byMarket: Record<AttributionMarket, MarketTotals>
  /** Sums of the priced snapshot values on `from` and `to`. */
  startValue: number
  endValue: number
}

/** Ticker to the markets that hold it now, the shape `rowMarket` reads. */
export function heldMarketMap(held: readonly { market: string; ticker: string }[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const h of held) {
    const set = map.get(h.ticker) ?? new Set<string>()
    set.add(h.market)
    map.set(h.ticker, set)
  }
  return map
}

/** Re-keys each row to the market its security is held in now (see `rowMarket`). */
export function remapToHeld<T extends { market: string; ticker: string }>(rows: readonly T[], held: ReadonlyMap<string, ReadonlySet<string>>): T[] {
  return rows.map((r) => ({ ...r, market: rowMarket(r.market, r.ticker, held) }))
}

/** Sums rows that share date, market and ticker; unpriced if either part is. */
function mergeRows(rows: readonly PositionSnapshotRow[]): PositionSnapshotRow[] {
  const merged = new Map<string, PositionSnapshotRow>()
  for (const r of rows) {
    const key = `${r.date}|${r.market}|${r.ticker}`
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, { ...r })
      continue
    }
    prev.quantity += r.quantity
    prev.costKrw += r.costKrw
    prev.marketValueKrw = prev.marketValueKrw === null || r.marketValueKrw === null ? null : prev.marketValueKrw + r.marketValueKrw
  }
  return [...merged.values()]
}

/** Dates with a priced security after combining rows that share a displayed market. */
export function pricedSnapshotDates(rows: readonly PositionSnapshotRow[], held: readonly { market: string; ticker: string }[]): string[] {
  const merged = mergeRows(remapToHeld(rows, heldMarketMap(held)))
  return [...new Set(merged.filter((row) => row.marketValueKrw !== null).map((row) => row.date))]
}

const emptyTotals = (): MarketTotals => ({ marketEffect: 0, moneyIn: 0, valueChange: 0, startValue: 0, endValue: 0 })

/**
 * `rangeBreakdown` over rows and gains re-keyed to the markets held now, with
 * the result split by market. A security unpriced on either date is left out
 * of the market values as well as the effects, so start + money in + effect
 * equals end.
 */
export function attribute(input: {
  from: string
  to: string
  rows: readonly PositionSnapshotRow[]
  realized: readonly RealizedGainRow[]
  held: readonly { market: string; ticker: string }[]
}): Attribution {
  const heldMap = heldMarketMap(input.held)
  // Remapping can put two rows on one key; rangeBreakdown keeps only the last, so merge first.
  const rows = mergeRows(remapToHeld(input.rows, heldMap))
  const realized = remapToHeld(input.realized, heldMap)
  const breakdown = rangeBreakdown({ from: input.from, to: input.to, rows, realized, markets: [...ATTRIBUTION_MARKETS] })

  const byMarket: Record<AttributionMarket, MarketTotals> = { KR: emptyTotals(), US: emptyTotals(), CRYPTO: emptyTotals() }
  for (const s of breakdown.securities) {
    const totals = byMarket[s.market as AttributionMarket]
    if (!totals) continue
    totals.marketEffect += s.marketEffect
    totals.moneyIn += s.moneyIn
    totals.valueChange += s.valueChange
  }

  const unpriced = new Set(breakdown.unpriced.map((u) => `${u.market}:${u.ticker}`))
  let startValue = 0
  let endValue = 0
  for (const r of rows) {
    if (r.date !== input.from && r.date !== input.to) continue
    if (r.marketValueKrw === null || unpriced.has(`${r.market}:${r.ticker}`)) continue
    const totals = byMarket[r.market]
    if (!totals) continue
    if (r.date === input.from) {
      startValue += r.marketValueKrw
      totals.startValue += r.marketValueKrw
    } else {
      endValue += r.marketValueKrw
      totals.endValue += r.marketValueKrw
    }
  }
  return { breakdown, byMarket, startValue, endValue }
}
