import type { Currency } from './spending-import'
import { spendingInKrw, spendingRateOn, type SpendingFxRate, type SpendingViewRow } from './spending-view'

/**
 * Net spending (purchases minus refunds) inside a month window, by the rules
 * /spending uses, so the two agree to the won. `native` matches
 * `analyzeSpending(...).totals`; in a KRW view `converted` and `missingFx`
 * match `analyzeSpending(...).combined` (`spendingInKrw`: the posting-date
 * USD/KRW rate, or the latest within seven days; a row with none is left out
 * and counted). In a USD view the same rate divides the KRW rows instead.
 */
export type SpendingWindow = {
  /** `netMinor` is null when the currency has no purchase or refund in the window. */
  native: Record<Currency, { netMinor: number | null; observedMonths: number }>
  /** Calendar months in the window. */
  months: number
  /** Display currency, major units; null when no row in the window could be converted. */
  converted: number | null
  /** Rows left out of `converted` for want of a rate. */
  missingFx: number
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

/** A row's amount in the display currency (major units, money out negative), or null without a rate. */
function inDisplay(row: SpendingViewRow, display: 'KRW' | 'USD', rates: ReadonlyMap<string, SpendingFxRate>): number | null {
  if (display === 'KRW') return spendingInKrw(row, rates).amount
  if (row.currency === 'USD') return row.amountMinor / 100
  const quote = spendingRateOn(rates, row.postedDate)
  return quote ? row.amountMinor / quote.rate : null
}

export function sumSpendingWindow(input: {
  rows: SpendingViewRow[]
  window: { start: string; end: string }
  today: string
  display: 'KRW' | 'USD'
  rates: ReadonlyMap<string, SpendingFxRate>
}): SpendingWindow {
  const months = monthsBetween(input.window.start, input.window.end)
  const inWindow = new Set(months)
  const sums: Record<Currency, number> = { USD: 0, KRW: 0 }
  const observed: Record<Currency, Set<string>> = { USD: new Set(), KRW: new Set() }
  let converted: number | null = null
  let missingFx = 0
  for (const row of input.rows) {
    if (row.kind !== 'purchase' && row.kind !== 'refund') continue
    if (row.activityDate > input.today) continue
    const month = row.activityDate.slice(0, 7)
    if (!inWindow.has(month)) continue
    sums[row.currency] -= row.amountMinor
    observed[row.currency].add(month)
    const amount = inDisplay(row, input.display, input.rates)
    if (amount === null) missingFx += 1
    else converted = (converted ?? 0) - amount
  }
  const native = (currency: Currency) => ({
    netMinor: observed[currency].size ? sums[currency] : null,
    observedMonths: observed[currency].size,
  })
  return { native: { USD: native('USD'), KRW: native('KRW') }, months: months.length, converted, missingFx }
}
