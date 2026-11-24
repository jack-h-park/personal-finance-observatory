import { CommonLabel } from '@/components/LanguageProvider'
import { ChipGroup, LinkChip } from '@/components/LinkChips'
import { TableSearch } from '@/components/TableSearch'
import { FilterBar as StudioFilterBar } from '@/components/studio-ui/console'
import { ALL, withParam } from '@/lib/table-filter'

/**
 * The filter chips above a table.
 *
 * Four tables built this each for themselves, with the same four groups —
 * market, broker, account, type — and slightly different option lists. Here the
 * chips are links, so the filtered view is a URL: it can be shared, bookmarked,
 * and undone with the back button, none of which the `useState` versions could
 * do.
 *
 * On a phone the whole block used to occupy more than 1,500px before the table
 * began, so below `sm` it collapses into a summary the reader can open.
 */
export function FilterBar({
  basePath,
  params,
  groups,
  search,
  summary,
}: {
  basePath: string
  params: Record<string, string | string[] | undefined>
  /** `defaultValue` is the value the page uses when the param is absent ("All"
   *  when omitted). Choosing it drops the param, and it does not count as an
   *  active filter. `countsAsFilter: false` marks a group that switches the view
   *  rather than narrowing the data, so it never counts as active either.
   *  `separated` draws a rule above the group, for a view switch placed after
   *  the filters it is not one of. */
  groups: { key: string; label: string; options: { value: string; label: string }[]; selected: string; defaultValue?: string; countsAsFilter?: false; separated?: true }[]
  /** Adds a debounced text box. Omit for tables with nothing worth searching. */
  search?: { key: string; label: string; placeholder: string; value: string }
  /** e.g. "139 of 139" — rendered beside the chips, not inside the fold. */
  summary?: string
}) {
  const active = groups.filter((group) => group.countsAsFilter !== false && group.selected !== (group.defaultValue ?? ALL)).length
  const chips = (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <ChipGroup key={group.key} label={group.label} className={group.separated ? 'border-t border-line-subtle pt-2' : undefined}>
          {group.options.map((option) => (
            <LinkChip
              key={option.value}
              href={withParam(basePath, params, group.key, option.value === group.defaultValue ? null : option.value)}
              active={option.value === group.selected}
              variant="ink"
            >
              {/* The URL value stays `All`; a page that passes its own label for it keeps that label. */}
              {option.value === ALL && option.label === ALL ? <CommonLabel label="all" /> : option.label}
            </LinkChip>
          ))}
        </ChipGroup>
      ))}
    </div>
  )

  return (
    <StudioFilterBar>
      {search ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <TableSearch
            basePath={basePath}
            params={params}
            paramKey={search.key}
            label={search.label}
            placeholder={search.placeholder}
            value={search.value}
          />
          {summary ? <span className="text-caption text-ink-3">{summary}</span> : null}
        </div>
      ) : summary ? (
        <span className="text-caption text-ink-3">{summary}</span>
      ) : null}

      {/* Always open on a wide screen; foldable on a narrow one. Rendered twice
          rather than toggled with a responsive `open`, which does not exist —
          `open` is an attribute, and Tailwind cannot vary it by breakpoint. */}
      <div className="hidden sm:block">{chips}</div>
      <details className="sm:hidden">
        <summary className="flex min-h-6 cursor-pointer list-none items-center text-caption font-medium text-ink-2">
          <CommonLabel label="filters" />
          {active ? ` (${active})` : ''}
        </summary>
        <div className="mt-2">{chips}</div>
      </details>
    </StudioFilterBar>
  )
}
