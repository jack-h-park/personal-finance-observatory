/**
 * The /holdings security-weight trend: each security's share of the held
 * value on each snapshot date, for the top securities plus any the reader
 * pinned, with the rest folded into "Other". Pure, so it is tested without a
 * database.
 */

export const SHARE_SCOPES = ['all', 'KR', 'US', 'CRYPTO'] as const
export type ShareScope = (typeof SHARE_SCOPES)[number]

/** How many securities get their own band; the categorical palette has eight colours. */
export const MAX_SHARE_SERIES = 8

export type ShareRow = { date: string; market: string; ticker: string; name: string; marketValueKrw: number | null; costKrw?: number | null }

export type ShareSeries = {
  /** The chart's field for this security: `s0`… A ticker such as BRK.B cannot be a recharts key. */
  id: string
  /** `market:ticker`, as holdings and the `pin` parameter spell it. */
  key: string
  name: string
  market: string
  pinned: boolean
}

export type SharePoint = { date: string; total: number; other: number | null } & Record<string, number | null | string>

/** What a date left out of its shares: securities with no price that day, and their share of the in-scope cost. */
export type ShareExclusion = { date: string; count: number; costPct: number | null }

/**
 * The dates a weight trend plots: the last snapshot of each past month, and
 * every snapshot of the newest month, where the ingest has written daily rows.
 */
export function shareDates(dates: readonly string[]): string[] {
  const sorted = [...new Set(dates)].sort()
  const newestMonth = sorted.at(-1)?.slice(0, 7)
  const lastOfMonth = new Map<string, string>()
  for (const date of sorted) lastOfMonth.set(date.slice(0, 7), date)
  return sorted.filter((date) => date.slice(0, 7) === newestMonth || lastOfMonth.get(date.slice(0, 7)) === date)
}

/**
 * The market a snapshot row belongs to. Snapshot rows are keyed by the lot's
 * market, so a Toss US stock is `KR:<ticker>` there and US in holdings. A row
 * whose market holds nothing now, while exactly one other market holds the
 * ticker, goes to that market (the positionLinkMarket rule). A security no
 * longer held cannot use that rule; a KR row whose ticker has no digit is a US
 * listing (Korean codes always carry digits), so it goes to US.
 */
export function rowMarket(market: string, ticker: string, held: ReadonlyMap<string, ReadonlySet<string>>): string {
  const markets = held.get(ticker)
  if (markets?.has(market)) return market
  if (markets && markets.size === 1) return [...markets][0]
  if (market === 'KR' && !/\d/.test(ticker)) return 'US'
  return market
}

/**
 * Shares in percent of each date's priced in-scope total. A security with no
 * price on a date (any contributing row unpriced) is left out of that date:
 * its band is null there (a gap, not zero) and the other shares are of the
 * priced total. Each such date is listed in `excluded`, with the left-out
 * securities' share of the in-scope cost, so the page can say what is missing.
 * Month-end bonds held through a Korean broker had no price for two and a half
 * years; blanking every date that carried one left the chart all but empty.
 * A date with nothing priced is null for every band. A security with no row on
 * a date (not held then) is 0.
 *
 * Which securities get a band: the pinned ones that appear in range, then the
 * largest on the newest date with a priced total, up to MAX_SHARE_SERIES;
 * ordered by that value, largest first, so the colour order follows size.
 */
export function positionShares({
  rows,
  dates,
  held,
  scope,
  pins = [],
}: {
  rows: readonly ShareRow[]
  dates: readonly string[]
  held: readonly { market: string; ticker: string }[]
  scope: ShareScope
  pins?: readonly string[]
}): { series: ShareSeries[]; points: SharePoint[]; excluded: ShareExclusion[] } {
  const heldMarkets = new Map<string, Set<string>>()
  for (const h of held) {
    const set = heldMarkets.get(h.ticker) ?? new Set<string>()
    set.add(h.market)
    heldMarkets.set(h.ticker, set)
  }

  const plotted = new Set(dates)
  // date -> key -> { value (null once any contributing row is unpriced), cost }
  const byDate = new Map<string, Map<string, { value: number | null; cost: number }>>()
  const names = new Map<string, { name: string; market: string }>()
  for (const row of rows) {
    if (!plotted.has(row.date)) continue
    const market = rowMarket(row.market, row.ticker, heldMarkets)
    if (scope !== 'all' && market !== scope) continue
    const key = `${market}:${row.ticker}`
    names.set(key, { name: row.name || row.ticker, market })
    const values = byDate.get(row.date) ?? new Map<string, { value: number | null; cost: number }>()
    const current = values.get(key) ?? { value: 0, cost: 0 }
    current.value = current.value == null || row.marketValueKrw == null ? null : current.value + row.marketValueKrw
    current.cost += Number(row.costKrw) || 0
    values.set(key, current)
    byDate.set(row.date, values)
  }

  const pricedTotal = (date: string) => {
    const values = byDate.get(date)
    if (!values) return 0
    let sum = 0
    for (const v of values.values()) sum += v.value ?? 0
    return sum
  }
  const rankDate = [...dates].reverse().find((date) => pricedTotal(date) > 0)
  const rankValue = (key: string) => (rankDate ? (byDate.get(rankDate)!.get(key)?.value ?? 0) : 0)

  const pinned = pins.filter((key) => names.has(key)).slice(0, MAX_SHARE_SERIES)
  const ranked = [...names.keys()].filter((key) => !pinned.includes(key)).sort((a, b) => rankValue(b) - rankValue(a) || a.localeCompare(b))
  const chosen = [...pinned, ...ranked.slice(0, MAX_SHARE_SERIES - pinned.length)].filter((key) => pinned.includes(key) || rankValue(key) > 0)
  chosen.sort((a, b) => rankValue(b) - rankValue(a) || a.localeCompare(b))
  const series = chosen.map((key, i) => ({ id: `s${i}`, key, name: names.get(key)!.name, market: names.get(key)!.market, pinned: pinned.includes(key) }))

  const excluded: ShareExclusion[] = []
  const points = dates.flatMap((date): SharePoint[] => {
    const values = byDate.get(date)
    if (!values || values.size === 0) return []
    const point: SharePoint = { date, total: 100, other: null }
    const unpriced = [...values.values()].filter((v) => v.value == null)
    if (unpriced.length) {
      const costTotal = [...values.values()].reduce((sum, v) => sum + v.cost, 0)
      const costLeftOut = unpriced.reduce((sum, v) => sum + v.cost, 0)
      excluded.push({ date, count: unpriced.length, costPct: costTotal > 0 ? (costLeftOut / costTotal) * 100 : null })
    }
    const total = pricedTotal(date)
    if (total <= 0) {
      for (const s of series) point[s.id] = null
      return [{ ...point, total: 0 }]
    }
    let drawn = 0
    for (const s of series) {
      const entry = values.get(s.key)
      if (entry && entry.value == null) {
        point[s.id] = null
        continue
      }
      const value = entry?.value ?? 0
      point[s.id] = (value / total) * 100
      drawn += value
    }
    point.other = ((total - drawn) / total) * 100
    return [point]
  })
  return { series, points, excluded }
}

/** Each series' share on the last known point and its move in percentage points since the first known one. */
export function shareMoves(points: readonly SharePoint[], series: readonly ShareSeries[]): { id: string; pct: number | null; changePp: number | null }[] {
  return series.map((s) => {
    const known = points.map((p) => p[s.id]).filter((v): v is number => typeof v === 'number')
    const pct = known.at(-1) ?? null
    return { id: s.id, pct, changePp: known.length > 1 && pct != null ? pct - known[0] : null }
  })
}
