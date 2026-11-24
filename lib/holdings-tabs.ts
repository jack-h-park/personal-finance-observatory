import { withParam } from '@/lib/table-filter'

/**
 * The /holdings tabs, in display order. The first is the default and carries
 * no `?view=` in its URL, so the page's canonical address is unchanged.
 */
export const HOLDINGS_VIEWS = ['holdings', 'mix', 'weights'] as const

export type HoldingsView = (typeof HOLDINGS_VIEWS)[number]

/** The tab a `?view=` value selects; a missing or unknown value is the first tab. */
export function resolveHoldingsView(value: string | string[] | undefined): HoldingsView {
  const single = Array.isArray(value) ? value[0] : value
  return (HOLDINGS_VIEWS as readonly string[]).includes(single ?? '') ? (single as HoldingsView) : 'holdings'
}

/**
 * A tab's link. Every other param is kept, so the holdings tab's filters and
 * sort survive a visit to another tab, and `?trend=` stays shared by the two
 * trend tabs.
 */
export function holdingsViewHref(params: Record<string, string | string[] | undefined>, view: HoldingsView): string {
  return withParam('/holdings', params, 'view', view === 'holdings' ? null : view)
}
