// Snapshots are stored for every weekday of the last year plus every month-end.
// Only the /holdings charts plot that density; every other reader wants one date
// per month, so these helpers pick the dates each view plots.

/** Ranges up to this many days plot every stored date (a leap year). */
const DAILY_RANGE_DAYS = 366

const sortedUnique = (dates: readonly string[]) => [...new Set(dates)].sort()

/** Sorted unique dates, keeping the last date of each YYYY-MM. */
export function lastPerMonth(dates: readonly string[]): string[] {
  const lastOfMonth = new Map<string, string>()
  // Ascending order means the final write for a month is its latest date.
  for (const date of sortedUnique(dates)) lastOfMonth.set(date.slice(0, 7), date)
  return [...lastOfMonth.values()]
}

/**
 * The dates a /holdings chart plots: every stored date for a range of
 * DAILY_RANGE_DAYS or fewer, otherwise each month's last date plus every date in
 * the newest month.
 */
export function holdingsChartDates(dates: readonly string[], rangeDays: number): string[] {
  const all = sortedUnique(dates)
  if (rangeDays <= DAILY_RANGE_DAYS || all.length === 0) return all
  const newestMonth = all[all.length - 1].slice(0, 7)
  const keep = new Set(lastPerMonth(all))
  for (const date of all) if (date.startsWith(newestMonth)) keep.add(date)
  return all.filter((date) => keep.has(date))
}
