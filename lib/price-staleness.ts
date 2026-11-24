import { minutesSinceOpen } from '@/scripts/market-hours.mjs'

/**
 * How old a stock price may be before it is called stale.
 *
 * Outside a session the last price is still the right one, and a weekend passes without a
 * new close, so the limit is 36 hours. While a market is open the price job runs every half
 * hour (scripts/refresh.mjs --prices), so a price more than two hours old means it has stopped
 * running, and the limit is two hours.
 *
 * The tight limit applies only once the session has been open for ninety minutes. Before that
 * the newest price can be the previous close, and the first run of the day has not had its turn.
 */
export const PRICE_STALE_BASE_MS = 36 * 60 * 60 * 1000
export const PRICE_STALE_SESSION_MS = 2 * 60 * 60 * 1000
export const SESSION_SETTLE_MINUTES = 90

export type StockMarket = 'KR' | 'US'

/**
 * Crypto trades continuously, so a quote is never "as fresh as the last close": it is simply
 * old. The 36-hour equity limit spans a weekend on purpose and would pass a crypto quote a
 * full trading day and a half stale.
 */
export const CRYPTO_PRICE_STALE_MS = 8 * 60 * 60 * 1000
/** The USD/KRW rate, judged on its market date. */
export const FX_RATE_STALE_MS = 7 * 24 * 60 * 60 * 1000
/**
 * The KRX gold price, judged on its price date. The `gold_price_fresh` check counts whole days
 * and passes up to seven, so it fails from the eighth day; the limit here is the same.
 */
export const GOLD_PRICE_STALE_MS = 8 * 24 * 60 * 60 * 1000

export function priceStaleAfterMs(market: StockMarket, now: Date = new Date()): number {
  const elapsed = minutesSinceOpen(market, now)
  return elapsed != null && elapsed >= SESSION_SETTLE_MINUTES ? PRICE_STALE_SESSION_MS : PRICE_STALE_BASE_MS
}

/** The tighter of the two markets' limits: a figure that mixes them is as stale as either part. */
export function anyPriceStaleAfterMs(now: Date = new Date()): number {
  return Math.min(priceStaleAfterMs('KR', now), priceStaleAfterMs('US', now))
}
