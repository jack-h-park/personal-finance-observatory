import type { ReactNode } from 'react'
import { Columns } from '@/components/layout'
import { Card, Note, Signed } from '@/components/ui'
import type { DayChange, DayContributor } from '@/lib/day-change'
import { fmtDateShort, fmtNumber, fmtPct } from '@/lib/format'
import { marketColor } from '@/lib/palette'
import { positionHref } from '@/lib/position-url'
import type { Language } from '@/lib/i18n'
import Link from 'next/link'

export type DayChangeCopy = {
  title: string
  info: string
  markets: Record<string, string>
  total: string
  session: (date: string) => string
  fxNote: (now: string, prev: string, prevDate: string) => string
  up: string
  down: string
  excludedNote: (count: string) => string
  empty: string
}

/**
 * The day's change on /holdings: one row per market, a total, and the
 * securities that moved the portfolio most each way. Always the whole
 * portfolio, so it takes no part in the table's search and filters.
 * The sign is printed by `Signed`, so colour is never the only signal.
 */
export function DayChangeCard({
  change,
  copy,
  language,
  money,
}: {
  change: DayChange
  copy: DayChangeCopy
  language: Language
  /** A KRW amount in the display currency, with its unit. */
  money: (krw: number) => string
}) {
  const pct = (value: number | null) => <Signed value={value} format={(m) => fmtPct(m, { digits: 2 })} />
  const fx = change.usdKrw
  return (
    <Card title={copy.title} info={copy.info} className="mb-5">
      {change.markets.length === 0 ? (
        <p className="px-4 py-3 text-body text-ink-2">{copy.empty}</p>
      ) : (
        <div className="space-y-4 px-4 py-3">
          <ul className="space-y-2" aria-label={copy.title}>
            {change.markets.map((entry) => (
              <li key={entry.market}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <span className="inline-flex items-center gap-1.5 text-body text-ink">
                    <span aria-hidden className="h-2 w-2 rounded-pill" style={{ backgroundColor: marketColor(entry.market) }} />
                    {copy.markets[entry.market]}
                    <span className="text-caption text-ink-3">{copy.session(fmtDateShort(entry.session, language))}</span>
                  </span>
                  <span className="inline-flex items-baseline gap-3 tabular-nums">
                    <Signed value={entry.changeKrw} format={money} />
                    <span className="min-w-[4.5rem] text-right">{pct(entry.pct)}</span>
                  </span>
                </div>
                {entry.market === 'US' && fx && (
                  <Note spacing="above-0.5">{copy.fxNote(fmtNumber(fx.now, 2), fmtNumber(fx.prev, 2), fmtDateShort(fx.prevDate, language))}</Note>
                )}
              </li>
            ))}
            {change.total && (
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-line-subtle pt-2">
                <span className="text-body font-medium text-ink">{copy.total}</span>
                <span className="inline-flex items-baseline gap-3 font-medium tabular-nums">
                  <Signed value={change.total.changeKrw} format={money} />
                  <span className="min-w-[4.5rem] text-right">{pct(change.total.pct)}</span>
                </span>
              </li>
            )}
          </ul>
          {(change.up.length > 0 || change.down.length > 0) && (
            <Columns columns="sm-2" gap={4}>
              <Movers heading={copy.up} items={change.up} copy={copy} money={money} pct={pct} />
              <Movers heading={copy.down} items={change.down} copy={copy} money={money} pct={pct} />
            </Columns>
          )}
          {change.excluded > 0 && <Note>{copy.excludedNote(fmtNumber(change.excluded))}</Note>}
        </div>
      )}
    </Card>
  )
}

function Movers({
  heading,
  items,
  copy,
  money,
  pct,
}: {
  heading: string
  items: DayContributor[]
  copy: DayChangeCopy
  money: (krw: number) => string
  pct: (value: number | null) => ReactNode
}) {
  if (items.length === 0) return <div />
  return (
    <div>
      <h3 className="mb-1 text-label font-medium text-ink-2">{heading}</h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={`${item.market}:${item.ticker}`} className="flex items-baseline justify-between gap-3 text-caption">
            <span className="min-w-0 truncate text-ink">
              <Link href={positionHref(item.market, item.ticker)} className="hover:underline">
                {item.name}
              </Link>
              <span className="ml-1.5 text-ink-3">{copy.markets[item.market] ?? item.market}</span>
            </span>
            <span className="inline-flex shrink-0 items-baseline gap-2 tabular-nums">
              <Signed value={item.changeKrw} format={money} />
              <span className="min-w-[3.75rem] text-right">{pct(item.pricePct)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
