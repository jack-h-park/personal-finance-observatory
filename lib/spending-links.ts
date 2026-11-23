import type { SpendingPeriod } from '@/lib/domain/spending-view'

/** The tabs of /spending. */
export const SPENDING_VIEWS = ['summary', 'transactions', 'review'] as const
export type SpendingView = (typeof SPENDING_VIEWS)[number]

const BASE = '/spending'

/** The tab a request opens: the one asked for, or Transactions when a month or page is given. */
export function resolveSpendingView(requested: string | undefined, options: { month?: string; page?: string }): SpendingView {
  if (requested === 'review') return 'review'
  if (requested === 'transactions' || options.month || options.page) return 'transactions'
  return 'summary'
}

/**
 * A /spending link that keeps the period and account. Each option sets a
 * parameter; an empty or undefined option removes it.
 */
export function spendingHref(
  target: SpendingView,
  state: { period: SpendingPeriod; account?: string },
  options: Record<string, string | undefined> = {},
): string {
  const query = new URLSearchParams({ view: target, period: String(state.period) })
  if (state.account) query.set('account', state.account)
  for (const [key, value] of Object.entries(options)) {
    if (value) query.set(key, value)
    else query.delete(key)
  }
  return `${BASE}?${query.toString()}`
}

/**
 * The parameters FilterBar carries from link to link: the tab and every
 * filter, with the default period left out (FilterBar drops a default) and
 * without the page or the selected transaction, which a new filter resets.
 */
export function spendingFilterParams(state: {
  view: SpendingView
  period: SpendingPeriod
  account?: string
  month?: string
  currency?: string
  category?: string
  merchant?: string
}): Record<string, string> {
  const params: Record<string, string> = { view: state.view }
  if (state.period !== 12) params.period = String(state.period)
  for (const key of ['account', 'month', 'currency', 'category', 'merchant'] as const) {
    const value = state[key]
    if (value) params[key] = value
  }
  return params
}
