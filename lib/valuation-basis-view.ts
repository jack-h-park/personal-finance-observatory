import { fmtDate, fmtMomentIn, fmtMomentShort, fmtNumber } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { CRYPTO_PRICE_STALE_MS, FX_RATE_STALE_MS, GOLD_PRICE_STALE_MS, PRICE_STALE_BASE_MS, PRICE_STALE_SESSION_MS, SESSION_SETTLE_MINUTES } from '@/lib/price-staleness'
import { FRESHNESS_SEVERITY, statusTone, type Tone } from '@/lib/tone'
import type { netWorth } from '@/lib/ui-copy/pages/netWorth'
import type { ValuationBasisItem, ValuationBasisKey } from '@/lib/valuation-basis'

/**
 * One chip of the valuation basis strip: the short line the chip shows, and the
 * rows its popover lists. Pure, so the wording for each input is tested without
 * rendering.
 */
export type ValuationChip = {
  key: ValuationBasisKey
  tone: Tone
  label: string
  summary: string
  /** The /health label for the status; null for cash, which is not judged. */
  statusLabel: string | null
  rule: string
  rows: { label: string; value: string }[]
}

type Copy = (typeof netWorth)['en']['valuationBasis']

/**
 * Each stock market is read on its own clock, so a US close reads 16:00 rather than
 * the next morning in Seoul. Crypto has no session; it is read on the Korean clock
 * like the rest of the page. The zone names are the markets' own abbreviations, the
 * same in both languages.
 */
const MARKET_CLOCK: Partial<Record<ValuationBasisKey, { timeZone: string; zone: string }>> = {
  KR: { timeZone: 'Asia/Seoul', zone: 'KST' },
  US: { timeZone: 'America/New_York', zone: 'ET' },
  CRYPTO: { timeZone: 'Asia/Seoul', zone: 'KST' },
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function rule(key: ValuationBasisKey, copy: Copy): string {
  switch (key) {
    case 'KR':
    case 'US':
      return copy.rules.stock(PRICE_STALE_SESSION_MS / HOUR, SESSION_SETTLE_MINUTES, PRICE_STALE_BASE_MS / HOUR)
    case 'CRYPTO':
      return copy.rules.hours(CRYPTO_PRICE_STALE_MS / HOUR)
    case 'GOLD':
      return copy.rules.days(GOLD_PRICE_STALE_MS / DAY)
    case 'FX':
      return copy.rules.days(FX_RATE_STALE_MS / DAY)
    case 'CASH':
      return copy.rules.cash
  }
}

export function valuationChip(
  item: ValuationBasisItem,
  { copy, statusLabels, language }: { copy: Copy; statusLabels: Record<string, string>; language: Language }
): ValuationChip {
  const label = copy.items[item.key]
  const clock = MARKET_CLOCK[item.key]
  const moment = (iso: string) => (clock ? `${fmtMomentIn(iso, clock.timeZone)} ${clock.zone}` : fmtMomentShort(iso, language))
  const rows: ValuationChip['rows'] = []
  const add = (rowLabel: string, value: string | null | undefined) => {
    if (value) rows.push({ label: rowLabel, value })
  }
  let summary: string

  if (item.key === 'CASH') {
    const range = item.cashRange
    const dates = range?.oldest && range.newest ? (range.oldest === range.newest ? fmtDate(range.newest, language) : `${fmtDate(range.oldest, language)} – ${fmtDate(range.newest, language)}`) : null
    summary = dates ?? copy.noBalance
    add(copy.rows.range, [dates, range?.undated ? copy.undated(range.undated) : null].filter(Boolean).join(' · '))
  } else if (item.status === 'missing' && !item.marketDate) {
    summary = copy.noPrice
  } else if (item.key === 'FX') {
    summary = [item.value != null ? fmtNumber(item.value, 2) : null, item.marketDate ? fmtDate(item.marketDate, language) : null].filter(Boolean).join(' · ')
    add(copy.rows.rate, item.value != null ? fmtNumber(item.value, 2) : null)
  } else if (item.key === 'GOLD') {
    summary = [item.marketDate ? fmtDate(item.marketDate, language) : null, item.session ? copy.session[item.session] : null].filter(Boolean).join(' ')
    add(copy.rows.price, item.value != null ? fmtNumber(item.value) : null)
  } else {
    // A stock market or crypto: the newest quote, on the market's clock, and whether it is a close.
    const when = item.quotedNewest ? moment(item.quotedNewest) : item.marketDate ? fmtDate(item.marketDate, language) : copy.noPrice
    summary = [when, item.session ? copy.session[item.session] : null].filter(Boolean).join(' ')
    if (item.quotedNewest) {
      const newest = moment(item.quotedNewest)
      const oldest = item.quotedOldest && item.quotedOldest !== item.quotedNewest ? moment(item.quotedOldest) : null
      add(copy.rows.quoted, oldest ? copy.quotedRange(newest, oldest) : newest)
    }
  }

  if (item.key !== 'CASH') {
    add(copy.rows.marketDate, item.marketDate ? fmtDate(item.marketDate, language) : null)
    add(copy.rows.fetched, item.fetchedAt ? fmtMomentShort(item.fetchedAt, language) : null)
    add(copy.rows.source, item.source)
    add(copy.rows.exchanges, item.exchanges.join(' · '))
    if (item.key === 'KR' || item.key === 'US' || item.key === 'CRYPTO') add(copy.rows.coverage, item.priced || item.missing ? copy.coverage(item.priced, item.missing) : null)
  }

  return {
    key: item.key,
    tone: item.status ? statusTone(FRESHNESS_SEVERITY, item.status) : 'neutral',
    label,
    summary,
    statusLabel: item.status ? statusLabels[item.status] ?? null : null,
    rule: rule(item.key, copy),
    rows,
  }
}
