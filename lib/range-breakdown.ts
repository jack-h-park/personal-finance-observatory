import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'

export type SecurityDriver = {
  market: string
  ticker: string
  name: string
  valueChange: number
  moneyIn: number
  marketEffect: number
  realized: number
}

export type Unpriced = { market: string; ticker: string; name: string; costKrw: number; missingOn: string[] }

export type RangeBreakdown = {
  from: string
  to: string
  securities: SecurityDriver[]
  unpriced: Unpriced[]
  marketEffectTotal: number
  moneyInTotal: number
}

const keyOf = (market: string, ticker: string) => `${market}:${ticker}`

/**
 * Splits each security's change in value between two dates into money put in
 * (or taken out) and the market effect. A security with a missing snapshot row
 * counts as zero on that date; one with an unpriced row is reported separately
 * and left out of every total.
 */
export function rangeBreakdown(input: { from: string; to: string; rows: PositionSnapshotRow[]; realized: RealizedGainRow[]; markets: string[] }): RangeBreakdown {
  const { from, to, markets } = input
  const rows = input.rows.filter((r) => markets.includes(r.market) && (r.date === from || r.date === to))

  const byKey = new Map<string, { market: string; ticker: string; name: string; a?: PositionSnapshotRow; b?: PositionSnapshotRow; realized: number }>()
  const marketsByTicker = new Map<string, Set<string>>()
  for (const r of rows) {
    const key = keyOf(r.market, r.ticker)
    const entry = byKey.get(key) ?? { market: r.market, ticker: r.ticker, name: r.name, realized: 0 }
    if (r.date === from) entry.a = r
    else entry.b = r
    // Prefer the most recent name.
    if (r.date === to || !entry.name) entry.name = r.name
    byKey.set(key, entry)
    const set = marketsByTicker.get(r.ticker) ?? new Set<string>()
    set.add(r.market)
    marketsByTicker.set(r.ticker, set)
  }

  for (const g of input.realized) {
    // A gain belongs to its own market's section; filtering after the
    // cross-market redirect below would count it in two sections.
    if (!markets.includes(g.market)) continue
    let key = keyOf(g.market, g.ticker)
    if (!byKey.has(key)) {
      // The same ticker can be recorded under another market (sheet lots vs bridge lots).
      const others = marketsByTicker.get(g.ticker)
      if (others && others.size === 1) key = keyOf([...others][0], g.ticker)
    }
    let entry = byKey.get(key)
    if (!entry) {
      entry = { market: g.market, ticker: g.ticker, name: g.ticker, realized: 0 }
      byKey.set(key, entry)
    }
    entry.realized += g.realizedKrw
  }

  const securities: SecurityDriver[] = []
  const unpriced: Unpriced[] = []
  for (const e of byKey.values()) {
    const missingOn: string[] = []
    if (e.a && e.a.marketValueKrw === null) missingOn.push(from)
    if (e.b && e.b.marketValueKrw === null) missingOn.push(to)
    if (missingOn.length > 0) {
      const unpricedRow = missingOn.includes(to) ? e.b : e.a
      unpriced.push({ market: e.market, ticker: e.ticker, name: e.name, costKrw: unpricedRow?.costKrw ?? 0, missingOn })
      continue
    }
    const mvA = e.a?.marketValueKrw ?? 0
    const mvB = e.b?.marketValueKrw ?? 0
    const costA = e.a?.costKrw ?? 0
    const costB = e.b?.costKrw ?? 0
    const valueChange = mvB - mvA
    const marketEffect = mvB - costB - (mvA - costA) + e.realized
    securities.push({ market: e.market, ticker: e.ticker, name: e.name, valueChange, moneyIn: valueChange - marketEffect, marketEffect, realized: e.realized })
  }

  securities.sort((x, y) => Math.abs(y.valueChange) - Math.abs(x.valueChange))
  return {
    from,
    to,
    securities,
    unpriced,
    marketEffectTotal: securities.reduce((s, d) => s + d.marketEffect, 0),
    moneyInTotal: securities.reduce((s, d) => s + d.moneyIn, 0),
  }
}

/** Keeps the first `n` drivers and sums the remainder into one "other" row. */
export function topDrivers(drivers: SecurityDriver[], n: number): { shown: SecurityDriver[]; other: (SecurityDriver & { count: number }) | null } {
  const shown = drivers.slice(0, n)
  const rest = drivers.slice(n)
  if (rest.length === 0) return { shown, other: null }
  const sum = (pick: (d: SecurityDriver) => number) => rest.reduce((s, d) => s + pick(d), 0)
  return {
    shown,
    other: {
      market: '',
      ticker: '',
      name: 'Other',
      valueChange: sum((d) => d.valueChange),
      moneyIn: sum((d) => d.moneyIn),
      marketEffect: sum((d) => d.marketEffect),
      realized: sum((d) => d.realized),
      count: rest.length,
    },
  }
}

/** The part of the headline investment result the per-security market effect does not explain. */
export function costBasisGap(breakdownMarketEffect: number, kpiInvestment: number | null): number | null {
  if (kpiInvestment === null) return null
  const gap = kpiInvestment - breakdownMarketEffect
  return Math.abs(gap) >= 1 ? gap : null
}
