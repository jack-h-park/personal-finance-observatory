import { LinkChip } from '@/components/LinkChips'

/**
 * The exact-ticker filter a position page's link applies, shown above the table
 * so the narrowed view says why it is narrow. The chip is the way out: it links
 * to the same URL without `ticker`, keeping every other filter, and its
 * accessible name (`removeLabel`) says so.
 */
export function TickerFilterChip({ clearHref, label, removeLabel }: { clearHref: string; label: string; removeLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <LinkChip href={clearHref} active variant="info" ariaCurrent="none" aria-label={removeLabel}>
        {label} <span aria-hidden="true">×</span>
      </LinkChip>
    </div>
  )
}
