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

/**
 * The provider names behind a set of price files, once each. A file's `source`
 * can name several ("Bithumb public ticker API (KRW venues), Yahoo Finance chart
 * API (USD venues)"), so it is split on commas and the venue qualifiers dropped.
 */
export function priceSourceNames(sources: (string | null | undefined)[]): string[] {
  const names = sources.flatMap((source) =>
    (source ?? '')
      .split(',')
      .map((part) => part.replace(/\s*\([^)]*\)\s*$/, '').trim())
      .filter(Boolean)
  )
  return [...new Set(names)]
}

/** True when the markets behind a figure are priced on different dates, so no single date describes it. */
export function pricesDifferByDate(dates: SnapshotPriceDate[]): boolean {
  return new Set(dates.map((item) => item.newest)).size > 1 || dates.some((item) => item.oldest != null)
}
