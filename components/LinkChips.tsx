import type { ReactNode } from 'react'
import Link from 'next/link'

export type ChipVariant = 'info' | 'ink'

/**
 * Static class tables, so Tailwind sees every literal. An unselected chip with a
 * border takes `line-control` (3:1 against the card) and `text-ink-2`, so it never
 * matches a group label, which is ink-3 at micro size (see ChipGroup).
 */
const CHIP_CLASSES: Record<ChipVariant, { base: string; active: string; inactive: string }> = {
  info: {
    base: 'rounded-sm border px-2 py-1 text-label font-medium',
    active: 'border-info bg-info/10 text-info',
    inactive: 'border-line-control text-ink-2 hover:border-info hover:text-info',
  },
  // There was a 'subtle' variant: borderless, ink-3 text, regular weight. That is
  // exactly a group label's look, so it is gone; the overview metrics it styled
  // are a LinkSegmentedControl now.
  // FilterBar's chips.
  ink: {
    base: 'inline-flex min-h-8 items-center rounded-sm border px-2.5 text-label font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-info/40',
    active: 'border-ink bg-ink text-card',
    inactive: 'border-line-control bg-card text-ink-2 hover:border-ink-3 hover:bg-surface hover:text-ink',
  },
}

/** How the active chip announces itself: a selection in a set ('true'), a page in a set ('page'), or a toggle ('none'). */
export type ChipCurrent = 'true' | 'page' | 'none'

/**
 * One link chip. Server component: the href is a precomputed string. A toggle
 * (ariaCurrent="none") carries no aria-current, and never aria-pressed, which an
 * <a> may not carry.
 */
export function LinkChip({
  href,
  active,
  variant = 'info',
  ariaCurrent = 'true',
  title,
  'aria-label': ariaLabel,
  scroll = false,
  swatch,
  checkbox = false,
  children,
}: {
  href: string
  active: boolean
  variant?: ChipVariant
  ariaCurrent?: ChipCurrent
  title?: string
  'aria-label'?: string
  scroll?: boolean
  /**
   * A colour the chip stands for, drawn before its label: filled when active, a ring when
   * not. Lets a set of filter chips double as a chart's legend.
   */
  swatch?: string
  /** Draw a checkbox before the label, ticked when active: for a toggle that is not a choice in a set. */
  checkbox?: boolean
  children: ReactNode
}) {
  const classes = CHIP_CLASSES[variant]
  const marker = swatch ? (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 rounded-full border-2"
      style={active ? { backgroundColor: swatch, borderColor: swatch } : { borderColor: swatch }}
    />
  ) : checkbox ? (
    <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-current text-[10px] leading-none">
      {active ? '✓' : null}
    </span>
  ) : null
  return (
    <Link
      href={href}
      scroll={scroll}
      title={title}
      aria-label={ariaLabel}
      aria-current={active && ariaCurrent !== 'none' ? ariaCurrent : undefined}
      className={`${classes.base} ${active ? classes.active : classes.inactive}${marker ? ' inline-flex items-center gap-1.5' : ''}`}
    >
      {marker}
      {children}
    </Link>
  )
}

export type LinkChipItem<K extends string> = { key: K; href: string; label: ReactNode; title?: string }

const WRAPPER = 'flex flex-wrap items-center justify-end gap-1'

/**
 * A set of link chips, one of which is current. `as="fragment"` (default)
 * renders the bare chips for a caller's own wrapper; 'nav' and 'group' add a
 * labelled flex wrapper.
 */
export function LinkChips<K extends string>({
  items,
  current,
  variant = 'info',
  ariaCurrent = 'true',
  as = 'fragment',
  label,
}: {
  items: LinkChipItem<K>[]
  /** The key of the active chip. */
  current: K
  variant?: ChipVariant
  /** The aria-current value the active chip carries. */
  ariaCurrent?: Exclude<ChipCurrent, 'none'>
  as?: 'fragment' | 'nav' | 'group'
  label?: string
}) {
  const chips = items.map((item) => (
    <LinkChip key={item.key} href={item.href} active={item.key === current} variant={variant} ariaCurrent={ariaCurrent} title={item.title}>
      {item.label}
    </LinkChip>
  ))
  if (as === 'nav') return <nav aria-label={label} className={WRAPPER}>{chips}</nav>
  if (as === 'group') return <div role="group" aria-label={label} className={WRAPPER}>{chips}</div>
  return <>{chips}</>
}

/**
 * A labelled group of chips: the group name in a fixed-width column on the left,
 * the chips beside it, wrapping under one another rather than under the label.
 *
 * Before this, pages put a `text-label text-ink-3` span in front of the chips. That
 * was the same size and colour as an unselected chip, whose border was invisible,
 * so the reader could not tell the group name from its options. Here the label is
 * micro size and regular weight, the chips are larger, medium weight, ink-2 and
 * bordered, and the group carries `role="group"` with the label as its name.
 */
export function ChipGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex items-baseline gap-1.5${className ? ` ${className}` : ''}`}>
      {/* The group's name is already its aria-label; hide the visible copy so it is not read twice. */}
      <span aria-hidden="true" className="w-16 shrink-0 text-micro uppercase tracking-[0.08em] text-ink-3 [&:lang(ko)]:tracking-normal">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

/**
 * The segmented control's look (components/controls.tsx) as links, for a choice that lives in
 * the URL: one current option in a bordered track. The button form takes an onChange and so
 * needs a client component; a filter is a URL, so this one renders on the server. From `sm` up
 * the track stays on one line. Below it, beside a ChipGroup's label column, nine periods do not
 * fit, so the options wrap inside the track: a sideways scroll would hide the last ones with
 * no sign they are there.
 */
export function LinkSegmentedControl<K extends string>({
  items,
  current,
  label,
}: {
  items: LinkChipItem<K>[]
  /** The key of the current option; none is current when it matches no item. */
  current: K | null
  /** The group's accessible name. Leave it out inside a ChipGroup, which already names the group. */
  label?: string
}) {
  return (
    <div
      role={label ? 'group' : undefined}
      aria-label={label}
      className="inline-flex max-w-full flex-wrap rounded-md border border-line-control bg-surface p-0.5 sm:flex-nowrap"
    >
      {items.map((item) => {
        const active = item.key === current
        return (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            title={item.title}
            aria-current={active ? 'true' : undefined}
            className={`inline-flex min-h-8 shrink-0 items-center rounded-[4px] px-2 text-caption font-medium sm:px-2.5 leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-info/40 ${
              active ? 'bg-card text-ink shadow-card' : 'text-ink-2 hover:bg-card hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
