import Link from 'next/link'
import { clsx } from 'clsx'
import { activeHref, navItems, type NavSection } from '@/lib/nav'

/**
 * The sidebar's link list. Hook-free so it renders without a router: the
 * pathname and the reader's open/closed groups come in as props.
 *
 * - One item is active: the one `activeHref` picks for the pathname.
 * - A collapsible group is keyed by its label only. It is open unless the
 *   reader closed it (`openGroups[group] === false`), and always open while
 *   the active item sits inside it.
 * - Supplementary items show only when the database holds supplementary data.
 */
export function SidebarNav({
  sections,
  pathname,
  showAllAssets,
  openGroups,
  onToggle,
  label,
}: {
  sections: readonly NavSection[]
  pathname: string
  showAllAssets: boolean
  openGroups: Readonly<Record<string, boolean>>
  onToggle: (group: string, open: boolean) => void
  label: string
}) {
  const active = activeHref(pathname, navItems(sections, { supplementary: showAllAssets }).map((item) => item.href))

  const link = (item: { href: string; label: string }) => {
    const current = item.href === active
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={current ? 'page' : undefined}
          className={clsx(
            'relative block min-h-10 rounded-sm py-2 pl-3 pr-2 text-body transition-colors lg:min-h-0 lg:py-1.5',
            current ? 'bg-surface font-medium' : 'text-ink-2 hover:bg-surface hover:text-ink'
          )}
        >
          {current ? (
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-[2.5px] rounded-pill"
              style={{ backgroundImage: 'var(--gradient-mini)' }}
            />
          ) : null}
          <span className={current ? 't-emph-gradient' : undefined}>{item.label}</span>
        </Link>
      </li>
    )
  }

  return (
    <nav className="mt-5 flex flex-col gap-4" aria-label={label}>
      {sections.map((section) => (
        <div key={section.label}>
          <div className="px-2 text-label font-medium text-ink-3">{section.label}</div>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {section.items.map((entry) => {
              if (!('group' in entry)) return showAllAssets || !entry.supplementary ? link(entry) : null
              const open = openGroups[entry.group] !== false || entry.items.some((item) => item.href === active)
              return (
                <li key={entry.group}>
                  <details
                    open={open}
                    onToggle={(event) => onToggle(entry.group, event.currentTarget.open)}
                    className="group"
                  >
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-sm px-2 text-label font-medium text-ink-2 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-info">
                      {entry.group}
                      <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
                    </summary>
                    <ul className="mt-1.5 flex flex-col gap-0.5">{entry.items.map(link)}</ul>
                  </details>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
