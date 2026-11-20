import { LinkChip } from '@/components/LinkChips'

/**
 * The exact-ticker filter a position page's link applies, shown above the table
 * so the narrowed view says why it is narrow. The chip is the way out: it links
 * to the same URL without `ticker`, keeping every other filter, and its
 * accessible name (`removeLabel`) says so. `note` qualifies the narrowed view,
 * such as a filter that only searched the newest rows.
 */
export function TickerFilterChip({
  clearHref,
  label,
  removeLabel,
  note,
}: {
  clearHref: string
  label: string
  removeLabel: string
  note?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <LinkChip href={clearHref} active variant="info" ariaCurrent="none" aria-label={removeLabel}>
        {label} <span aria-hidden="true">×</span>
      </LinkChip>
      {note ? <span className="text-caption text-ink-3">{note}</span> : null}
    </div>
  )
}
