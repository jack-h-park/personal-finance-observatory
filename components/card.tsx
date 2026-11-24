import { clsx } from 'clsx'
import { Children, Fragment, createElement, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { HelpPopover } from '@/components/HelpPopover'
import { IssueCountLabel } from '@/components/LanguageProvider'
import { severityTone, type IssueSeverity } from '@/lib/tone'
import { Badge, TONE_STYLES } from './controls'
import { Label } from './metric'

type CardBaseProps = {
  children: ReactNode
  /** Anchor for a link to this card, such as a header status pill's `href`. */
  id?: string
  className?: string
  info?: ReactNode
  action?: ReactNode
  /** Make the body a flex column that fills the card's height. Pair with a height
   *  on `className` (e.g. `xl:h-[42rem]`) so a `flex-1` child list scrolls to fill
   *  it — lets two side-by-side cards stay exactly equal-height regardless of content. */
  fill?: boolean
  /** Brand gradient accent bar across the card's top edge. It marks the page's
   *  lead figure: at most one bare `accent` per page, never bound to a condition
   *  (G8). A card that lists problems says so with `issues` instead. */
  accent?: boolean
}

/**
 * How many problems a card lists, and how bad they are. `capped` marks a count
 * that is a lower bound because the list stopped at a cap; the badge reads `100+`.
 */
export type CardIssues = { count: number; severity?: IssueSeverity; capped?: boolean }

/**
 * A card that reports `issues` must have a `title`: the count badge renders
 * only in the header, beside the title it qualifies.
 */
export type CardProps = CardBaseProps &
  ({ title?: ReactNode; issues?: undefined } | { title: ReactNode; issues: CardIssues })

export function Card({ children, id, className, title, info, action, fill, accent, issues }: CardProps) {
  const badge =
    issues && issues.count > 0 ? (
      <Badge tone={severityTone(issues.severity ?? 'attention')}>
        <IssueCountLabel count={issues.count} capped={issues.capped} />
      </Badge>
    ) : null
  // One box for the action, so a fragment of chips (TrendRangeLinks) stays one
  // group instead of becoming nine header items spread by justify-between.
  const actionBox = action ? <div className="flex flex-wrap items-center justify-end gap-1">{action}</div> : null
  return (
    <section
      id={id}
      // The page-shape card budget counts this marker (scripts/page-shape.mjs CARD_SELECTOR).
      data-card=""
      className={clsx(
        'relative rounded-md border border-line bg-card',
        fill && 'flex flex-col',
        // A link lands below the phone's sticky top bar, as other anchors do.
        id && 'scroll-mt-24',
        className
      )}
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      {accent && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
          style={{ background: 'var(--accent-info)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}
        />
      )}
      {(title || action || badge) && (
        // Wraps instead of squeezing: when the title and the action do not fit on one
        // line (a phone with the 1M…All range chips), the action moves below the title.
        // Without the wrap, the title shrank to its min-content width, which for Hangul
        // is one character per line.
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-subtle px-4 py-2.5">
          <div className="flex items-center">
            <h2 className="text-body-lg font-medium tracking-tight text-ink">{title}</h2>
            {info ? <HelpPopover>{info}</HelpPopover> : null}
          </div>
          {badge && actionBox ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {badge}
              {actionBox}
            </div>
          ) : (
            badge ?? actionBox
          )}
        </header>
      )}
      <div className={clsx('p-4', fill && 'flex min-h-0 flex-1 flex-col')}>{children}</div>
    </section>
  )
}

const PANEL_PAD = { sm: 'px-3 py-2', md: 'p-3', tall: 'px-3 py-3' } as const

const PANEL_TEXT = {
  none: '',
  caption: 'text-caption',
  'caption-2': 'text-caption text-ink-2',
  'caption-3': 'text-caption text-ink-3',
  'caption-note': 'text-caption leading-relaxed text-ink-3',
  'label-note': 'text-label leading-relaxed text-ink-3',
} as const

const PANEL_LAYOUT = {
  'stack-2': 'space-y-2',
  tall: 'flex min-h-[15rem] flex-col',
  'span-2': 'sm:col-span-2',
} as const

/**
 * The inset panel: a rounded surface box inside a card. Thirty-two pages
 * wrote the same `rounded-md border border-line-subtle bg-surface px-3 py-2`
 * with a handful of padding and text variants; `bordered={false}` is the soft
 * note the same pages used for a muted explanation. A link tile (`as="a"`)
 * also borders in the info colour on hover.
 */
export function Panel({
  as = 'div',
  pad = 'sm',
  text = 'none',
  bordered = true,
  spacing,
  layout,
  children,
  href,
  target,
  rel,
  action,
  role,
  id,
}: {
  as?: 'div' | 'p' | 'form' | 'a' | 'li'
  pad?: keyof typeof PANEL_PAD
  text?: keyof typeof PANEL_TEXT
  bordered?: boolean
  spacing?: 'mt-3' | 'mt-4' | 'mb-3' | 'mb-4' | 'mb-5'
  layout?: keyof typeof PANEL_LAYOUT
  children: ReactNode
  href?: string
  target?: string
  rel?: string
  /** A server action (or URL) for `as="form"`. */
  action?: ComponentProps<'form'>['action']
  role?: string
  id?: string
}) {
  const className = clsx(
    spacing,
    'rounded-md',
    bordered && 'border border-line-subtle',
    'bg-surface',
    PANEL_PAD[pad],
    PANEL_TEXT[text],
    layout && PANEL_LAYOUT[layout],
    as === 'a' && 'hover:border-info'
  )
  return createElement(as, { className, href, target, rel, action, role, id }, children)
}

const CALLOUT_SOFT = {
  info: 'border-info/30 bg-info/5 text-ink-2',
  success: 'border-success/30 bg-success/5 text-ink-2',
  warning: 'border-warning/30 bg-warning/5 text-ink-2',
  danger: 'border-danger/30 bg-danger/5 text-ink-2',
} as const

const CALLOUT_RULE = {
  info: 'border-info',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-danger',
} as const

type CalloutTone = keyof typeof CALLOUT_SOFT

/**
 * A toned message box. `strong` tints with the Badge triplet and colours the
 * text (a result or an error); `soft` tints lightly and keeps neutral text (a
 * caution inside a card); `rule` is a left rule with no fill. A soft box with
 * no `size` sets no font size, for content that sizes itself.
 */
export function Callout({
  tone,
  emphasis = 'strong',
  size,
  relaxed = false,
  role,
  as = 'div',
  spacing,
  layout,
  children,
}: {
  tone: CalloutTone
  emphasis?: 'strong' | 'soft' | 'rule'
  size?: 'caption' | 'label'
  relaxed?: boolean
  role?: 'status' | 'alert' | 'note'
  as?: 'div' | 'p'
  spacing?: 'mb-3' | 'mb-4' | 'mt-3'
  layout?: 'aside'
  children: ReactNode
}) {
  const className =
    emphasis === 'rule'
      ? clsx(spacing, 'border-l-2', CALLOUT_RULE[tone], 'px-3 py-1', layout === 'aside' && 'shrink-0 lg:max-w-[19rem]')
      : clsx(
          spacing,
          'rounded-md border px-3 py-2',
          size === 'label' ? 'text-label' : size === 'caption' ? 'text-caption' : null,
          relaxed && 'leading-relaxed',
          emphasis === 'strong' ? TONE_STYLES[tone] : CALLOUT_SOFT[tone],
          layout === 'aside' && 'shrink-0 lg:max-w-[19rem]'
        )
  return createElement(as, { className, role }, children)
}

/**
 * The companion card beside a page's hero: stacked fields split by a hairline,
 * and a read-order note pinned to the bottom.
 */
export function HeroAside({
  title,
  info,
  note,
  children,
}: {
  title: ReactNode
  info?: ReactNode
  note: ReactNode
  children: ReactNode
}) {
  const items = Children.toArray(children)
  return (
    <Card title={title} info={info}>
      <div className="flex min-h-[16rem] flex-col justify-between gap-4">
        <div className="space-y-4">
          {items.map((item, index) => (
            <Fragment key={isValidElement(item) && item.key != null ? item.key : index}>
              {index > 0 ? <div className="h-px bg-line-subtle" /> : null}
              {item}
            </Fragment>
          ))}
        </div>
        <Panel bordered={false} text="label-note">
          {note}
        </Panel>
      </div>
    </Card>
  )
}

export function MetricHeroCard({
  id,
  title,
  info,
  eyebrow,
  value,
  hint,
  children,
  className,
}: {
  id?: string
  title: ReactNode
  info?: ReactNode
  eyebrow: ReactNode
  value: ReactNode
  hint?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <Card id={id} title={title} info={info} accent className={className}>
      <div className="flex min-h-[16rem] flex-col justify-between gap-6">
        <div>
          <Label variant="eyebrow">{eyebrow}</Label>
          <div className="mt-2 text-hero-sm font-medium leading-none tracking-normal text-ink sm:text-hero">{value}</div>
          {hint ? <div className="mt-2 text-body text-ink-3">{hint}</div> : null}
        </div>
        {children}
      </div>
    </Card>
  )
}

export { EmptyState } from '@/components/studio-ui/console'
