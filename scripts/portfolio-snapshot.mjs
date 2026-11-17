export const MIN_TREND_COST_COVERAGE = 0.9
export const HEALTHY_TREND_COST_COVERAGE = 0.95

export function portfolioDate(value = new Date(), timeZone = process.env.STOCK_TIME_ZONE || 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = (type) => parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function ratio(numerator, denominator, emptyValue = 1) {
  return denominator > 0 ? numerator / denominator : emptyValue
}

function emptyBook() {
  return {
    totalCost: 0,
    pricedCost: 0,
    partialMarketValue: 0,
    positionCount: 0,
    pricedPositionCount: 0,
  }
}

function finishBook(book) {
  const unrealizedGl = book.partialMarketValue - book.pricedCost
  return {
    ...book,
    costCoverage: ratio(book.pricedCost, book.totalCost),
    positionCoverage: ratio(book.pricedPositionCount, book.positionCount),
    unrealizedGl,
    returnPct: book.pricedCost > 0 ? (unrealizedGl / book.pricedCost) * 100 : null,
  }
}

/**
 * Values a portfolio without pretending an unpriced position is worth zero.
 *
 * `marketValue` is nullable. Total cost always includes every position, while
 * G/L and return only compare the priced market value with the corresponding
 * priced cost. This keeps `G/L = market value - cost` algebraically true even
 * when coverage is partial.
 */
export function valuePortfolio(positions) {
  const books = {
    global: emptyBook(),
    KR: emptyBook(),
    US: emptyBook(),
    CRYPTO: emptyBook(),
  }

  for (const position of positions) {
    const market = String(position.market || '')
    if (!(market in books) || market === 'global') continue
    const cost = Number(position.cost || 0)
    const marketValue = position.marketValue == null ? null : Number(position.marketValue)
    const priced = marketValue != null && Number.isFinite(marketValue)

    for (const key of ['global', market]) {
      const book = books[key]
      book.totalCost += cost
      book.positionCount += 1
      if (priced) {
        book.pricedCost += cost
        book.partialMarketValue += marketValue
        book.pricedPositionCount += 1
      }
    }
  }

  return Object.fromEntries(Object.entries(books).map(([key, book]) => [key, finishBook(book)]))
}

const PRICE_MARKETS = ['KR', 'US', 'CRYPTO']

/**
 * The market dates of the prices a snapshot was valued with, per market: the
 * newest and the oldest among the holdings that carry a market value. A row
 * states its price date in `price_as_of` where the price came from a price file
 * whose date differs from the row's own `as_of_date` (a Robinhood lot dated by
 * its lot snapshot, priced from us-prices.json); every other row's price is as
 * of its `as_of_date`. Unpriced rows say nothing about price dates and are
 * skipped, so a market with no priced row gets nulls.
 *
 * The newest date shows whether the last refresh fetched prices at all; the
 * oldest shows a single quote that stopped updating (a halted ticker) while the
 * rest moved on.
 */
export function priceDatesByMarket(rows) {
  const dates = Object.fromEntries(PRICE_MARKETS.map((market) => [market, { newest: null, oldest: null }]))
  for (const row of rows) {
    const entry = dates[row.market]
    if (!entry || row.base_market_value == null) continue
    const date = String(row.price_as_of ?? row.as_of_date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (entry.newest == null || date > entry.newest) entry.newest = date
    if (entry.oldest == null || date < entry.oldest) entry.oldest = date
  }
  return dates
}
