import { Signed } from '@/components/ui'
import { fmtSigned } from '@/lib/format'

export type WaterfallStep = {
  key: string
  value: number
  /** The segment's colour; a market's chart colour, or a neutral tone for money in. */
  color: string
}

export type WaterfallSegment = { key: string; from: number; to: number; positive: boolean }

/** Each step runs from the running total to the running total plus its value. */
export function waterfallSegments(input: { start: number; steps: readonly { key: string; value: number }[] }): WaterfallSegment[] {
  let running = input.start
  return input.steps.map((step) => {
    const from = running
    running += step.value
    return { key: step.key, from, to: running, positive: step.value >= 0 }
  })
}

/**
 * The drawn range: every running total, with a margin either side. It never
 * reaches down to zero, because a period's move is a few percent of the total
 * and would vanish on a zero-based bar.
 */
export function waterfallScale(values: readonly number[]): { min: number; max: number } {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const spread = hi - lo
  const margin = spread > 0 ? spread * 0.08 : Math.max(1, Math.abs(hi) * 0.01)
  return { min: lo - margin, max: hi + margin }
}

/**
 * Start value to end value, one row per step: each step a segment from the
 * running total before it to the one after, on a scale that spans only the
 * totals the period passes through. Server-rendered CSS, no chart library. The
 * bars are hidden from screen readers; a sentence states the same figures.
 */
export function ChangeWaterfall({
  start,
  end,
  steps,
  labels,
  money,
}: {
  start: number
  end: number
  steps: readonly WaterfallStep[]
  labels: { start: string; end: string; steps: Record<string, string>; summary: (start: string, steps: string, end: string) => string }
  /** A KRW amount in the display currency, with its unit. */
  money: (krw: number) => string
}) {
  const segments = waterfallSegments({ start, steps })
  const scale = waterfallScale([start, end, ...segments.map((s) => s.to)])
  const at = (value: number) => ((value - scale.min) / (scale.max - scale.min)) * 100
  const colorOf = new Map(steps.map((s) => [s.key, s.color]))
  const stepText = steps.map((s) => `${labels.steps[s.key] ?? s.key} ${fmtSigned(s.value, money)}`).join(', ')

  const marker = (value: number) => (
    <div className="relative h-3 flex-1" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-line-subtle" />
      <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-pill bg-ink-2" style={{ left: `${at(value)}%` }} />
    </div>
  )

  return (
    <div>
      <p className="sr-only">{labels.summary(money(start), stepText, money(end))}</p>
      <ol className="space-y-1.5" aria-hidden="true">
        <li className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-caption text-ink-2 sm:w-20">{labels.start}</span>
          {marker(start)}
          <span className="w-28 shrink-0 text-right text-caption tabular-nums text-ink sm:w-32">{money(start)}</span>
        </li>
        {segments.map((segment, i) => {
          const left = at(Math.min(segment.from, segment.to))
          const width = Math.max(0.5, Math.abs(at(segment.to) - at(segment.from)))
          return (
            <li key={segment.key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-caption text-ink-2 sm:w-20">{labels.steps[segment.key] ?? segment.key}</span>
              <div className="relative h-3 flex-1">
                <div className="absolute inset-x-0 top-1/2 h-px bg-line-subtle" />
                <div
                  className="absolute inset-y-0 rounded-[2px]"
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: colorOf.get(segment.key) }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-caption sm:w-32">
                <Signed value={steps[i].value} format={money} />
              </span>
            </li>
          )
        })}
        <li className="flex items-center gap-2 border-t border-line-subtle pt-1.5">
          <span className="w-16 shrink-0 truncate text-caption font-medium text-ink sm:w-20">{labels.end}</span>
          {marker(end)}
          <span className="w-28 shrink-0 text-right text-caption font-medium tabular-nums text-ink sm:w-32">{money(end)}</span>
        </li>
      </ol>
    </div>
  )
}
