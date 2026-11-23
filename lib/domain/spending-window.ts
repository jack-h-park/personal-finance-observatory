import type { Currency } from './spending-import'
import type { SpendingViewRow } from './spending-view'

/** One day of the USD/KRW history; a list of these is sorted by date, oldest first. */
export type UsdKrwRate = { date: string; rate: number }

/**
 * Net spending (purchases minus refunds) inside a month window. `native` uses
 * the same rules as `analyzeSpending` on /spending, so for a 12- or 24-month
 * window the two agree to the minor unit. `converted` puts both currencies in
 * the display currency, each row at the USD/KRW rate of its own date or the
 * closest earlier one; a row older than the history uses the current rate and
 * is counted in `undatedCount`.
 */
export type SpendingWindow = {
  /** `netMinor` is null when the currency has no purchase or refund in the window. */
  native: Record<Currency, { netMinor: number | null; observedMonths: number }>
  /** Calendar months in the window. */
  months: number
  /** Display currency, major units; null when the window holds no activity at all. */
  converted: number | null
  undatedCount: number
}

function monthsBetween(start: string, end: string) {
  const out: string[] = []
  let [year, month] = start.split('-').map(Number)
  const [endYear, endMonth] = end.split('-').map(Number)
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) { month = 1; year += 1 }
  }
  return out
}

function rateOn(rates: UsdKrwRate[], date: string): number | null {
  let low = 0
  let high = rates.length - 1
  let found: number | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    if (rates[mid].date <= date) { found = rates[mid].rate; low = mid + 1 } else high = mid - 1
  }
  return found
}

export function sumSpendingWindow(input: {
  rows: SpendingViewRow[]
  window: { start: string; end: string }
  today: string
  display: 'KRW' | 'USD'
  rates: UsdKrwRate[]
  fallbackRate: number | null
}): SpendingWindow {
  const months = monthsBetween(input.window.start, input.window.end)
  const inWindow = new Set(months)
  const sums: Record<Currency, number> = { USD: 0, KRW: 0 }
  const observed: Record<Currency, Set<string>> = { USD: new Set(), KRW: new Set() }
  let converted = 0
  let any = false
  let undatedCount = 0
  for (const row of input.rows) {
    if (row.kind !== 'purchase' && row.kind !== 'refund') continue
    if (row.activityDate > input.today) continue
    const month = row.activityDate.slice(0, 7)
    if (!inWindow.has(month)) continue
    const net = -row.amountMinor
    sums[row.currency] += net
    observed[row.currency].add(month)
    any = true
    const major = row.currency === 'USD' ? net / 100 : net
    if (row.currency === input.display) { converted += major; continue }
    const dated = rateOn(input.rates, row.activityDate)
    const rate = dated ?? input.fallbackRate
    if (dated == null) undatedCount += 1
    if (rate == null) continue
    converted += row.currency === 'USD' ? major * rate : major / rate
  }
  const native = (currency: Currency) => ({
    netMinor: observed[currency].size ? sums[currency] : null,
    observedMonths: observed[currency].size,
  })
  return { native: { USD: native('USD'), KRW: native('KRW') }, months: months.length, converted: any ? converted : null, undatedCount }
}
