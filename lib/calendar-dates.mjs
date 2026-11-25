export const LONG_HOLDINGS_PERIOD_MONTHS = Object.freeze({ '2y': 24, '3y': 36 })

/** Step back whole months, clamping to the last day of the target month.
 * @param {string} date ISO calendar date
 * @param {number} months
 */
export function monthsBack(date, months) {
  const [year, month, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

/** @param {string} date ISO calendar date */
export function isCalendarMonthEnd(date) {
  const [year, month, day] = date.split('-').map(Number)
  return day === new Date(Date.UTC(year, month, 0)).getUTCDate()
}


/** @param {string} date ISO calendar date */
export function previousMonthEnd(date) {
  const [year, month] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10)
}

/** @param {string} asOf Latest portfolio snapshot date */
export function longHoldingsReferenceDates(asOf) {
  return [...new Set(Object.values(LONG_HOLDINGS_PERIOD_MONTHS).flatMap((months) => {
    const reference = monthsBack(asOf, months)
    return [reference, previousMonthEnd(reference)]
  }))].sort()
}
