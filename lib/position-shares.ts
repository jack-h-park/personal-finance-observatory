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

export type ShareRow = { date: string; market: string; ticker: string; name: string; marketValueKrw: number | null }

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
 * Shares in percent of each date's in-scope total. A date where any in-scope
 * row is unpriced is unknown for every series (null), not divided by a partial
 * total. A security with no row on a date (not held then) is 0.
 *
 * Which securities get a band: the pinned ones that appear in range, then the
 * largest on the newest fully-priced date, up to MAX_SHARE_SERIES; ordered by
 * that value, largest first, so the colour order follows size.
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
}): { series: ShareSeries[]; points: SharePoint[] } {
  const heldMarkets = new Map<string, Set<string>>()
  for (const h of held) {
    const set = heldMarkets.get(h.ticker) ?? new Set<string>()
    set.add(h.market)
    heldMarkets.set(h.ticker, set)
  }

  const plotted = new Set(dates)
  // date -> key -> value (null once any contributing row is unpriced)
  const byDate = new Map<string, Map<string, number | null>>()
  const names = new Map<string, { name: string; market: string }>()
  for (const row of rows) {
    if (!plotted.has(row.date)) continue
    const market = rowMarket(row.market, row.ticker, heldMarkets)
    if (scope !== 'all' && market !== scope) continue
    const key = `${market}:${row.ticker}`
    names.set(key, { name: row.name || row.ticker, market })
    const values = byDate.get(row.date) ?? new Map<string, number | null>()
    const current = values.has(key) ? values.get(key)! : 0
    values.set(key, current == null || row.marketValueKrw == null ? null : current + row.marketValueKrw)
    byDate.set(row.date, values)
  }

  const priced = (date: string) => {
    const values = byDate.get(date)
    return values != null && values.size > 0 && [...values.values()].every((v) => v != null)
  }
  const rankDate = [...dates].reverse().find(priced)
  const rankValue = (key: string) => (rankDate ? (byDate.get(rankDate)!.get(key) ?? 0) : 0)

  const pinned = pins.filter((key) => names.has(key)).slice(0, MAX_SHARE_SERIES)
  const ranked = [...names.keys()].filter((key) => !pinned.includes(key)).sort((a, b) => rankValue(b) - rankValue(a) || a.localeCompare(b))
  const chosen = [...pinned, ...ranked.slice(0, MAX_SHARE_SERIES - pinned.length)].filter((key) => pinned.includes(key) || rankValue(key) > 0)
  chosen.sort((a, b) => rankValue(b) - rankValue(a) || a.localeCompare(b))
  const series = chosen.map((key, i) => ({ id: `s${i}`, key, name: names.get(key)!.name, market: names.get(key)!.market, pinned: pinned.includes(key) }))

  const points = dates.flatMap((date): SharePoint[] => {
    const values = byDate.get(date)
    if (!values || values.size === 0) return []
    const point: SharePoint = { date, total: 100, other: null }
    if (!priced(date)) {
      for (const s of series) point[s.id] = null
      return [point]
    }
    const total = [...values.values()].reduce<number>((sum, v) => sum + (v ?? 0), 0)
    if (total <= 0) {
      for (const s of series) point[s.id] = null
      return [{ ...point, total: 0 }]
    }
    let drawn = 0
    for (const s of series) {
      const value = values.get(s.key) ?? 0
      point[s.id] = (value / total) * 100
      drawn += value
    }
    point.other = ((total - drawn) / total) * 100
    return [point]
  })
  return { series, points }
}

/** Each series' share on the last known point and its move in percentage points since the first known one. */
export function shareMoves(points: readonly SharePoint[], series: readonly ShareSeries[]): { id: string; pct: number | null; changePp: number | null }[] {
  return series.map((s) => {
    const known = points.map((p) => p[s.id]).filter((v): v is number => typeof v === 'number')
    const pct = known.at(-1) ?? null
    return { id: s.id, pct, changePp: known.length > 1 && pct != null ? pct - known[0] : null }
  })
}
