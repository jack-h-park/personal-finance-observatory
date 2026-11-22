// Own money that passes through a household member's account on its way back.
//
// A transfer into a spouse's account leaves every account the pipeline holds, and the
// same dollars return days later through the Hana USD account. Between the two the
// money is in no balance, so a month-end that falls inside the round trip reads as a
// loss of that amount, and the month the dollars come back reads as an equal gain.
//
// The account itself is not in the data, so its balance is rebuilt from the two ends
// the pipeline does see. Money sent in is either declared (`moves`: a withdrawal whose
// destination no tracked account shows, confirmed by the owner) or visible on the Hana
// ledger as a transfer to the holder; money coming back is the Hana ledger's transfers
// from the holder. A balance never goes below zero: anything the holder sends beyond
// what was sent there is money entering, and counts as it always did.
//
// events: [{ date, time, direction, usd_amount, note }]  the Hana USD ledger
// moves:  [{ date, usdAmount }]                          declared sends into the account
// match:  [string]                                       text in an event's note naming the holder
// Returns [{ date, balance }] ascending, the account's closing balance on each day it changed.

const cents = (value) => Math.round(value * 100) / 100

/** @param {{ events?: any[], moves?: any[], match?: string[] }} input */
export function householdTransitSeries({ events = [], moves = [], match = [] }) {
  const needles = match.map((m) => String(m).trim()).filter(Boolean)
  if (!needles.length && !moves.length) return []
  const deltas = []
  for (const move of moves) {
    const amount = Number(move.usdAmount)
    if (move.date && Number.isFinite(amount) && amount > 0) deltas.push({ date: move.date, time: '', order: 0, delta: amount })
  }
  for (const event of events) {
    const note = String(event.note ?? '')
    const amount = Number(event.usd_amount)
    if (!event.date || !Number.isFinite(amount) || amount <= 0 || !needles.some((n) => note.includes(n))) continue
    if (event.direction !== 'IN' && event.direction !== 'OUT') continue
    // Money Hana sent to the holder is money sent in; money the holder sent to Hana is money back.
    deltas.push({ date: event.date, time: String(event.time ?? ''), order: 1, delta: event.direction === 'OUT' ? amount : -amount })
  }
  deltas.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.time.localeCompare(b.time))
  const closing = new Map()
  let balance = 0
  for (const { date, delta } of deltas) {
    balance = Math.max(0, cents(balance + delta))
    closing.set(date, balance)
  }
  const points = []
  let last = 0
  for (const [date, value] of closing) {
    if (value !== last) points.push({ date, balance: value })
    last = value
  }
  return points
}
