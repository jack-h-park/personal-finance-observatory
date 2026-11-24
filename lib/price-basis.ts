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
