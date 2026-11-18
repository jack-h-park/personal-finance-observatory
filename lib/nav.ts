import type { RouteHref } from '@/lib/page-names'

/**
 * The sidebar's navigation model: the shape of its copy, the flattened item
 * list every reader of it walks, and which item a path lights.
 */

export type NavLink = { href: RouteHref; label: string; supplementary?: true }

/** A collapsible run of links inside a section. Its items carry no supplementary gate. */
export type NavGroup = { group: string; collapsible: true; items: { href: RouteHref; label: string }[] }

export type NavEntry = NavLink | NavGroup

export type NavSection = { label: string; items: NavEntry[] }

/**
 * Types the sidebar copy's sections as the model rather than as the union of
 * their literals, so readers can narrow an entry with `'group' in entry`.
 */
export function navSections(sections: NavSection[]): NavSection[] {
  return sections
}

export type NavItem = { href: RouteHref; label: string; section: string; group?: string }

/**
 * Every link in the sidebar, in order, with the top-level section it sits in.
 * A link inside a group reports the section, not the group: the eyebrow above a
 * heading always names the section. `supplementary: false` drops the links
 * that only make sense when the database holds supplementary data.
 */
export function navItems(sections: readonly NavSection[], opts: { supplementary: boolean }): NavItem[] {
  const items: NavItem[] = []
  for (const section of sections) {
    for (const entry of section.items) {
      if ('group' in entry) {
        for (const item of entry.items) items.push({ href: item.href, label: item.label, section: section.label, group: entry.group })
      } else if (opts.supplementary || !entry.supplementary) {
        items.push({ href: entry.href, label: entry.label, section: section.label })
      }
    }
  }
  return items
}

/**
 * Nested routes whose sidebar parent is not a path prefix: a position page
 * belongs to Holdings, a filed tax record to Tax History.
 */
export const ACTIVE_ALIASES = { '/positions': '/holdings', '/taxes/records': '/taxes/history' } as const

function prefixes(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * The one sidebar item a path lights: the longest href that prefixes it at a
 * segment boundary, after rewriting an aliased prefix. The root matches only
 * itself, so it never shadows a route the sidebar does not list.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let path = pathname
  for (const [from, to] of Object.entries(ACTIVE_ALIASES)) {
    if (prefixes(path, from)) {
      path = to + path.slice(from.length)
      break
    }
  }
  let best: string | null = null
  for (const href of hrefs) {
    const matches = href === '/' ? path === '/' : prefixes(path, href)
    if (matches && (best === null || href.length > best.length)) best = href
  }
  return best
}
