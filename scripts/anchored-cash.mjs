// anchored-cash.mjs — a brokerage account's uninvested cash, day by day, from
// balances the broker printed (anchors) and the cash each transaction moved.
//
// Robinhood is the case this was written for, and the comments below are its.
// Chase and Merrill use the same series with their holdings exports as the
// anchors (see "Sweep cash at Chase and Merrill" in the ingest).
//
// For Robinhood, two sources print the balance itself:
//
//   - the monthly account statement (extract-us-pdf-evidence.py), at each
//     month-end: "Brokerage Cash Balance" plus "Deposit Sweep Balance". It is
//     kept on SETTLEMENT dates: a buy on the month's last Friday is not in that
//     month's closing cash.
//   - the MCP snapshot (`portfolio.cash`, written by stock-trading-skills'
//     robinhood_snapshot.py), at the hour it was pulled, on TRADE dates.
//
// Every statement is an anchor, and the days after it are derived FORWARD from
// it, never backward from a later figure, by adding the cash each transaction
// moved: the transaction rows' `native_amount` (a buy negative; a sale,
// dividend, interest or deposit positive; an internal transfer either way),
// the orders bridge's fills, and the linked crypto account's purchases and
// sales. The next statement, or the snapshot for today, replaces the derived
// figure on its own day.
//
// Forward, because those rows are not every movement of the cash. The CSV export
// leaves out transfers from Robinhood checking, and the checking export does not
// say which brokerage account received them; anything after the newest CSV that
// is not an order (a deposit, a dividend) is also missing. Derived backward from
// a later balance, each missing inflow would raise every earlier day, and since
// the checking balance already fell on the transfer date, the past would count
// the money twice. Derived forward, a missing inflow appears once, on the next
// anchor's day, as the money it is, and the gap is reported (`residual`).
//
// Before the first statement nothing is written: an unknown balance is not zero,
// and a guessed one moves the past.

const cents = (value) => Math.round(value * 100) / 100
const dayAfter = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/**
 * statements: [{ date, balance }]  the printed balances (Robinhood: month-end
 *             statements, settled basis; Chase/Merrill: holdings exports).
 * snapshot:   { date, balance } | null  today's cash, trade basis.
 * flows:      [{ date, settle, amount }]  trade date, settlement date, signed USD.
 *
 * Returns
 *   points:   [{ date, balance, source }] ascending; source is 'anchor',
 *             'derived' or 'snapshot'. A reader carries each point forward.
 *   segments: one per anchor: { from, to, toSource, derived, actual, residual }.
 *             `derived` is the anchor plus every flow up to the next anchor,
 *             `actual` that anchor's own figure, `residual` the cash the rows
 *             did not explain (null for an open segment with no next anchor).
 *   negative: the derived points below zero.
 */
export function anchoredCashSeries({ statements, snapshot, flows }) {
  const byDate = new Map()
  for (const s of statements) if (s.date && Number.isFinite(s.balance)) byDate.set(s.date, s.balance)
  const anchors = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, balance]) => ({ date, balance }))
  if (!anchors.length) return { points: [], segments: [], negative: [] }
  const today = snapshot && Number.isFinite(snapshot.balance) && snapshot.date > anchors.at(-1).date ? snapshot : null

  const usable = flows.filter((f) => f.date && Number.isFinite(f.amount) && f.amount !== 0)
  const points = []
  const segments = []
  anchors.forEach((start, index) => {
    const next = anchors[index + 1] ?? today
    const toSource = anchors[index + 1] ? 'anchor' : today ? 'snapshot' : null
    points.push({ date: start.date, balance: cents(start.balance), source: 'anchor' })
    // A flow belongs after `start` once it settles after it. It belongs before
    // the next statement if it settled by then; before the snapshot if it
    // traded by then, because the broker's live cash already reflects it.
    const inSegment = usable.filter((f) => {
      if ((f.settle || f.date) <= start.date) return false
      if (!next) return true
      return toSource === 'anchor' ? (f.settle || f.date) <= next.date : f.date <= next.date
    })
    const moved = new Map()
    for (const f of inSegment) {
      // A trade from before the anchor that settled after it moves the cash the day after.
      const on = f.date > start.date ? f.date : dayAfter(start.date)
      moved.set(on, (moved.get(on) ?? 0) + f.amount)
    }
    let running = start.balance
    for (const date of [...moved.keys()].sort()) {
      running += moved.get(date)
      if (!next || date < next.date) points.push({ date, balance: cents(running), source: 'derived' })
    }
    segments.push({
      from: start.date,
      to: next?.date ?? null,
      toSource,
      derived: cents(running),
      actual: next ? cents(next.balance) : null,
      residual: next ? cents(next.balance - running) : null,
    })
  })
  if (today) points.push({ date: today.date, balance: cents(today.balance), source: 'snapshot' })
  return { points, segments, negative: points.filter((p) => p.source === 'derived' && p.balance < 0) }
}

/** The next weekday: when a fill with no printed settlement date settles (T+1). Holidays are not modelled. */
export function nextBusinessDay(date) {
  let day = dayAfter(date)
  while ([0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) day = dayAfter(day)
  return day
}
