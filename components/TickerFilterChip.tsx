import { LinkChip } from '@/components/LinkChips'

/**
 * The exact-ticker filter a position page's link applies, shown above the table
 * so the narrowed view says why it is narrow. The chip is the way out: it links
 * to the same URL without `ticker`, keeping every other filter.
 */
export function TickerFilterChip({ ticker, clearHref, label }: { ticker: string; clearHref: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1" data-ticker={ticker}>
      <LinkChip href={clearHref} active variant="info" ariaCurrent="none">
        {label} <span aria-hidden="true">×</span>
      </LinkChip>
    </div>
  )
}
