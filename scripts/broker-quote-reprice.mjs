/**
 * Revalue a position a broker export priced, at a newer market quote.
 *
 * A holdings CSV (Chase, Merrill, Fidelity) carries the broker's price as of
 * the day it was downloaded, and the refresh never downloads it: someone does,
 * by hand, every few days. Valued at that price, those positions stayed frozen
 * between downloads while every refresh moved the Robinhood ones to the latest
 * close, so the same unrealized G/L mixed a days-old figure with a fresh one.
 * us-prices.json already quotes every ticker those files hold
 * (readUsHoldingTickers), so the quote is used instead whenever it is newer
 * than the file.
 *
 * Only the price moves. Quantity and cost basis are the broker's and stay as
 * the file states them. A quote that is missing, not in the row's currency, or
 * not newer than the file leaves the row exactly as the broker priced it.
 *
 * Mutates the row in place: the ingest keys later steps on row identity.
 *
 * @param {Record<string, any>} row a holdings row (`quantity`, `native_cost`)
 *   or a tax lot (`open_quantity`, `native_cost_basis`)
 * @param {{ price?: number, currency?: string, asOfDate?: string } | undefined} quote
 * @param {(value: number | null, currency: string) => number | null} toBase
 * @returns {boolean} whether the row was repriced
 */
export function repriceFromQuote(row, quote, toBase) {
  const price = Number(quote?.price)
  if (!quote || !Number.isFinite(price) || price <= 0) return false
  const currency = row.currency || 'USD'
  if (quote.currency && quote.currency !== currency) return false
  const quoteDate = String(quote.asOfDate ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(quoteDate)) return false
  if (row.as_of_date && quoteDate <= String(row.as_of_date).slice(0, 10)) return false

  const isLot = 'open_quantity' in row
  const quantity = Number(isLot ? row.open_quantity : row.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return false
  const cost = Number(isLot ? row.native_cost_basis : row.native_cost) || 0
  const marketValue = price * quantity
  const unrealized = marketValue - cost

  row.native_market_value = marketValue
  row.native_unrealized_gl = unrealized
  // Not a stored column: the snapshot's price dates read it (priceDatesByMarket).
  row.price_as_of = quoteDate
  if (!isLot) {
    row.native_price = price
    row.native_unrealized_gl_pct = cost ? (unrealized / cost) * 100 : null
    row.base_market_value = toBase(marketValue, currency)
    row.base_unrealized_gl = toBase(unrealized, currency)
  }
  return true
}
