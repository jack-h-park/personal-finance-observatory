import type { SnapshotPriceDate } from '@/lib/overview-trend'

/**
 * The dates behind a valuation, as one line: `Korea 2026-11-23 (oldest 2026-11-22) · US 2026-11-20`.
 * A figure that mixes markets is only as current as its oldest market, and the
 * markets close on different days, so the line names each one.
 */
export function formatPriceBasis(
  dates: SnapshotPriceDate[],
  labels: { market: Record<SnapshotPriceDate['market'], string>; oldest: (date: string) => string }
): string {
  return dates
    .map((item) => `${labels.market[item.market]} ${item.newest}${item.oldest ? ` (${labels.oldest(item.oldest)})` : ''}`)
    .join(' · ')
}

/** True when the markets behind a figure are priced on different dates, so no single date describes it. */
export function pricesDifferByDate(dates: SnapshotPriceDate[]): boolean {
  return new Set(dates.map((item) => item.newest)).size > 1 || dates.some((item) => item.oldest != null)
}
