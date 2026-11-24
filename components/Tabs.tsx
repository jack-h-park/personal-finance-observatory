import type { ReactNode } from 'react'
import Link from 'next/link'

// The tab bar is the page-level switch, so it reads above the filters under
// it: panel-size semibold labels, a 3px indicator, readable unselected labels.
const ITEM_BASE = 'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-[3px] px-4 text-role-panel font-semibold'
const ITEM_ACTIVE = 'border-info text-ink'
const ITEM_INACTIVE = 'border-transparent text-ink-2 hover:text-ink'

/**
 * URL-driven underline tabs: links in a labelled nav, the current one marked
 * aria-current="page". Server component; hrefs are precomputed strings.
 * `scroll` defaults to true (a tab switch scrolls to the top).
 *
 * An item's optional `description` says what the tab holds; the current
 * item's shows as one line under the bar. Narrow screens scroll the bar
 * sideways instead of wrapping it.
 */
export function Tabs<K extends string>({
  label,
  items,
  current,
  scroll = true,
}: {
  label: string
  items: { key: K; href: string; label: ReactNode; description?: ReactNode }[]
  current: K
  scroll?: boolean
}) {
  const description = items.find((item) => item.key === current)?.description
  return (
    <div className="mb-6">
      <nav aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line-subtle">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            scroll={scroll}
            aria-current={item.key === current ? 'page' : undefined}
            className={`${ITEM_BASE} ${item.key === current ? ITEM_ACTIVE : ITEM_INACTIVE}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {description != null && <p className="mt-2 text-role-ui text-ink-2">{description}</p>}
    </div>
  )
}
