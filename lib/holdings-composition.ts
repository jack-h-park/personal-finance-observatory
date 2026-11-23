/**
 * The /holdings composition panels: the largest positions, how concentrated
 * the list is, and which positions carry the unrealized gain or loss. Every
 * figure is per security, summed across the accounts that hold it, over the
 * rows the table currently shows. Pure, so it is tested without a database.
 */

type HoldingRow = {
  market: string
  ticker: string
  name: string | null
  base_market_value: number | null
  base_unrealized_gl: number | null
}

export type Security = {
  /** `market:ticker` */
  key: string
  market: string
  ticker: string
  name: string
  /** Null when any contributing row is unpriced: a partial sum would read as the whole position. */
  value: number | null
  gain: number | null
}

const finite = (value: number | null | undefined) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value))

export function aggregateSecurities(rows: readonly HoldingRow[]): Security[] {
  const bySecurity = new Map<string, Security>()
  for (const row of rows) {
    const key = `${row.market}:${row.ticker}`
    const current = bySecurity.get(key) ?? { key, market: row.market, ticker: row.ticker, name: row.name || row.ticker, value: 0, gain: 0 }
    const value = finite(row.base_market_value)
    const gain = finite(row.base_unrealized_gl)
    current.value = current.value == null || value == null ? null : current.value + value
    current.gain = current.gain == null || gain == null ? null : current.gain + gain
    bySecurity.set(key, current)
  }
  return [...bySecurity.values()]
}

/** Each priced security's share of the priced total, in percent, largest first. */
export function securityWeights(securities: readonly Security[]): (Security & { value: number; pct: number })[] {
  const priced = securities.filter((s): s is Security & { value: number } => s.value != null && s.value > 0)
  const total = priced.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) return []
  return priced
    .map((s) => ({ ...s, pct: (s.value / total) * 100 }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
}

export type Concentration = {
  /** Securities with a known value, the ones the shares are of. */
  count: number
  top5Pct: number
  top10Pct: number
  /**
   * The number of equal-sized holdings that would be exactly as concentrated:
   * 1 / Σ wᵢ² over the weights as fractions (the inverse Herfindahl index).
   */
  effectiveCount: number
}

export function concentration(securities: readonly Security[]): Concentration | null {
  const weights = securityWeights(securities)
  if (weights.length === 0) return null
  const sumTop = (n: number) => weights.slice(0, n).reduce((sum, s) => sum + s.pct, 0)
  const hhi = weights.reduce((sum, s) => sum + (s.pct / 100) ** 2, 0)
  return { count: weights.length, top5Pct: sumTop(5), top10Pct: sumTop(10), effectiveCount: 1 / hhi }
}

/** The largest unrealized gains and losses, `n` of each; a security with no known gain is in neither. */
export function gainContributors(securities: readonly Security[], n = 5) {
  const known = securities.filter((s): s is Security & { gain: number } => s.gain != null && s.gain !== 0)
  return {
    gainers: known.filter((s) => s.gain > 0).sort((a, b) => b.gain - a.gain || a.key.localeCompare(b.key)).slice(0, n),
    losers: known.filter((s) => s.gain < 0).sort((a, b) => a.gain - b.gain || a.key.localeCompare(b.key)).slice(0, n),
  }
}
