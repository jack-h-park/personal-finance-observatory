/**
 * Shaping for the /holdings table's visual columns: each row's weight in the
 * displayed list, and each security's recent value trend. Pure, so the rules
 * are tested without a database.
 */

/** A row's share of the displayed market value, in percent; null when either side is unknown. */
export function holdingWeight(marketValue: number | null | undefined, total: number | null | undefined): number | null {
  if (marketValue == null || total == null || !Number.isFinite(marketValue) || !Number.isFinite(total) || total <= 0) return null
  return (marketValue / total) * 100
}

/** The total the weights divide by: the sum of every displayed row whose value is known. */
export function weightTotal(rows: readonly { base_market_value: number | null }[]): number | null {
  let sum = 0
  let any = false
  for (const row of rows) {
    if (row.base_market_value == null || !Number.isFinite(row.base_market_value)) continue
    sum += row.base_market_value
    any = true
  }
  return any ? sum : null
}

/**
 * The dates a trend plots: the last snapshot of each of the most recent
 * `months` months, oldest first. The newest month's last date is the latest
 * snapshot, so the line ends where today's value is.
 */
export function trendDates(dates: readonly string[], months = 12): string[] {
  const lastOfMonth = new Map<string, string>()
  for (const date of [...dates].sort()) lastOfMonth.set(date.slice(0, 7), date)
  return [...lastOfMonth.values()].slice(-months)
}

export type TrendRow = { date: string; market: string; ticker: string; marketValueKrw: number | null }

const key = (market: string, ticker: string) => `${market}:${ticker}`

/**
 * Each held security's KRW value on each trend date, keyed `market:ticker` as
 * the holdings rows are, summed across accounts.
 *
 * Snapshot rows are keyed by the lot's market, which is not always the
 * holding's: a Toss US stock is `KR:<ticker>` in the snapshots and US in
 * holdings. A snapshot key whose market holds nothing now, while exactly one
 * other market holds the ticker, is counted under that market — the rule
 * positionLinkMarket uses for the same mismatch. Without it the Toss part of
 * a US stock drops out of its line.
 *
 * A date where any contributing row is unpriced is null, not a partial sum.
 * A security with no row on a date (not held then) is 0.
 */
export function trendSeries(
  rows: readonly TrendRow[],
  dates: readonly string[],
  held: readonly { market: string; ticker: string }[]
): Map<string, (number | null)[]> {
  const heldKeys = new Set(held.map((h) => key(h.market, h.ticker)))
  const heldMarkets = new Map<string, Set<string>>()
  for (const h of held) {
    const markets = heldMarkets.get(h.ticker) ?? new Set<string>()
    markets.add(h.market)
    heldMarkets.set(h.ticker, markets)
  }
  const owner = (market: string, ticker: string): string | null => {
    if (heldKeys.has(key(market, ticker))) return key(market, ticker)
    const markets = heldMarkets.get(ticker)
    return markets && markets.size === 1 ? key([...markets][0], ticker) : null
  }

  const index = new Map(dates.map((date, i) => [date, i]))
  const series = new Map<string, (number | null)[]>()
  for (const k of heldKeys) series.set(k, dates.map(() => 0))
  for (const row of rows) {
    const i = index.get(row.date)
    if (i == null) continue
    const k = owner(row.market, row.ticker)
    if (!k) continue
    const values = series.get(k)!
    const current = values[i]
    values[i] = current == null || row.marketValueKrw == null ? null : current + row.marketValueKrw
  }
  return series
}

/** Change from the first to the last point, in percent; null without two known points or from zero. */
export function trendChangePct(values: readonly (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null)
  if (known.length < 2 || known[0] === 0) return null
  return ((known[known.length - 1] - known[0]) / Math.abs(known[0])) * 100
}

type GroupableRow = {
  market: string
  currency: string
  brokerage: string | null
  account: string
  ticker: string
  name: string | null
  quantity: number
  native_cost: number
  native_market_value: number | null
  native_unrealized_gl: number | null
  native_unrealized_gl_pct: number | null
  base_cost: number | null
  base_market_value: number | null
  base_unrealized_gl: number | null
  total_cost_krw: number
  long_term_qty: number | null
  short_term_qty: number | null
  lot_count: number | null
  cost_status: 'ready' | 'missing_cost' | 'estimated' | 'unpriced'
}

/** One account's part of a grouped security: its share of the security's KRW value, null when unknown. */
export type GroupAccount = { brokerage: string | null; account: string; value: number | null; share: number | null }

/** A holdings row standing for every account that holds one security. */
export type SecurityGroup<R extends GroupableRow = GroupableRow> = Omit<R, 'id'> & {
  /** `market:ticker` */
  id: string
  accounts: GroupAccount[]
}

// The status a group shows is its least reliable row's: a sum is only as good as its weakest part.
const STATUS_ORDER = ['unpriced', 'missing_cost', 'estimated', 'ready'] as const

/** Sum of every value, or null when any is unknown. */
function completeSum(values: readonly (number | null | undefined)[]): number | null {
  let sum = 0
  for (const value of values) {
    if (value == null || !Number.isFinite(Number(value))) return null
    sum += Number(value)
  }
  return sum
}

/**
 * The holdings list with one row per security instead of per account. Money
 * columns are sums, null when any account's figure is unknown, as the totals
 * strip does. Native figures are summed only when every account holds the
 * security in one currency; otherwise the row is shown in KRW. The return is
 * recomputed from the sums, never averaged.
 */
export function groupBySecurity<R extends GroupableRow>(rows: readonly R[]): SecurityGroup<R>[] {
  const byKey = new Map<string, R[]>()
  for (const row of rows) {
    const k = key(row.market, row.ticker)
    const list = byKey.get(k) ?? []
    list.push(row)
    byKey.set(k, list)
  }
  return [...byKey.entries()].map(([id, list]) => {
    const first = list[0]
    const oneCurrency = list.every((row) => row.currency === first.currency)
    const baseCost = completeSum(list.map((row) => row.base_cost ?? row.total_cost_krw))
    const baseValue = completeSum(list.map((row) => row.base_market_value))
    const baseGain = completeSum(list.map((row) => row.base_unrealized_gl))
    const nativeCost = oneCurrency ? completeSum(list.map((row) => row.native_cost)) : baseCost
    const nativeValue = oneCurrency ? completeSum(list.map((row) => row.native_market_value)) : baseValue
    const nativeGain = oneCurrency ? completeSum(list.map((row) => row.native_unrealized_gl)) : baseGain
    const accounts = list
      .map((row) => ({
        brokerage: row.brokerage,
        account: row.account,
        value: row.base_market_value,
        share: row.base_market_value != null && baseValue != null && baseValue > 0 ? (row.base_market_value / baseValue) * 100 : null,
      }))
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    return {
      ...first,
      id,
      // Sorting by account reads the largest holder.
      brokerage: accounts[0].brokerage,
      account: accounts[0].account,
      currency: oneCurrency ? first.currency : 'KRW',
      quantity: list.reduce<number>((sum, row) => sum + (Number(row.quantity) || 0), 0),
      native_cost: nativeCost ?? 0,
      native_market_value: nativeValue,
      native_unrealized_gl: nativeGain,
      native_unrealized_gl_pct: nativeGain != null && nativeCost != null && nativeCost > 0 ? (nativeGain / nativeCost) * 100 : null,
      base_cost: baseCost,
      base_market_value: baseValue,
      base_unrealized_gl: baseGain,
      total_cost_krw: list.reduce<number>((sum, row) => sum + (Number(row.total_cost_krw) || 0), 0),
      long_term_qty: completeSum(list.map((row) => row.long_term_qty)),
      short_term_qty: completeSum(list.map((row) => row.short_term_qty)),
      lot_count: completeSum(list.map((row) => row.lot_count)),
      cost_status: STATUS_ORDER.find((status) => list.some((row) => row.cost_status === status)) ?? first.cost_status,
      accounts,
    } as SecurityGroup<R>
  })
}
