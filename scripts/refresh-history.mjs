// The steps a price-only run keeps, in the full run's order. Crypto prices are cheap and trade
// around the clock, so they ride along on every price run. Everything else in a full run (the
// statement extractors, Toss, the sheet publishes) changes only when a file is filed.
export const PRICE_ONLY_STEPS = new Set([
  'fetch:fx',
  'fetch:kr-prices',
  'fetch:gold-price',
  'fetch:us-prices',
  'fetch:crypto-prices',
  'ingest',
  'backfill:history',
])

/**
 * The last `limit` runs of each kind. A price-only run every half hour would push the full
 * runs out of a single shared list within a day, and /health reads those for the statement
 * and sheet steps. A record written before kinds existed is a full run.
 */
export function keepPerKind(runs, limit) {
  const seen = new Map()
  return runs.filter((item) => {
    const kind = item.kind === 'prices' ? 'prices' : 'full'
    const count = (seen.get(kind) ?? 0) + 1
    seen.set(kind, count)
    return count <= limit
  })
}
