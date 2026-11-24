// quote-sources.mjs — which current price a quote file keeps, Toss or Yahoo.
//
// Inside a market's regular session the Toss quote is fresher: Yahoo's Korean
// quotes run about twenty minutes behind. Outside it the two measure different
// things. A Toss Korean price is the KRX + NXT integrated last trade and keeps
// moving until 20:00 KST, while Yahoo's is the KRX regular-session price that the
// daily history, snapshots and tax figures all use. So the Toss quote wins only
// when it was struck inside the regular session and is newer than Yahoo's. The
// timestamps decide, so no clock or holiday calendar is needed.
// Design: docs/superpowers/specs/2026-11-24-toss-yahoo-quotes-design.md.
import { previousSessionClose, withSettledLastClose } from './settled-bars.mjs'

export const REGULAR_SESSIONS = {
  KR: { timeZone: 'Asia/Seoul', open: 9 * 60, close: 15 * 60 + 30 },
  US: { timeZone: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60 },
}

/** Quotes inside the session that differ by more than this are reported. */
export const DIVERGENCE_PCT = 2

function localParts(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value])
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: parts.weekday }
}

/** The calendar date of an instant on the market's own clock. */
export function marketDate(ms, market) {
  return localParts(ms, REGULAR_SESSIONS[market].timeZone).date
}

/** Whether an instant falls inside the market's regular session on a weekday; the bell itself counts as inside. */
export function inRegularSession(ms, market) {
  const session = REGULAR_SESSIONS[market]
  if (!session || !Number.isFinite(ms)) return false
  const { minutes, weekday } = localParts(ms, session.timeZone)
  if (weekday === 'Sat' || weekday === 'Sun') return false
  return minutes >= session.open && minutes <= session.close
}

/**
 * The quote to keep for one symbol. `yahoo` is { price, atMs }, `toss` is
 * { price, quotedAt } (ISO), either may be null. Returns
 * { source, price, atMs, alternate } or null when neither has a price.
 */
export function chooseQuote(market, yahoo, toss) {
  const tossAt = toss?.quotedAt ? Date.parse(toss.quotedAt) : NaN
  const tossQuote = toss && Number.isFinite(toss.price) && toss.price > 0 && Number.isFinite(tossAt) ? { source: 'toss', price: toss.price, atMs: tossAt } : null
  const yahooQuote = yahoo && Number.isFinite(yahoo.price) && yahoo.price > 0 && Number.isFinite(yahoo.atMs) ? { source: 'yahoo', price: yahoo.price, atMs: yahoo.atMs } : null
  if (!tossQuote && !yahooQuote) return null
  // Either source alone is better than none, whatever the hour.
  if (!yahooQuote) return { ...tossQuote, alternate: null }
  if (!tossQuote) return { ...yahooQuote, alternate: null }
  const tossWins = inRegularSession(tossQuote.atMs, market) && tossQuote.atMs > yahooQuote.atMs
  const [used, other] = tossWins ? [tossQuote, yahooQuote] : [yahooQuote, tossQuote]
  return { ...used, alternate: other }
}

/** Both quotes inside the same day's session and further apart than DIVERGENCE_PCT. */
export function divergent(market, quote) {
  const alternate = quote?.alternate
  if (!alternate || !inRegularSession(quote.atMs, market) || !inRegularSession(alternate.atMs, market)) return false
  // Yesterday's close against today's trade is a day's move, not a disagreement.
  if (marketDate(quote.atMs, market) !== marketDate(alternate.atMs, market)) return false
  return Math.abs(quote.price / alternate.price - 1) * 100 > DIVERGENCE_PCT
}

function isoDate(seconds) {
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10)
}

/** Daily bars from a Yahoo chart result, the empty close of a settled session filled. */
export function chartBars(result) {
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const bars = (result?.timestamp ?? []).map((seconds, index) => ({ price_date: isoDate(seconds), close: closes[index] == null ? null : Number(closes[index]) }))
  return withSettledLastClose(bars, result?.meta)
}

/**
 * Merge the Yahoo entries a price fetch built with the Toss prices for the same
 * symbols. Each Yahoo entry may carry its chart result under the non-enumerable
 * `chart` property, used to measure the previous close against the session of
 * the quote kept. Returns { prices, divergent } for the quote file.
 */
export function mergeQuotes({ market, yahooEntries, tossPrices, tickers, currency }) {
  const byTicker = new Map(yahooEntries.map((entry) => [entry.ticker, entry]))
  const prices = []
  const flagged = []
  for (const ticker of tickers) {
    const entry = byTicker.get(ticker)
    const toss = tossPrices.get(ticker) ?? null
    const tossInCurrency = toss && (!toss.currency || toss.currency === currency) ? toss : null
    const yahoo = entry ? { price: entry.price, atMs: Number(entry.regularMarketTime) * 1000 } : null
    const quote = chooseQuote(market, yahoo, tossInCurrency)
    if (!quote) continue
    const asOfDate = marketDate(quote.atMs, market)
    const bars = entry?.chart ? chartBars(entry.chart) : []
    const previous = bars.length ? previousSessionClose(bars, asOfDate) : null
    prices.push({
      ...(entry ?? { ticker, symbol: ticker, currency, exchangeName: '', instrumentType: '', shortName: '', longName: '' }),
      price: quote.price,
      asOfDate,
      regularMarketTime: Math.floor(quote.atMs / 1000),
      previousClose: previous?.close ?? null,
      previousCloseDate: previous?.date ?? null,
      source: quote.source,
      quotedAt: new Date(quote.atMs).toISOString(),
      alternate: quote.alternate ? { source: quote.alternate.source, price: quote.alternate.price, quotedAt: new Date(quote.alternate.atMs).toISOString() } : null,
    })
    if (divergent(market, quote)) {
      flagged.push({ ticker, [quote.source]: quote.price, [quote.alternate.source]: quote.alternate.price, at: new Date(quote.atMs).toISOString() })
    }
  }
  return { prices, divergent: flagged }
}
