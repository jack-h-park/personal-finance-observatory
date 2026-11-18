import type { Metadata } from 'next'
import type { Language } from '@/lib/i18n'
import { getLanguage } from '@/lib/i18n-server'
import { getPageCopy } from '@/lib/ui-copy'
import { APP_NAME } from '@/lib/brand'
import { navItems } from '@/lib/nav'

/**
 * One name per route, taken from the sidebar.
 *
 * Every tab was called "Stock Portfolio Observatory", because the root layout
 * set a title and no page ever overrode it. With a dozen tabs open none of
 * them could be told apart, and browser history was a wall of identical rows.
 *
 * The names are not redeclared here. The sidebar already holds one label per
 * route in both languages, and that is the name the reader clicked to get
 * here — so this reads them back rather than keeping a second list that could
 * drift. What is declared here is only the set of hrefs, so that a typo in a
 * page's `routeMetadata('/helth')` is a compile error.
 */
export const ROUTE_HREFS = [
  '/',
  '/net-worth',
  '/daily-briefing',
  '/holdings',
  '/review',
  '/rebalance',
  '/rebalance/settings',
  '/income',
  '/cash-inflow',
  '/tax-planning',
  '/taxes',
  '/taxes/history',
  '/tax-settings',
  '/lots',
  '/realized',
  '/fbar',
  '/pension',
  '/transactions',
  '/fx',
  '/crypto-premium',
  '/accounts',
  '/health',
  '/data-ops',
  '/reconciliation',
  '/data-map',
] as const

export type RouteHref = (typeof ROUTE_HREFS)[number]

export { APP_NAME, BRAND } from '@/lib/brand'

/** The sidebar's label for a route, in one language. */
export function routeName(href: RouteHref, language: Language): string {
  const item = navItems(getPageCopy('sidebar', language).sections, { supplementary: true }).find((entry) => entry.href === href)
  if (item) return item.label
  // Unreachable while tests/page-names.test.ts passes. Falling back to the href
  // keeps a future gap visible in the tab rather than blank.
  return href
}

/**
 * The sidebar section a route sits in — "Overview", "Taxes", "자산 · 현금 흐름".
 * A route inside a group (Detailed Records) reports its section, not the group.
 *
 * This is what the eyebrow above each heading says. It used to say whatever the
 * page happened to choose: sixteen of eighteen routes carried an overline that
 * was not their section, and it followed no other rule either — not the
 * heading's first word (/dividends said "Portfolio"), not any real grouping
 * (/data-ops said "System & Advanced", a section that does not exist). So the
 * one line above the title, whose whole job is to say where you are, was the
 * line least likely to be true.
 *
 * Read back from the sidebar rather than restated per page, for the same reason
 * routeName is: a copy of a name is a name that drifts.
 */
export function routeSection(href: RouteHref, language: Language): string {
  const item = navItems(getPageCopy('sidebar', language).sections, { supplementary: true }).find((entry) => entry.href === href)
  if (item) return item.section
  // Unreachable while tests/page-names.test.ts passes.
  return ''
}

/**
 * A page's `generateMetadata`. The root layout's template appends the
 * application name, so this supplies only the part that varies.
 *
 *   export const generateMetadata = routeMetadata('/health')
 */
export function routeMetadata(href: RouteHref) {
  return async function generateMetadata(): Promise<Metadata> {
    const name = routeName(href, await getLanguage())
    return { title: href === '/' ? { absolute: `${name} · ${APP_NAME}` } : name }
  }
}
