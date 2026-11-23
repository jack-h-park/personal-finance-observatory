import Link from 'next/link'
import type { ReactNode } from 'react'
import { clsx } from 'clsx'
import { signTone, toneBgClass } from '@/lib/tone'

export type RankedBarItem = {
  key: string
  label: string
  href?: string
  /** The bar length: drawn against the largest absolute value in the list. */
  value: number
  /** The figure printed beside the bar, already formatted. */
  valueText: ReactNode
  /** A chart colour for the bar; a diverging list colours by sign instead. */
  color?: string
}

function ItemLabel({ item }: { item: RankedBarItem }) {
  return item.href ? (
    <Link href={item.href} className="min-w-0 truncate text-caption text-ink hover:underline" title={item.label}>
      {item.label}
    </Link>
  ) : (
    <span className="min-w-0 truncate text-caption text-ink" title={item.label}>
      {item.label}
    </span>
  )
}

/**
 * A ranked list: each row a name and its figure, with a thin bar beneath
 * drawn against the largest value, so the list reads as a ranking at a glance.
 * Server-rendered HTML; the figures carry the meaning and the bars are hidden
 * from screen readers.
 */
export function RankedBarList({ items }: { items: readonly RankedBarItem[] }) {
  const max = Math.max(0, ...items.map((item) => Math.abs(item.value)))
  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3">
            <ItemLabel item={item} />
            <span className="shrink-0 text-caption tabular-nums text-ink-2">{item.valueText}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-line-subtle" aria-hidden="true">
            <div
              className="h-full rounded-pill"
              style={{ width: `${max > 0 ? (Math.abs(item.value) / max) * 100 : 0}%`, backgroundColor: item.color ?? 'var(--accent-info)' }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * Gains and losses on one scale: a gain's bar grows right from the centre
 * line, a loss's left, each against the largest absolute value in the list.
 */
export function DivergingBarList({ items }: { items: readonly RankedBarItem[] }) {
  const max = Math.max(0, ...items.map((item) => Math.abs(item.value)))
  return (
    <ol className="space-y-2">
      {items.map((item) => {
        const half = max > 0 ? (Math.abs(item.value) / max) * 50 : 0
        const gain = item.value >= 0
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3">
              <ItemLabel item={item} />
              <span className="shrink-0 text-caption tabular-nums">{item.valueText}</span>
            </div>
            <div className="relative mt-1 h-1.5 overflow-hidden rounded-pill bg-line-subtle" aria-hidden="true">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                className={clsx('absolute inset-y-0', toneBgClass(signTone(item.value)))}
                style={gain ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
