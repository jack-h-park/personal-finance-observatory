import type { InvestmentPoint } from '@/lib/total-assets-change'

/**
 * What changed in total assets in a month that stocks and crypto did not earn.
 *
 * It is the month's change in total assets, leaving out pensions, minus the
 * month's investment result (the change in unrealized gain plus the gain
 * realized from sales). Pensions are left out because their records are sparse,
 * so a month that gains a record would read as a large move. What remains is
 * mostly savings and spending, plus transfers: a month's salary less what was
 * spent, usually a few million won. It is not spending, and the label says so.
 *
 * A large value is a prompt to look, not a verdict. The two shapes worth the
 * look are a pair (one month up, the next down by about the same, the signature
 * of money that sat in no account at a month-end) and a streak (the same sign
 * for several months, the signature of an account or a large spend missing).
 */

/** The sizes at which a month is worth a look; the reader changes them on /net-worth/settings. */
export type Thresholds = {
  /** A month at or above this is flagged on its own. */
  checkKrw: number
  /** A month at or above this counts toward a pair or a streak. */
  watchKrw: number
  /** Months of one sign, each at the watch size, that make a streak. */
  streakMonths: number
  /** Two neighbours pair when what remains after they cancel is at most this share of the larger. */
  pairNetShare: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { checkKrw: 30_000_000, watchKrw: 15_000_000, streakMonths: 3, pairNetShare: 0.35 }

export type MonthEnd = { month: string; date: string; total: number; pensions: number | null }
export type NonInvestmentFlag = 'pair' | 'streak' | 'check'
export type NonInvestmentMonth = {
  month: string
  /** Null when the month or the one before has no investment figure: unavailable, not zero. */
  value: number | null
  flag: NonInvestmentFlag | null
  /** For a pair, the other month and its value. */
  partner: { month: string; value: number } | null
}

/** The investment result between two dates, each snapped to the latest snapshot on or before it. */
function investmentBetween(points: readonly InvestmentPoint[], from: string, to: string): number | null {
  let base: InvestmentPoint | undefined
  let end: InvestmentPoint | undefined
  for (const point of points) {
    if (point.date <= from) base = point
    if (point.date <= to) end = point
  }
  if (!base || !end || base.date >= end.date || base.unrealized == null || end.unrealized == null) return null
  return end.unrealized - base.unrealized + ((end.realized ?? 0) - (base.realized ?? 0))
}

/** Oldest month first, as given. The first month has no month before it, so it has no value. */
export function nonInvestmentMonths(
  months: readonly MonthEnd[],
  investment: readonly InvestmentPoint[],
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): NonInvestmentMonth[] {
  const values = months.map((current, index) => {
    if (!index) return null
    const previous = months[index - 1]
    const result = investmentBetween(investment, previous.date, current.date)
    if (result == null) return null
    const change = current.total - (current.pensions ?? 0) - (previous.total - (previous.pensions ?? 0))
    return change - result
  })
  const watched = values.map((value) => value != null && Math.abs(value) >= thresholds.watchKrw)
  const out: NonInvestmentMonth[] = months.map((month, index) => ({ month: month.month, value: values[index], flag: null, partner: null }))

  // Streaks first, then pairs on top: a pair is the sharper reading of the same months.
  let run = 0
  for (let index = 0; index <= values.length; index++) {
    const sign = index < values.length && watched[index] ? Math.sign(values[index] as number) : 0
    const continues = run > 0 && sign !== 0 && sign === Math.sign(values[index - 1] as number) && watched[index - 1]
    if (continues) {
      run += 1
      continue
    }
    if (run >= thresholds.streakMonths) for (let k = index - run; k < index; k++) out[k].flag = 'streak'
    run = sign !== 0 ? 1 : 0
  }
  for (let index = 1; index < values.length; index++) {
    const a = values[index - 1]
    const b = values[index]
    if (a == null || b == null || !watched[index - 1] || !watched[index]) continue
    if (Math.sign(a) === Math.sign(b) || Math.abs(a + b) > thresholds.pairNetShare * Math.max(Math.abs(a), Math.abs(b))) continue
    out[index - 1].flag = 'pair'
    out[index - 1].partner = { month: out[index].month, value: b }
    out[index].flag = 'pair'
    out[index].partner = { month: out[index - 1].month, value: a }
  }
  for (const [index, month] of out.entries()) {
    if (!month.flag && values[index] != null && Math.abs(values[index] as number) >= thresholds.checkKrw) month.flag = 'check'
  }
  return out
}

/** Flagged months among the latest `last` months. */
export function flaggedMonths(months: readonly NonInvestmentMonth[], last: number): NonInvestmentMonth[] {
  return months.slice(-last).filter((month) => month.flag)
}
