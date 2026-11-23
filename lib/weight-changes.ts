/**
 * The /holdings weight-change table: for two snapshot dates, each security's
 * share at the start and at the end, and how much of its KRW value change came
 * from buying or selling and how much from price. Pure, so it is tested
 * without a database.
 */
import { rowMarket, type ShareScope } from '@/lib/position-shares'

export type ChangeRow = { date: string; market: string; ticker: string; name: string; quantity: number; marketValueKrw: number | null }

export type WeightChange = {
  key: string
  market: string
  ticker: string
  name: string
  startPct: number
  endPct: number
  changePp: number
  startValue: number
  endValue: number
  /**
   * Quantity change at the start price: (q₁ − q₀) × v₀ / q₀. A security bought
   * during the period counts its whole end value here, one sold out its whole
   * start value. A split also changes the quantity, so it reads as trading.
   */
  tradeKrw: number
  /** The rest of the value change: q₁ × (p₁ − p₀), FX included for a foreign listing. */
  priceKrw: number
}

type Position = { name: string; market: string; ticker: string; quantity: number; value: number | null }

function positionsOn(rows: readonly ChangeRow[], date: string, scope: ShareScope, heldMarkets: ReadonlyMap<string, ReadonlySet<string>>) {
  const positions = new Map<string, Position>()
  for (const row of rows) {
    if (row.date !== date) continue
    const market = rowMarket(row.market, row.ticker, heldMarkets)
    if (scope !== 'all' && market !== scope) continue
    const key = `${market}:${row.ticker}`
    const current = positions.get(key) ?? { name: row.name || row.ticker, market, ticker: row.ticker, quantity: 0, value: 0 }
    current.quantity += Number(row.quantity) || 0
    current.value = current.value == null || row.marketValueKrw == null ? null : current.value + row.marketValueKrw
    positions.set(key, current)
  }
  return positions
}

/**
 * Every security held on either date, largest share move first. Null when
 * either date has no in-scope rows or any of them is unpriced: shares of a
 * partial total would be wrong for every row, not just the unpriced one.
 */
export function weightChanges({
  rows,
  from,
  to,
  held,
  scope,
}: {
  rows: readonly ChangeRow[]
  from: string
  to: string
  held: readonly { market: string; ticker: string }[]
  scope: ShareScope
}): WeightChange[] | null {
  const heldMarkets = new Map<string, Set<string>>()
  for (const h of held) {
    const set = heldMarkets.get(h.ticker) ?? new Set<string>()
    set.add(h.market)
    heldMarkets.set(h.ticker, set)
  }
  const start = positionsOn(rows, from, scope, heldMarkets)
  const end = positionsOn(rows, to, scope, heldMarkets)
  const totalOf = (positions: Map<string, Position>) => {
    if (positions.size === 0) return null
    let sum = 0
    for (const p of positions.values()) {
      if (p.value == null) return null
      sum += p.value
    }
    return sum > 0 ? sum : null
  }
  const startTotal = totalOf(start)
  const endTotal = totalOf(end)
  if (startTotal == null || endTotal == null) return null

  const keys = new Set([...start.keys(), ...end.keys()])
  const changes: WeightChange[] = []
  for (const key of keys) {
    const a = start.get(key)
    const b = end.get(key)
    const q0 = a?.quantity ?? 0
    const q1 = b?.quantity ?? 0
    const v0 = a?.value ?? 0
    const v1 = b?.value ?? 0
    if (v0 === 0 && v1 === 0) continue
    const tradeKrw = q0 > 0 ? (q1 - q0) * (v0 / q0) : v1
    const startPct = (v0 / startTotal) * 100
    const endPct = (v1 / endTotal) * 100
    const ref = b ?? a!
    changes.push({
      key,
      market: ref.market,
      ticker: ref.ticker,
      name: ref.name,
      startPct,
      endPct,
      changePp: endPct - startPct,
      startValue: v0,
      endValue: v1,
      tradeKrw,
      priceKrw: v1 - v0 - tradeKrw,
    })
  }
  return changes.sort((x, y) => Math.abs(y.changePp) - Math.abs(x.changePp) || x.key.localeCompare(y.key))
}
