/**
 * The dates the history backfill writes a snapshot for: every month-end from
 * the first lot on, plus every weekday of the last 365 days. The current date
 * is excluded because the ingest writes that row itself.
 */

function utcDate(value) {
  return new Date(`${value}T00:00:00Z`)
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function monthEnds(firstDate, lastDate) {
  const first = utcDate(firstDate)
  const last = utcDate(lastDate)
  const dates = []
  let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1))
  while (cursor <= last) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    if (monthEnd >= first && monthEnd < last) dates.push(isoDate(monthEnd))
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }
  return dates
}

function weekdaysInWindow(firstDate, currentDate) {
  const current = utcDate(currentDate)
  const first = utcDate(firstDate)
  const windowStart = new Date(current.getTime() - 365 * 86400000)
  const dates = []
  for (let cursor = windowStart > first ? windowStart : first; cursor < current; cursor = new Date(cursor.getTime() + 86400000)) {
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) dates.push(isoDate(cursor))
  }
  return dates
}

/** Sorted, unique YYYY-MM-DD dates strictly before currentDate. */
export function snapshotDates(firstDate, currentDate) {
  return [...new Set([...monthEnds(firstDate, currentDate), ...weekdaysInWindow(firstDate, currentDate)])].sort()
}
