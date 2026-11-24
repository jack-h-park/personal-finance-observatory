import { quoteSessionAt } from '@/scripts/market-hours.mjs'
import type { FreshnessStatus } from '@/lib/adapters/portfolio-db'
import { priceSourceNames } from '@/lib/price-basis'
import { CRYPTO_PRICE_STALE_MS, FX_RATE_STALE_MS, GOLD_PRICE_STALE_MS, priceStaleAfterMs } from '@/lib/price-staleness'

/**
 * What each input to the total is valued as of, and from where: one item per stock market,
 * crypto, gold, the USD/KRW rate and cash balances.
 *
 * The page used to say this in one sentence under the composition table ("stock prices as
 * of KR <date> · US <date>, source: <provider>"), which gave a date per market but not the
 * quote time, whether that quote was a close or intraday, when it was fetched, the exchange,
 * or whether it was still current. All of that is already in the price files; /health showed
 * it as freshness rows. This module reads it once so the total's own card can show it.
 *
 * Pure: the caller reads the files and passes their parsed contents (`null` for a file that
 * is missing or unreadable) and the clock. An input that is not passed is not described,
 * which is how a page without gold leaves gold out.
 */

export type ValuationBasisKey = 'KR' | 'US' | 'CRYPTO' | 'GOLD' | 'FX' | 'CASH'

/** A quote struck inside the regular session, or the closing price. Null where sessions do not apply. */
export type QuoteSession = 'close' | 'intraday'

export type CashRange = { oldest: string | null; newest: string | null; undated: number }

export type ValuationBasisItem = {
  key: ValuationBasisKey
  /** The /health scale. Null for cash balances, which have no single freshness limit. */
  status: FreshnessStatus | null
  /** The newest market date among the quotes (YYYY-MM-DD). */
  marketDate: string | null
  quotedNewest: string | null
  quotedOldest: string | null
  session: QuoteSession | null
  /** When the file was written. */
  fetchedAt: string | null
  /** Provider names, once each, joined with " · ". */
  source: string | null
  sourceUrl: string | null
  /** Exchange codes (stocks) or venues (crypto), once each, sorted. */
  exchanges: string[]
  priced: number
  missing: number
  /** The rate (FX), the price per gram (gold), or one security's price (position page). */
  value?: number
  /** The currency of a security's price. */
  currency?: string
  cashRange?: CashRange
}

type PriceFile = { generatedAt?: unknown; source?: unknown; sourceUrl?: unknown; prices?: unknown; missing?: unknown }
type FxFile = { generatedAt?: unknown; sourceUrl?: unknown; rates?: unknown }
type GoldFile = { source?: unknown; fetchedAt?: unknown; latest?: { date?: unknown; price?: unknown } | null }

export type ValuationBasisInput = {
  kr?: PriceFile | null
  us?: PriceFile | null
  crypto?: PriceFile | null
  gold?: GoldFile | null
  fx?: FxFile | null
  cash?: CashRange | null
  now: Date
}

/**
 * The newest and oldest quote time in a price file, as ISO strings: each price's
 * `regularMarketTime` (epoch seconds) or, for crypto, its `quotedAt`. Both null
 * when no price carries one.
 */
export function quoteWindow(prices: unknown): { quotedNewest: string | null; quotedOldest: string | null } {
  const times = (Array.isArray(prices) ? prices : [])
    .map((price: any) => {
      if (typeof price?.regularMarketTime === 'number') return price.regularMarketTime * 1000
      const parsed = typeof price?.quotedAt === 'string' ? Date.parse(price.quotedAt) : NaN
      return Number.isFinite(parsed) ? parsed : null
    })
    .filter((ms): ms is number => ms != null)
  if (!times.length) return { quotedNewest: null, quotedOldest: null }
  return { quotedNewest: new Date(Math.max(...times)).toISOString(), quotedOldest: new Date(Math.min(...times)).toISOString() }
}

/** A file's own `source` field as text, or null when it names none. */
export function sourceText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Whether a stock quote stamped at this time is intraday or the close; null when there is no time. */
export function quoteSession(market: 'KR' | 'US', quotedAt: string | null): QuoteSession | null {
  if (!quotedAt) return null
  const instant = new Date(quotedAt)
  if (!Number.isFinite(instant.getTime())) return null
  return quoteSessionAt(market, instant) === 'open' ? 'intraday' : 'close'
}

function freshness(observedAt: string | null, thresholdMs: number, now: Date): FreshnessStatus {
  const observed = observedAt ? Date.parse(observedAt) : NaN
  if (!Number.isFinite(observed)) return 'missing'
  return now.getTime() - observed > thresholdMs ? 'stale' : 'fresh'
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : null)
const list = (value: unknown): any[] => (Array.isArray(value) ? value : [])
const distinct = (values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))].sort()
const newestDate = (values: unknown[]) => distinct(values.map((v) => (typeof v === 'string' ? v.slice(0, 10) : v))).at(-1) ?? null
const sources = (value: unknown) => {
  const names = priceSourceNames([sourceText(value)])
  return names.length ? names.join(' · ') : null
}

function empty(key: ValuationBasisKey): ValuationBasisItem {
  return {
    key,
    status: 'missing',
    marketDate: null,
    quotedNewest: null,
    quotedOldest: null,
    session: null,
    fetchedAt: null,
    source: null,
    sourceUrl: null,
    exchanges: [],
    priced: 0,
    missing: 0,
  }
}

function priceItem(key: 'KR' | 'US' | 'CRYPTO', file: PriceFile | null, thresholdMs: number, now: Date): ValuationBasisItem {
  if (!file) return empty(key)
  const prices = list(file.prices)
  const window = quoteWindow(prices)
  const fetchedAt = text(file.generatedAt)
  return {
    key,
    status: freshness(fetchedAt, thresholdMs, now),
    marketDate: newestDate(prices.map((price) => price?.asOfDate)),
    ...window,
    session: key === 'CRYPTO' ? null : quoteSession(key, window.quotedNewest),
    fetchedAt,
    source: sources(file.source),
    sourceUrl: text(file.sourceUrl),
    exchanges: distinct(prices.map((price) => price?.exchangeName ?? price?.venue)),
    priced: prices.length,
    missing: list(file.missing).length,
  }
}

function fxItem(file: FxFile | null, now: Date): ValuationBasisItem {
  // The first rate is USD/KRW, as getOperationalHealth reads it.
  const rate = list(file?.rates)[0]
  if (!file || !rate || typeof rate.rate !== 'number') return empty('FX')
  const marketDate = text(rate.asOfDate)?.slice(0, 10) ?? null
  return {
    ...empty('FX'),
    status: freshness(marketDate ? `${marketDate}T00:00:00.000Z` : null, FX_RATE_STALE_MS, now),
    marketDate,
    fetchedAt: text(file.generatedAt),
    source: sources(rate.source),
    sourceUrl: text(rate.sourceUrl) ?? text(file.sourceUrl),
    priced: 1,
    value: rate.rate,
  }
}

function goldItem(file: GoldFile | null, now: Date): ValuationBasisItem {
  const date = text(file?.latest?.date)?.slice(0, 10) ?? null
  const price = file?.latest?.price
  if (!file || !date || typeof price !== 'number') return empty('GOLD')
  return {
    ...empty('GOLD'),
    status: freshness(`${date}T00:00:00.000Z`, GOLD_PRICE_STALE_MS, now),
    marketDate: date,
    // A daily KRX close, never an intraday quote.
    session: 'close',
    fetchedAt: text(file.fetchedAt),
    source: sources(file.source),
    priced: 1,
    value: price,
  }
}

function cashItem(range: CashRange | null): ValuationBasisItem {
  if (!range || (!range.newest && !range.undated)) return empty('CASH')
  return { ...empty('CASH'), status: null, marketDate: range.newest, cashRange: range }
}

/** One item per input passed, in the order KR, US, crypto, gold, FX, cash. */
export function buildValuationBasis(input: ValuationBasisInput): ValuationBasisItem[] {
  const { now } = input
  const items: ValuationBasisItem[] = []
  if (input.kr !== undefined) items.push(priceItem('KR', input.kr, priceStaleAfterMs('KR', now), now))
  if (input.us !== undefined) items.push(priceItem('US', input.us, priceStaleAfterMs('US', now), now))
  if (input.crypto !== undefined) items.push(priceItem('CRYPTO', input.crypto, CRYPTO_PRICE_STALE_MS, now))
  if (input.gold !== undefined) items.push(goldItem(input.gold, now))
  if (input.fx !== undefined) items.push(fxItem(input.fx, now))
  if (input.cash !== undefined) items.push(cashItem(input.cash))
  return items
}

/**
 * One security's own quote, for its position page: the price file narrowed to its ticker. A
 * ticker the file lists as missing has one missing and no quote; one the file does not list
 * at all has neither, which the view reads as "not in the price file" rather than "no price"
 * (a broker export or pension snapshot may still price it).
 */
export function securityValuationBasis(key: 'KR' | 'US' | 'CRYPTO', file: PriceFile | null, ticker: string, now: Date): ValuationBasisItem[] {
  if (!file) return buildValuationBasis({ [key.toLowerCase()]: null, now })
  const prices = list(file.prices).filter((price) => price?.ticker === ticker)
  const narrowed = { ...file, prices, missing: list(file.missing).filter((entry) => entry === ticker || entry?.ticker === ticker) }
  const [item] = buildValuationBasis({ [key.toLowerCase()]: narrowed, now })
  const quote = prices.length === 1 ? prices[0] : null
  return [quote && typeof quote.price === 'number' ? { ...item, value: quote.price, currency: text(quote.currency) ?? undefined } : item]
}
