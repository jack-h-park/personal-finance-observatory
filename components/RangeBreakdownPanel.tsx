import Link from 'next/link'
import type { ReactNode } from 'react'
import { HelpPopover } from '@/components/HelpPopover'
import { TotalAssetsChangeField, type TotalAssetsChangeLabels } from '@/components/TotalAssetsChangeField'
import { Note } from '@/components/ui'
import { fmtDate, fmtSigned } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { RANGE_SEGMENT_COLOR } from '@/lib/palette'
import { positionHref } from '@/lib/position-url'
import type { SecurityDriver, Unpriced, topDrivers } from '@/lib/range-breakdown'
import { signClass } from '@/lib/tone'
import type { ClassDriver, ClassKey, InvestmentResult, TotalAssetsChange } from '@/lib/total-assets-change'
import type { netWorth } from '@/lib/ui-copy/pages/netWorth'

type BreakdownCopy = (typeof netWorth)['en']['breakdown']
type Drivers = ReturnType<typeof topDrivers>
type Segment = 'moneyIn' | 'marketEffect'

/**
 * What changed over a selected period: the change in total assets, each class's
 * share of it, and, per security, how much of its change was money put in and
 * how much was the market. Plain divs, no chart library, so the page renders it
 * on the server. `stocks` and `crypto` are null when the database holds no
 * per-security records for the period: the class view still renders.
 */
export function RangeBreakdownPanel({
  from,
  to,
  change,
  investment,
  gap,
  byClass,
  stocks,
  crypto,
  unpriced,
  linkMarkets = {},
  copy,
  money,
  language,
  classColors,
}: {
  from: string
  to: string
  change: TotalAssetsChange | null
  investment: InvestmentResult | null
  /** The KPI-style investment result minus the breakdown's market effect, or null when there is none to show. */
  gap: number | null
  byClass: ClassDriver[]
  stocks: Drivers | null
  crypto: Drivers | null
  unpriced: Unpriced[]
  /** Per `market:ticker` row key, the market of its position page; the row's own market when absent. */
  linkMarkets?: Record<string, string>
  copy: { breakdown: BreakdownCopy; classes: Record<ClassKey, string>; field: TotalAssetsChangeLabels }
  /** Formats a KRW amount in the display currency. */
  money: (krw: number) => string
  language: Language
  classColors: Record<ClassKey, string>
}) {
  const text = copy.breakdown
  const signed = (krw: number) => fmtSigned(krw, money)
  const noData = stocks === null && crypto === null
  return (
    <div className="flex flex-col gap-5">
      <TotalAssetsChangeField
        label={text.period(fmtDate(from, language), fmtDate(to, language))}
        change={change}
        investment={investment}
        labels={copy.field}
        money={money}
        language={language}
      />
      {gap !== null ? (
        <div className="flex items-center text-caption text-ink-2">
          <span className="tabular-nums">{text.costBasisGap(signed(gap))}</span>
          <HelpPopover language={language}>{text.costBasisGapInfo}</HelpPopover>
        </div>
      ) : null}

      {byClass.length ? (
        <section id="breakdown-classes" className="flex flex-col gap-2">
          <SectionTitle>{text.byClass}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {byClass.map((driver) => (
              <BarRow key={driver.key} kind="class" label={copy.classes[driver.key]} value={signed(driver.change)} sign={driver.change}>
                <DivergingBar parts={[{ key: driver.key, value: driver.change, color: classColors[driver.key] }]} scale={maxAbs(byClass.map((d) => d.change))} />
              </BarRow>
            ))}
          </ul>
        </section>
      ) : null}

      {stocks && (stocks.shown.length || stocks.other) ? (
        <DriverSection id="breakdown-stocks" title={text.stocks} drivers={stocks} text={text} signed={signed} linkMarkets={linkMarkets} />
      ) : null}
      {crypto && (crypto.shown.length || crypto.other) ? (
        <DriverSection id="breakdown-crypto" title={text.crypto} drivers={crypto} text={text} signed={signed} linkMarkets={linkMarkets} />
      ) : null}

      {noData ? <Note relaxed>{text.noData}</Note> : null}
      {unpriced.length ? (
        <Note relaxed>
          {text.unpricedNote(
            unpriced.map((row) => (row.name && row.name !== row.ticker ? `${row.ticker} ${row.name}` : row.ticker)).join(', '),
            money(unpriced.reduce((sum, row) => sum + row.costKrw, 0)),
          )}
        </Note>
      ) : null}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-caption font-medium text-ink-2">{children}</h3>
}

function maxAbs(values: number[]) {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0)
}

/** The larger of a row's positive and negative extents, so both sides share one scale. */
function extent(driver: SecurityDriver) {
  const parts = [driver.moneyIn, driver.marketEffect]
  const up = parts.filter((v) => v > 0).reduce((s, v) => s + v, 0)
  const down = parts.filter((v) => v < 0).reduce((s, v) => s - v, 0)
  return Math.max(up, down)
}

function DriverSection({
  id,
  title,
  drivers,
  text,
  signed,
  linkMarkets,
}: {
  id: string
  title: string
  drivers: Drivers
  text: BreakdownCopy
  signed: (krw: number) => string
  linkMarkets: Record<string, string>
}) {
  const rows = drivers.other ? [...drivers.shown, drivers.other] : drivers.shown
  const scale = rows.reduce((max, row) => Math.max(max, extent(row)), 0)
  const segments: Segment[] = ['moneyIn', 'marketEffect']
  return (
    <section id={id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>{title}</SectionTitle>
        <span className="flex flex-wrap items-center gap-3 text-label text-ink-3">
          {segments.map((segment) => (
            <span key={segment} className="inline-flex items-center gap-1">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: RANGE_SEGMENT_COLOR[segment] }} />
              {text[segment]}
            </span>
          ))}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const isOther = drivers.other !== null && row === drivers.other
          const label = isOther ? text.other(drivers.other!.count) : row.name
          return (
            <BarRow
              key={isOther ? 'other' : `${row.market}:${row.ticker}`}
              kind="security"
              label={label}
              sublabel={isOther || row.name === row.ticker ? null : row.ticker}
              href={isOther ? null : positionHref(linkMarkets[`${row.market}:${row.ticker}`] ?? row.market, row.ticker)}
              value={signed(row.valueChange)}
              sign={row.valueChange}
              detail={`${text.moneyIn} ${signed(row.moneyIn)} · ${text.marketEffect} ${signed(row.marketEffect)}`}
            >
              <DivergingBar
                parts={segments.map((segment) => ({ key: segment, value: row[segment], color: RANGE_SEGMENT_COLOR[segment] }))}
                scale={scale}
              />
            </BarRow>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * One labelled row: the label (a link when it has a destination), the net
 * amount, and the bar. On a phone the bar takes its own line under the label.
 */
function BarRow({
  kind,
  label,
  sublabel,
  href,
  value,
  sign,
  detail,
  children,
}: {
  kind: 'class' | 'security'
  label: string
  sublabel?: string | null
  href?: string | null
  value: string
  sign: number
  detail?: string
  children: ReactNode
}) {
  const name = (
    <>
      <span className="truncate text-caption text-ink">{label}</span>
      {sublabel ? <span className="ml-1 text-label text-ink-3">{sublabel}</span> : null}
    </>
  )
  return (
    <li data-row={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex min-w-0 flex-1 flex-col sm:w-44 sm:flex-none">
        {href ? (
          <Link href={href} className="flex min-w-0 items-baseline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40">
            {name}
          </Link>
        ) : (
          <span className="flex min-w-0 items-baseline">{name}</span>
        )}
        {detail ? <span className="text-label tabular-nums text-ink-3">{detail}</span> : null}
      </span>
      <span className={`order-2 shrink-0 text-right text-caption tabular-nums sm:order-3 sm:w-28 ${sign ? signClass(sign) : 'text-ink-3'}`}>{value}</span>
      <div className="order-3 basis-full sm:order-2 sm:flex-1 sm:basis-auto">{children}</div>
    </li>
  )
}

/**
 * A horizontal bar centred on zero. Parts of the same sign sit end to end, in
 * the order given, moving away from the axis; `scale` is the extent that fills
 * one half of the track.
 */
function DivergingBar({ parts, scale }: { parts: { key: string; value: number; color: string }[]; scale: number }) {
  const half = (value: number) => (scale > 0 ? (Math.abs(value) / scale) * 50 : 0)
  let up = 0
  let down = 0
  return (
    <div aria-hidden className="relative h-3 rounded-pill bg-surface">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      {parts.map((part) => {
        if (!part.value) return null
        const width = half(part.value)
        const offset = part.value > 0 ? up : down
        if (part.value > 0) up += width
        else down += width
        return (
          <span
            key={part.key}
            data-segment={part.key}
            className="absolute inset-y-0"
            style={{ background: part.color, width: `${width}%`, ...(part.value > 0 ? { left: `${50 + offset}%` } : { right: `${50 + offset}%` }) }}
          />
        )
      })}
    </div>
  )
}
