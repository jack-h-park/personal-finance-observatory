import { clsx } from 'clsx'
import Link from 'next/link'
import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { EmptyState, HelpPopover, Table } from '@/components/ui'
import { CommonLabel } from '@/components/LanguageProvider'
import { nextSort, type SortDirection, type TableSort } from '@/lib/table-sort'

export type DataTableColumn<Row = any> = {
  key: string
  label: ReactNode
  /** `center` is for a column of checkboxes or icons, where a left edge reads
   *  as ragged under a centred header. */
  align?: 'left' | 'right' | 'center'
  render?: (row: Row) => ReactNode
  /** Short, plain-language explanation for a domain term or calculation. */
  description?: ReactNode
  /** Hide lower-priority columns on smaller screens while preserving them in horizontal layouts. */
  priority?: 'primary' | 'secondary' | 'tertiary'
  nowrap?: boolean
  /** Make the header a sort control. Requires the table to be given `sortHref`. */
  sortable?: boolean
  /** The value this column sorts on, when the cell renders something else —
   *  a badge showing "KR", a formatted amount, a linked ticker. Defaults to
   *  `row[key]`. */
  sortValue?: (row: Row) => string | number | null | undefined
  /** Direction a first click on this column should produce. Numbers read best
   *  largest-first, text A-Z. */
  sortFirst?: SortDirection
}

// A pinned cell must be opaque, or the cells scrolling under it show through.
// The row tints are translucent, so a pinned cell lays the same tint over the
// card colour as an inset shadow: it matches the row and still hides what is beneath.
const tint = (pct: number) => `inset 0 0 0 100vmax color-mix(in srgb, var(--bg-surface) ${pct}%, transparent)`
const PINNED_CLASS = 'sticky -left-4 z-[1] bg-card border-r border-line-subtle md:border-r-0'
const PINNED_OPEN_STYLE = { boxShadow: tint(60) }
// Read by the hover class below, which cannot hold the shadow's spaces itself.
const PINNED_HOVER_STYLE = { '--pinned-hover': tint(70) } as CSSProperties

const PRIORITY_CLASS = {
  primary: '',
  secondary: 'hidden md:table-cell',
  tertiary: 'hidden xl:table-cell',
} as const

export function DataTable<Row = any>({
  columns,
  rows,
  caption,
  emptyMessage,
  getRowKey,
  sort,
  sortHref,
  minWidth,
  expandedRowKey,
  renderExpanded,
  footerRows,
  pinFirstColumn = false,
  size = 'body',
}: {
  /** `Row` is inferred from `rows` alone, so a column that annotates its
   *  `render` parameter with a narrower type does not decide it. */
  columns: DataTableColumn<NoInfer<Row>>[]
  rows: Row[]
  caption?: string
  emptyMessage?: ReactNode
  getRowKey?: (row: Row, index: number) => string | number
  /** The sort currently applied, so the header can show and reverse it. */
  sort?: TableSort | null
  /** Builds the link a header cell points at. Without it, `sortable` columns
   *  render as plain headers — a sort control that cannot change the URL would
   *  be a lie. */
  sortHref?: (sort: TableSort) => string
  /** Width below which the table scrolls sideways. Defaults to the standard
   *  48rem; lower it only for a table that lives in a half-width card. */
  minWidth?: string
  /** The row whose `getRowKey` equals this gets `renderExpanded` drawn in one
   *  full-width row directly beneath it — a drill-down that opens where the
   *  reader clicked rather than at the bottom of the page. */
  expandedRowKey?: string | number | null
  renderExpanded?: (row: Row) => ReactNode
  /** Summary rows drawn in a `tfoot` under the body, one cell per column key
   *  (a missing key is an empty cell). Each column keeps its alignment and
   *  priority, so a total sits under the figures it sums. */
  footerRows?: Record<string, ReactNode>[]
  /** Keep the first column in view while the table scrolls sideways, so each
   *  row stays named on a narrow screen. */
  pinFirstColumn?: boolean
  /** Text size for the whole table, passed to `Table`. */
  size?: 'body' | 'caption'
}) {
  if (rows.length === 0) return <EmptyState>{emptyMessage ?? <CommonLabel label="noRows" />}</EmptyState>

  return (
    <Table scroll minWidth={minWidth ?? '48rem'} size={size} className="border-separate border-spacing-0">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col, colIndex) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={
                  col.sortable && sortHref
                    ? sort?.key === col.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
                className={clsx(
                  'sticky top-0 z-10 border-b border-line bg-card px-3 py-2 text-left font-medium text-ink-3',
                  pinFirstColumn && colIndex === 0 && '-left-4 z-20 border-r border-line-subtle md:border-r-0',
                  PRIORITY_CLASS[col.priority ?? 'primary'],
                  col.nowrap && 'whitespace-nowrap'
                )}
              >
                <span
                  className={clsx(
                    'inline-flex items-center',
                    col.align === 'right' && 'w-full justify-end text-right',
                    col.align === 'center' && 'w-full justify-center text-center'
                  )}
                >
                  {col.sortable && sortHref ? (
                    <Link
                      href={sortHref(nextSort(sort ?? null, col.key, col.sortFirst))}
                      scroll={false}
                      className="inline-flex items-center gap-1 rounded-sm hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
                    >
                      {col.label}
                      <span aria-hidden className={clsx('text-micro', sort?.key === col.key ? 'text-info' : 'text-ink-3/50')}>
                        {sort?.key === col.key ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </Link>
                  ) : (
                    col.label
                  )}
                  {col.description ? <HelpPopover>{col.description}</HelpPopover> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowKey = getRowKey?.(row, i) ?? (row as { id?: string | number }).id ?? i
            const expanded = renderExpanded && expandedRowKey != null && rowKey === expandedRowKey
            return (
            <Fragment key={rowKey}>
            {/* The open row shares the panel's tint, so the panel reads as its own. */}
            <tr className={clsx('group border-b border-line-subtle', expanded ? 'bg-surface/60' : 'hover:bg-surface/70')}>
              {columns.map((col, colIndex) => (
                <td
                  key={col.key}
                  style={pinFirstColumn && colIndex === 0 ? (expanded ? PINNED_OPEN_STYLE : PINNED_HOVER_STYLE) : undefined}
                  className={clsx(
                    pinFirstColumn && colIndex === 0 && PINNED_CLASS,
                    pinFirstColumn && colIndex === 0 && !expanded && 'group-hover:[box-shadow:var(--pinned-hover)]',
                    'px-3 py-2.5 align-top text-ink-2',
                    expanded ? 'border-b-0' : 'border-b border-line-subtle',
                    col.align === 'right' && 'text-right tabular-nums',
                    col.align === 'center' && 'text-center',
                    PRIORITY_CLASS[col.priority ?? 'primary'],
                    col.nowrap && 'whitespace-nowrap'
                  )}
                >
                  {col.render ? col.render(row) : (row as Record<string, ReactNode>)[col.key]}
                </td>
              ))}
            </tr>
            {expanded ? (
              <tr>
                <td colSpan={columns.length} className="border-b border-line bg-surface/60 px-3 py-3">
                  {renderExpanded(row)}
                </td>
              </tr>
            ) : null}
            </Fragment>
            )
          })}
        </tbody>
        {footerRows && footerRows.length > 0 ? (
          <tfoot>
            {footerRows.map((cells, index) => (
              <tr key={index}>
                {columns.map((col, colIndex) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-3 py-2 align-top text-ink-2',
                      pinFirstColumn && colIndex === 0 && PINNED_CLASS,
                      index === 0 && 'border-t border-line',
                      col.align === 'right' && 'text-right tabular-nums',
                      col.align === 'center' && 'text-center',
                      PRIORITY_CLASS[col.priority ?? 'primary'],
                      col.nowrap && 'whitespace-nowrap'
                    )}
                  >
                    {cells[col.key] ?? null}
                  </td>
                ))}
              </tr>
            ))}
          </tfoot>
        ) : null}
    </Table>
  )
}
