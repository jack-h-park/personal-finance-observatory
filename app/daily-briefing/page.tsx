import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, EmptyState, Label, MetaItem, MetaRow, Note, SectionHeading, Signed, Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import {
  getArchiveStatus,
  getBriefing,
  publicBriefingUrl,
  type BriefingDocument,
  type BriefingMarket,
  type BriefingPosition,
  type BriefingSessionMove,
} from '@/lib/adapters/briefing-archive'
import { EMPTY_VALUE, fmtDate, fmtDateShort, fmtDateTime, fmtNumber, fmtPct, fmtQuantity } from '@/lib/format'
import { getGlossary } from '@/lib/glossary'
import { positionHref } from '@/lib/position-url'
import { BRIEFING_SEVERITY, TRADE_SIDE_TONE, categoryTone, signTone, statusTone } from '@/lib/tone'
import { Select } from '@/components/form'
import { getLanguage } from '@/lib/i18n-server'
import { getPageCopy, getUiCopy } from '@/lib/ui-copy'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { Stat, StatStrip } from '@/components/layout'
import { reviewMarket, type MarketReview } from '@/lib/briefing-review'
import { maskAccountLabel } from '@/lib/account-label'

type PageCopy = ReturnType<typeof getPageCopy<'dailyBriefing'>>

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/daily-briefing')


// Amounts stay in each market's own currency. Converting them into one number
// would need an FX snapshot the briefing does not carry, and a wrong rate
// misstates both sides at once.
function amount(value: number, market: BriefingMarket, digits = 0) {
  const sign = value < 0 ? '-' : ''
  return `${sign}${market.symbol}${fmtNumber(Math.abs(value), digits)}`
}

function priceOf(value: number, market: BriefingMarket) {
  return amount(value, market, market.priceDigits)
}

/** Korean codes are opaque alone, so the sheet's company name rides along. */
function TickerLink({ ticker, name, market }: { ticker: string; name?: string | null; market: BriefingMarket }) {
  return (
    <>
      <Link href={positionHref(market.id, ticker)} className="font-mono text-caption font-medium text-info hover:underline">
        {ticker}
      </Link>
      {name && <div className="mt-0.5 text-micro leading-tight text-ink-3">{name}</div>}
    </>
  )
}

// Priority is the primary signal (how soon), kind the secondary one (what sort).
// The writer already orders actions by priority, so this page only displays.
// Its colour comes from BRIEFING_SEVERITY in lib/tone.
// Built per request rather than at module scope, because the wording is now
// per-language and a module constant would freeze whichever language loaded first.
const priorityLabels = (copy: PageCopy): Record<string, string> => ({
  'act-now': copy.actNow,
  'this-week': copy.thisWeek,
  fyi: copy.fyi,
})

/** Documents archived before priority existed default to the least urgent level. */
function priorityOf(action: { priority?: string }) {
  return action.priority && ['act-now', 'this-week', 'fyi'].includes(action.priority) ? action.priority : 'fyi'
}

const sessionExplain = (copy: PageCopy): Record<string, string> => ({
  'no-prior-snapshot': copy.noPriorSnapshot,
  'no-holdings': copy.noSnapshot,
  'no-price-coverage': copy.noPrices,
})

type Notes = BriefingDocument['narrative']['moverNotes']

/**
 * Each researched note once per ticker. A ticker that ranked both as a mover
 * since the last briefing and against cost used to get the same paragraph
 * twice; it now gets one row carrying both figures.
 */
function NotedMovers({ review, notes, market, copy }: { review: MarketReview; notes: Notes; market: BriefingMarket; copy: PageCopy }) {
  if (review.noted.length === 0) return <EmptyState>{copy.noNotes}</EmptyState>
  return (
    <ul className="divide-y divide-[color:var(--border-subtle)]">
      {review.noted.map((m) => (
        <li key={m.ticker} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="w-28 shrink-0">
            <TickerLink ticker={m.ticker} name={m.name} market={market} />
            {m.session && (
              <div className="mt-0.5 text-label tabular-nums">
                <Signed value={m.session.pctChange} format={(v) => fmtPct(v)} className="font-medium" />{' '}
                <span className="text-micro text-ink-3">{copy.sinceShort}</span>
              </div>
            )}
            {m.vsCost && (
              <div className="text-label tabular-nums">
                <Signed value={m.vsCost.pct} format={(v) => fmtPct(v)} />{' '}
                <span className="text-micro text-ink-3">{copy.vsCostShort}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-caption leading-relaxed text-ink-2">
              {m.session?.suspectedRestatement ? copy.moverNote(m.session, notes) : m.why}
            </p>
            {m.session && (
              <div className="mt-0.5 text-micro tabular-nums text-ink-3">
                {priceOf(m.session.priceFrom, market)} → {priceOf(m.session.priceTo, market)} · {amount(m.session.valueChange, market)}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Movers nobody wrote about: one line of ticker and change per list, no card each. */
function QuietLine({ label, items, market }: { label: string; items: { ticker: string; name?: string | null; pct: number }[]; market: BriefingMarket }) {
  if (items.length === 0) return null
  return (
    <p className="leading-relaxed">
      <span className="font-medium text-ink-2">{label}</span>{' '}
      {items.map((it, i) => (
        <span key={it.ticker} className="whitespace-nowrap">
          {/* Korean codes are opaque alone, so the company name stands in where the sheet has one. */}
          <Link href={positionHref(market.id, it.ticker)} className="text-info hover:underline">
            {it.name || it.ticker}
          </Link>{' '}
          <Signed value={it.pct} format={(v) => fmtPct(v)} className="tabular-nums" />
          {i < items.length - 1 ? ', ' : ''}
        </span>
      ))}
    </p>
  )
}

function QuietMovers({ review, market, copy }: { review: MarketReview; market: BriefingMarket; copy: PageCopy }) {
  const session = (list: BriefingSessionMove[]) => list.map((m) => ({ ticker: m.ticker, name: m.name, pct: m.pctChange }))
  const vsCost = (list: BriefingPosition[]) => list.map((p) => ({ ticker: p.ticker, name: p.name, pct: p.pct }))
  const count = review.quietUp.length + review.quietDown.length + review.quietBest.length + review.quietWorst.length
  if (count === 0) return null
  return (
    <div className="-mx-4 -mb-4 mt-4 space-y-1 border-t border-line-subtle bg-surface px-4 py-3 text-label text-ink-3">
      <Label as="div" size="micro">{copy.quietLead}</Label>
      <QuietLine label={copy.gainers} items={session(review.quietUp)} market={market} />
      <QuietLine label={copy.decliners} items={session(review.quietDown)} market={market} />
      <QuietLine label={copy.bestVsCost} items={vsCost(review.quietBest)} market={market} />
      <QuietLine label={copy.worstVsCost} items={vsCost(review.quietWorst)} market={market} />
    </div>
  )
}

// `split` is not a trade, so it gets neither a buy/sell tone (TRADE_SIDE_TONE
// in lib/tone) nor a trade verb, and falls through to a neutral badge. The
// wording lives in lib/ui-copy/pages/dailyBriefing.ts, where it can be tested.

function DatePicker({ dates, selected, copy }: { dates: string[]; selected: string; copy: PageCopy }) {
  const i = dates.indexOf(selected)
  // dates are newest-first, so "newer" is the lower index.
  const newer = i > 0 ? dates[i - 1] : null
  const older = i >= 0 && i < dates.length - 1 ? dates[i + 1] : null
  const link = 'rounded-sm border border-line bg-card px-2 py-1 text-caption text-ink-2 transition-colors hover:border-ink-3 hover:text-ink'
  const disabled = 'rounded-sm border border-line-subtle bg-surface px-2 py-1 text-caption text-ink-3/60'

  return (
    // A plain GET form: the page stays a server component and the picker works
    // without client-side JavaScript.
    <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
      {older ? (
        <Link href={`/daily-briefing?date=${older}`} className={link} aria-label={copy.olderBriefing(older)}>
          ←
        </Link>
      ) : (
        <span className={disabled} aria-hidden>
          ←
        </span>
      )}
      <Select
        name="date"
        defaultValue={selected}
        aria-label={copy.briefingDate}
        size="sm"
      >
        {dates.map((d, idx) => (
          <option key={d} value={d}>
            {d}
            {idx === 0 ? ` (${copy.latestSuffix})` : ''}
          </option>
        ))}
      </Select>
      <Button type="submit">
        {copy.view}
      </Button>
      {newer ? (
        <Link href={`/daily-briefing?date=${newer}`} className={link} aria-label={copy.newerBriefing(newer)}>
          →
        </Link>
      ) : (
        <span className={disabled} aria-hidden>
          →
        </span>
      )}
      <span className="text-label text-ink-3">
        {copy.briefingRange(dates.length, dates[dates.length - 1], dates[0])}
      </span>
    </form>
  )
}

export default async function DailyBriefingPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const language = await getLanguage()
  const copy = getPageCopy('dailyBriefing', language)
  const glossary = getGlossary(language)
  const noValue = getUiCopy(language).common.noValue
  const params = await searchParams
  const archive = getArchiveStatus()
  const latest = archive.dates[0]
  const selected = params.date && archive.dates.includes(params.date) ? params.date : latest
  const doc = selected ? getBriefing(selected) : null

  if (!doc) {
    return (
      <>
        <PageHeader
          eyebrow={routeSection('/daily-briefing', language)}
          title={copy.title}
          emphasis={copy.emphasis}
          subtitle={copy.subtitle}
        />
        <Card>
          <EmptyState
            hint={
              archive.present
                ? copy.archiveUnreadableHint(archive.dir)
                : copy.archiveMissingHint(archive.dir)
            }
          >
            {archive.present && archive.dates.length > 0
              ? copy.unreadable
              : copy.noArchive}
          </EmptyState>
        </Card>
      </>
    )
  }

  const isLatest = doc.date === latest
  // US and Korean figures are never combined: different currencies, different
  // trading sessions, and no FX snapshot in the briefing to bridge them honestly.
  const markets = doc.markets.filter((m) => m.aggregates)
  // The archive stores an English market label; the page names the market in its own language.
  const marketName = (m: { id: string; label: string }) => copy.marketNames[m.id] ?? m.label

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/daily-briefing', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.docSubtitle(fmtDateShort(doc.date, language), fmtDate(doc.generatedAt, language))}
        status={isLatest ? { severity: 'ok', label: copy.latest } : { severity: 'quiet', label: copy.archived }}
        actions={
          <a
            href={publicBriefingUrl(doc.date, isLatest)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-6 items-center text-caption text-info hover:underline"
          >
            {copy.openPublished}
          </a>
        }
      />

      <DatePicker dates={archive.dates} selected={doc.date} copy={copy} />

      {/* What the edition asks of the reader comes first; the figures below are the evidence. */}
      {doc.narrative.actions.length > 0 && (
        <Card title={copy.suggestedActions} className="mb-5">
          <ul className="space-y-2.5">
            {doc.narrative.actions.map((a, i) => {
              const priority = priorityOf(a)
              return (
                <li key={i} className="rounded-sm border border-line bg-surface px-3 py-2.5">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(BRIEFING_SEVERITY, priority)}>{priorityLabels(copy)[priority]}</Badge>
                    <span className="text-caption font-medium text-ink">{a.head}</span>
                    <Label as="span">{a.kind}</Label>
                  </div>
                  <p className="text-caption leading-relaxed text-ink-2">{a.body}</p>
                </li>
              )
            })}
          </ul>
          <Note spacing="above-3" relaxed>
            {copy.actionsLead} <b>{copy.actNow}</b>{copy.actNowMeaning} <b>{copy.thisWeek}</b>{copy.thisWeekMeaning}{' '}
            <b>{copy.fyi}</b>{copy.fyiMeaning} {copy.disclaimer}
          </Note>
        </Card>
      )}

      {markets.length === 0 && (
        <Card className="mb-5">
          <EmptyState hint={copy.narrativeOnlyHint}>
            {copy.narrativeOnly(doc.date)}
          </EmptyState>
        </Card>
      )}

      {markets.map((m) => {
        const totals = m.aggregates!.totals
        const session = m.session?.available ? m.session : null
        const review = reviewMarket(m, doc.narrative.moverNotes)
        return (
          <section key={m.id} className="mb-2">
            <SectionHeading
              size="section"
              tracking
              layout="band"
              subtitle={`${session ? copy.bandSince(session.previousDate) : copy.bandNoComparison} · ${m.currency}`}
            >
              {`${m.flag} ${marketName(m)}`}
            </SectionHeading>

            {session?.marketClosed && (
              <Card className="mb-3">
                <EmptyState hint={copy.sessionZero}>
                  {copy.marketClosed(marketName(m), session.previousDate)}
                </EmptyState>
              </Card>
            )}
            {!session && (
              <Card className="mb-3">
                <EmptyState hint={sessionExplain(copy)[m.session?.reason ?? ''] ?? copy.noPriorSnapshot}>
                  {copy.noComparison(marketName(m))}
                </EmptyState>
              </Card>
            )}

            <div className="mb-5">
              <StatStrip columns="md-4">
                <Stat
                  label={session ? copy.sessionPl : copy.standingSnapshot}
                  info={copy.sessionPlInfo}
                  value={session ? <Signed value={session.totals!.pl} format={(v) => amount(v, m)} /> : EMPTY_VALUE}
                  sub={session ? copy.pricedHint(String(session.totals!.coveredPositions), session.totals!.uncoveredPositions) : noValue}
                  tone={session ? signTone(session.totals!.pl) : 'neutral'}
                />
                <Stat
                  label={copy.sessionReturn}
                  value={session ? fmtPct(session.totals!.plPct, { signed: true }) : EMPTY_VALUE}
                  sub={session ? copy.priorValueHint(amount(session.totals!.priorMarketValue, m)) : noValue}
                  tone={session ? signTone(session.totals!.plPct) : 'neutral'}
                />
                <Stat label={copy.portfolioValue} value={amount(totals.marketValue, m)} sub={copy.positionCount(totals.positions)} />
                <Stat
                  label={copy.unrealized}
                  info={glossary.unrealizedGl.description}
                  value={amount(totals.gl, m)}
                  sub={copy.unrealizedHint(fmtPct(totals.pct, { signed: true }), amount(totals.cost, m))}
                  tone={signTone(totals.gl)}
                />
              </StatStrip>
            </div>

            <Card title={copy.notesTitle} info={copy.notesInfo(amount(m.moverMinCost, m))} className="mb-5">
              <NotedMovers review={review} notes={doc.narrative.moverNotes} market={m} copy={copy} />
              <QuietMovers review={review} market={m} copy={copy} />
            </Card>

            {(review.activity.length > 0 || review.fractional.length > 0) && (
              <Card title={copy.activitySince(session?.previousDate ?? null)} className="mb-5">
                {review.activity.length > 0 && (
                  <ul className="divide-y divide-[color:var(--border-subtle)]">
                    {review.activity.map((a) => (
                      <li key={`${a.ticker}-${a.kind}`} className="flex flex-wrap items-center gap-2 py-2 text-caption first:pt-0 last:pb-0">
                        <span className="w-20 shrink-0">
                          <TickerLink ticker={a.ticker} market={m} />
                        </span>
                        <Badge tone={categoryTone(TRADE_SIDE_TONE, a.kind)}>{copy.activityBadge(a)}</Badge>
                        <span className="text-ink-2">{copy.activityWording(a, fmtQuantity)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {review.fractional.length > 0 && (
                  <p className={`text-label text-ink-3 ${review.activity.length > 0 ? 'mt-3' : ''}`}>
                    {copy.fractionalFolded(review.fractional.length, review.fractional.map((a) => a.ticker).join(', '))}
                  </p>
                )}
                <Note spacing="above-3" relaxed>
                  {copy.activityNote}
                </Note>
              </Card>
            )}

            {/* The portfolio pages already show holdings; here the table is kept for looking back, closed by default. */}
            <details className="mb-5 rounded-md border border-line bg-card">
              <summary className="min-h-6 cursor-pointer px-4 py-2.5 text-body font-medium text-ink-2">
                {copy.largestToggle(m.aggregates!.largest.length)}
              </summary>
              <div className="border-t border-line-subtle p-4">
                <Note spacing="none" relaxed>{copy.largestInfo}</Note>
                <Table scroll>
                  <Thead>
                    <Th>{copy.columns.ticker}</Th>
                    <Th align="right">{copy.costShort}</Th>
                    <Th align="right">{copy.columns.marketValue}</Th>
                    <Th align="right">{copy.unrealized}</Th>
                    <Th align="right">{copy.columns.returnPct}</Th>
                    <Th align="right">{copy.columns.quantity}</Th>
                    <Th>{copy.columns.accounts}</Th>
                  </Thead>
                  <Tbody>
                    {m.aggregates!.largest.map((p) => (
                      <Tr key={p.ticker}>
                        <Td>
                          <TickerLink ticker={p.ticker} name={p.name} market={m} />
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {amount(p.cost, m)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {amount(p.marketValue, m)}
                        </Td>
                        <Td align="right" className="tabular-nums">
                          <Signed value={p.gl} format={(v) => amount(v, m)} />
                        </Td>
                        <Td align="right" className="tabular-nums">
                          <Signed value={p.pct} format={(m) => fmtPct(m)} />
                        </Td>
                        <Td align="right" className="tabular-nums">
                          {fmtQuantity(p.quantity, 2)}
                        </Td>
                        <Td className="text-label text-ink-3">{p.accounts.map(maskAccountLabel).join(', ')}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </details>
          </section>
        )
      })}

      {/* Closed by default: the published page carries this paragraph in full. */}
      <details className="mb-5 rounded-md border border-line bg-card">
        <summary className="min-h-6 cursor-pointer px-4 py-2.5 text-body font-medium text-ink-2">{copy.marketContext}</summary>
        {/* Pipeline-generated HTML (<b> emphasis only), from our own cron — not user input. */}
        <div
          className="briefing-macro border-t border-line-subtle p-4 text-body leading-relaxed text-ink-2"
          dangerouslySetInnerHTML={{ __html: doc.narrative.macro }}
        />
      </details>

      <MetaRow>
        <MetaItem label={copy.briefingDate}>{doc.date}</MetaItem>
        <MetaItem label={copy.documentBuilt}>{fmtDateTime(doc.generatedAt, language)}</MetaItem>
        <MetaItem label={copy.markets}>{markets.map(marketName).join(', ') || copy.noMarkets}</MetaItem>
        <MetaItem label={copy.archive}>{archive.dir}</MetaItem>
      </MetaRow>
      <Note spacing="above-2" relaxed>
        {copy.footer}
      </Note>
    </>
  )
}
