// Canonical source: workspace-governance/docs/ux/kit/react/format.ts
export const EMPTY_VALUE = '—'

export function formatUsdAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return EMPTY_VALUE
  const body = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 && body !== '0.00' ? '-' : ''}$${body}`
}

/** Parse ISO and SQLite timestamps, treating zone-less server times as UTC. */
export function parseTimestamp(value: string): Date {
  const iso = value.trim()
  const zonelessDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
  return new Date(zonelessDateTime.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso)
}

export function formatByteSize(
  bytes: number | null | undefined,
  {
    maximumUnit = 'GB',
    wholeKilobytesFrom,
    locale,
  }: {
    maximumUnit?: 'MB' | 'GB'
    wholeKilobytesFrom?: number
    locale?: 'ko-KR' | 'en-US'
  } = {},
): string {
  if (bytes == null || !Number.isFinite(bytes)) return EMPTY_VALUE

  const format = (value: number, digits: number) => locale
    ? value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : value.toFixed(digits)

  if (maximumUnit === 'GB' && bytes >= 1024 ** 3) return `${format(bytes / 1024 ** 3, 1)} GB`
  if (bytes >= 1024 ** 2) return `${format(bytes / 1024 ** 2, 1)} MB`
  if (bytes >= 1024) {
    const kilobytes = bytes / 1024
    const digits = wholeKilobytesFrom !== undefined && kilobytes >= wholeKilobytesFrom ? 0 : 1
    return `${format(kilobytes, digits)} KB`
  }
  return `${locale ? format(bytes, 0) : bytes} B`
}

/** Media position in minutes and seconds, with optional hours. */
export function formatMediaTime(seconds: number, { showHours = false } = {}): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const tail = String(total % 60).padStart(2, '0')
  if (!showHours || minutes < 60) return `${minutes}:${tail}`
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`
}
