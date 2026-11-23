import type { FreshnessDetail, FreshnessItem } from '@/lib/adapters/portfolio-db'
import { fmtMomentShort } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { getUiCopy } from '@/lib/ui-copy'

/**
 * A freshness row's name. A snapshot row carries its key and its name is copy;
 * a source-drift row carries the file name, which is data and is returned as is.
 */
export function freshnessLabel(item: FreshnessItem, language: Language): string {
  const labels: Record<string, string> = getUiCopy(language).freshness.snapshotLabels
  return item.category === 'source' ? item.label : (labels[item.label] ?? item.label)
}

/**
 * When the quotes were struck: the newest quote time, and the oldest when it is
 * more than an hour behind (a market that closed earlier, or a stale ticker).
 */
function quotedText(detail: { quotedNewest?: string | null; quotedOldest?: string | null }, language: Language): string | null {
  if (!detail.quotedNewest) return null
  const newest = fmtMomentShort(detail.quotedNewest, language)
  const gap = detail.quotedOldest ? Date.parse(detail.quotedNewest) - Date.parse(detail.quotedOldest) : 0
  return gap > 60 * 60 * 1000 ? `${newest} (${fmtMomentShort(detail.quotedOldest, language)})` : newest
}

/** The sentence for a freshness row's detail code, in the reader's language. */
export function freshnessDetailText(detail: FreshnessDetail, language: Language): string {
  const sentences = getUiCopy(language).freshness.detail
  switch (detail.code) {
    case 'PRICE_SNAPSHOT':
      return sentences.PRICE_SNAPSHOT({ ...detail, quotedText: quotedText(detail, language) })
    case 'CRYPTO_SNAPSHOT':
      return sentences.CRYPTO_SNAPSHOT({ ...detail, quotedText: quotedText(detail, language) })
    case 'FX_RATE':
      return sentences.FX_RATE(detail)
    case 'SOURCE_CHANGED':
      return sentences.SOURCE_CHANGED(detail)
    case 'SNAPSHOT_PRICE_DATES':
      return sentences.SNAPSHOT_PRICE_DATES(detail)
    default:
      return sentences[detail.code]?.() ?? detail.code
  }
}
