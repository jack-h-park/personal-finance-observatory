import type { ReactNode } from 'react'
import { ChangeWaterfall, type WaterfallStep } from '@/components/ChangeWaterfall'
import { Columns } from '@/components/layout'
import { ChipGroup, LinkChip } from '@/components/LinkChips'
import { DivergingBarList, type RankedBarItem } from '@/components/RankedBars'
import { Sparkline } from '@/components/Sparkline'
import { Card, Note, Signed } from '@/components/ui'
import type { DayChange } from '@/lib/day-change'
import { fmtDateShort, fmtNumber, fmtPct, fmtSigned } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { marketColor } from '@/lib/palette'
import { PERIODS, type ActualSummary, type Basis, type Period } from '@/lib/period-change'
import { positionHref } from '@/lib/position-url'

export type PeriodChangeCopy = {
  title: string
  info: string
  periodFilter: string
  periods: Record<string, string>
  basisFilter: string
  bases: Record<string, string>
  liveCaption: string
  range: (from: string, to: string) => string
  clampNote: (date: string) => string
  markets: Record<string, string>
  marketsHeading: string
  session: (date: string) => string
  waterfall: { start: string; moneyIn: string; end: string }
  waterfallSummary: (start: string, steps: string, end: string) => string
  sparkTitle: string
  sparkLabel: (change: string) => string
  sparkGapNote: string
  none: string
  fxNote: (now: string, prev: string, prevDate: string) => string
  up: string
  down: string
  excludedNote: (count: string) => string
  unpricedNote: (count: string) => string
  empty: string
  periodEmpty: string
  rulesTitle: string
  rules: readonly { title: string; items: readonly string[] }[]
}

/**
 * What the card shows:
 * - `live`: 1D, each market against its own previous session (both bases coincide).
 * - `actual`: Actual P&L from the period start, with the daily cumulative effect for the sparkline.
 * - `held`: Holdings return, today's quantities from the period-start close.
 * - `empty`: a period with no stored snapshot to start from.
 */
export type PeriodChangeView =
  | { kind: 'live'; change: DayChange }
  | { kind: 'actual'; summary: ActualSummary; spark: number[]; gaps: number }
  | { kind: 'held'; change: DayChange; from: string; clamped: boolean }
  | { kind: 'empty' }

const BASES: Basis[] = ['actual', 'held']
const MONEY_IN = 'in'
const NEUTRAL = 'var(--text-tertiary)'

/**
 * The change over a period on /holdings: period and basis chips, a headline,
 * a start-to-end waterfall, a diverging bar per market, the cumulative line
 * (Actual P&L only), and the securities that moved the portfolio most each
 * way. Always the whole portfolio, so it takes no part in the table's search
 * and filters. Server component; every sign is printed, so colour is never the
 * only signal.
 */
export function PeriodChangeCard({
  view,
  period,
  basis,
  copy,
  language,
  money,
  href,
}: {
  view: PeriodChangeView
  period: Period
  basis: Basis
  copy: PeriodChangeCopy
  language: Language
  /** A KRW amount in the display currency, with its unit. */
  money: (krw: number) => string
  /** The page URL with one card parameter changed and every other parameter kept. */
  href: (param: 'chg' | 'basis', value: string) => string
}) {
  const pct = (value: number | null) => <Signed value={value} format={(m) => fmtPct(m, { digits: 2 })} />
  const date = (value: string) => fmtDateShort(value, language)

  return (
    <Card title={copy.title} info={copy.info} className="mb-5">
      <div className="space-y-4 px-4 py-3">
        <div className="space-y-2">
          <ChipGroup label={copy.periodFilter}>
            {PERIODS.map((p) => (
              <LinkChip key={p} href={href('chg', p)} active={p === period}>
                {copy.periods[p]}
              </LinkChip>
            ))}
          </ChipGroup>
          <ChipGroup label={copy.basisFilter}>
            {BASES.map((b) => (
              <LinkChip key={b} href={href('basis', b)} active={b === basis}>
                {copy.bases[b]}
              </LinkChip>
            ))}
          </ChipGroup>
        </div>
        <Body view={view} copy={copy} money={money} pct={pct} date={date} />
      </div>
      <CalculationRules title={copy.rulesTitle} rules={copy.rules} />
    </Card>
  )
}

function Body({
  view,
  copy,
  money,
  pct,
  date,
}: {
  view: PeriodChangeView
  copy: PeriodChangeCopy
  money: (krw: number) => string
  pct: (value: number | null) => ReactNode
  date: (value: string) => string
}) {
  if (view.kind === 'empty') return <p className="text-body text-ink-2">{copy.periodEmpty}</p>

  if (view.kind === 'actual') {
    const s = view.summary
    const markets = s.markets.filter((m) => m.marketEffect !== 0 || m.moneyIn !== 0)
    const steps: WaterfallStep[] = [
      ...markets.filter((m) => m.marketEffect !== 0).map((m) => ({ key: m.market, value: m.marketEffect, color: marketColor(m.market) })),
      { key: MONEY_IN, value: s.moneyIn, color: NEUTRAL },
    ]
    const ratioPct = (value: number | null) => pct(value == null ? null : value * 100)
    const driverItem = (d: ActualSummary['up'][number]): RankedBarItem => ({
      key: `${d.market}:${d.ticker}`,
      label: d.name,
      href: positionHref(d.market, d.ticker),
      value: d.marketEffect,
      valueText: <Signed value={d.marketEffect} format={money} />,
    })
    const last = view.spark.length > 0 ? view.spark[view.spark.length - 1] : null
    return (
      <>
        <Headline
          change={s.marketEffect}
          pct={ratioPct(s.pct)}
          caption={`${copy.bases.actual} · ${copy.range(date(s.from), date(s.to))}`}
          clampNote={s.clamped ? copy.clampNote(date(s.from)) : null}
          money={money}
        />
        <Waterfall start={s.startValue} end={s.endValue} steps={steps} copy={copy} money={money} />
        <Markets
          heading={copy.marketsHeading}
          items={markets.map((m) => ({
            key: m.market,
            label: copy.markets[m.market] ?? m.market,
            value: m.marketEffect,
            valueText: <Figures change={m.marketEffect} pct={ratioPct(m.pct)} money={money} />,
          }))}
        />
        {view.spark.length >= 2 && last != null && (
          <div>
            <p className="mb-1 text-caption font-medium text-ink-2">{copy.sparkTitle}</p>
            <Sparkline values={view.spark} color="var(--accent-info)" label={copy.sparkLabel(fmtSigned(last, money))} width={240} height={40} />
            {view.gaps > 0 && <Note spacing="above-0.5">{copy.sparkGapNote}</Note>}
          </div>
        )}
        <Movers copy={copy} up={s.up.map(driverItem)} down={s.down.map(driverItem)} />
        {s.unpriced > 0 && <Note>{copy.unpricedNote(fmtNumber(s.unpriced))}</Note>}
      </>
    )
  }

  const change = view.change
  if (change.markets.length === 0 || !change.total) return <p className="text-body text-ink-2">{copy.empty}</p>
  const start = change.markets.reduce((sum, m) => sum + m.prevValueKrw, 0)
  const end = start + change.total.changeKrw
  const newestSession = change.markets.reduce((newest, m) => (m.session > newest ? m.session : newest), change.markets[0].session)
  const caption = view.kind === 'live' ? copy.liveCaption : `${copy.bases.held} · ${copy.range(date(view.from), date(newestSession))}`
  const fx = view.kind === 'live' ? change.usdKrw : null
  const contributorItem = (c: DayChange['up'][number]): RankedBarItem => ({
    key: `${c.market}:${c.ticker}`,
    label: c.name,
    href: positionHref(c.market, c.ticker),
    value: c.changeKrw,
    valueText: <Figures change={c.changeKrw} pct={pct(c.pricePct)} money={money} />,
  })
  return (
    <>
      <Headline
        change={change.total.changeKrw}
        pct={pct(change.total.pct)}
        caption={caption}
        clampNote={view.kind === 'held' && view.clamped ? copy.clampNote(date(view.from)) : null}
        money={money}
      />
      <Waterfall
        start={start}
        end={end}
        steps={change.markets.filter((m) => m.changeKrw !== 0).map((m) => ({ key: m.market, value: m.changeKrw, color: marketColor(m.market) }))}
        copy={copy}
        money={money}
      />
      <Markets
        heading={copy.marketsHeading}
        items={change.markets.map((m) => ({
          key: m.market,
          label: `${copy.markets[m.market] ?? m.market} · ${copy.session(date(m.session))}`,
          value: m.changeKrw,
          valueText: <Figures change={m.changeKrw} pct={pct(m.pct)} money={money} />,
        }))}
        note={fx ? copy.fxNote(fmtNumber(fx.now, 2), fmtNumber(fx.prev, 2), date(fx.prevDate)) : null}
      />
      <Movers copy={copy} up={change.up.map(contributorItem)} down={change.down.map(contributorItem)} />
      {change.excluded > 0 && <Note>{copy.excludedNote(fmtNumber(change.excluded))}</Note>}
    </>
  )
}

function Headline({
  change,
  pct,
  caption,
  clampNote,
  money,
}: {
  change: number
  pct: ReactNode
  caption: string
  clampNote: string | null
  money: (krw: number) => string
}) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-title font-semibold tabular-nums">
        <Signed value={change} format={money} />
        <span className="text-body font-medium">{pct}</span>
      </p>
      <p className="mt-0.5 text-caption text-ink-2">{caption}</p>
      {clampNote && <Note spacing="above-0.5">{clampNote}</Note>}
    </div>
  )
}

function Figures({ change, pct, money }: { change: number; pct: ReactNode; money: (krw: number) => string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <Signed value={change} format={money} />
      <span className="min-w-[3.75rem] text-right">{pct}</span>
    </span>
  )
}

function Waterfall({ start, end, steps, copy, money }: { start: number; end: number; steps: WaterfallStep[]; copy: PeriodChangeCopy; money: (krw: number) => string }) {
  return (
    <ChangeWaterfall
      start={start}
      end={end}
      steps={steps}
      labels={{
        start: copy.waterfall.start,
        end: copy.waterfall.end,
        steps: { ...copy.markets, [MONEY_IN]: copy.waterfall.moneyIn },
        summary: copy.waterfallSummary,
      }}
      money={money}
    />
  )
}

function Markets({ heading, items, note }: { heading: string; items: RankedBarItem[]; note?: string | null }) {
  if (items.length === 0) return null
  return (
    <div>
      <h3 className="mb-1 text-label font-medium text-ink-2">{heading}</h3>
      <DivergingBarList items={items} />
      {note && <Note spacing="above-0.5">{note}</Note>}
    </div>
  )
}

function Movers({ copy, up, down }: { copy: PeriodChangeCopy; up: RankedBarItem[]; down: RankedBarItem[] }) {
  if (up.length === 0 && down.length === 0) return null
  return (
    <Columns columns="sm-2" gap={4}>
      {[
        { heading: copy.up, items: up },
        { heading: copy.down, items: down },
      ].map((list) => (
        <div key={list.heading}>
          <h3 className="mb-1 text-label font-medium text-ink-2">{list.heading}</h3>
          {list.items.length === 0 ? <Note size="caption">{copy.none}</Note> : <DivergingBarList items={list.items} />}
        </div>
      ))}
    </Columns>
  )
}

/**
 * The rules behind the figures, closed by default and grouped: the live 1D
 * rules, the period start, each basis, and why 1D can differ from the last
 * daily bar. The same rules are recorded in
 * docs/architecture/daily-snapshots-and-day-change.md.
 */
function CalculationRules({ title, rules }: { title: string; rules: PeriodChangeCopy['rules'] }) {
  return (
    <details className="mx-4 mb-3 rounded-md border border-line-subtle p-3 text-label text-ink-2">
      <summary className="min-h-6 cursor-pointer font-medium leading-6 text-ink-2">{title}</summary>
      <div className="mt-2 space-y-3">
        {rules.map((group) => (
          <section key={group.title}>
            <h4 className="font-medium text-ink">{group.title}</h4>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {group.items.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}
