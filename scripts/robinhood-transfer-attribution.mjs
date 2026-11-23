// A transfer from Robinhood checking or savings to a brokerage account, attributed by hand.
//
// The monthly statement names the account that received each transfer, but a statement
// only exists after the month closes, the CSV export leaves these transfers out and the
// bank export does not say where they went. Until the statement is filed, the owner can
// record where a transfer went in manual-mappings.json:
//
//   "robinhoodBankTransfers": [
//     { "date": "2026-11-11", "amountUsd": 5000, "account": "9965", "note": "..." }
//   ]
//
// `account` is the last four digits of the brokerage account. A statement that prints the
// same transfer wins: an entry is dropped when a statement transfer for the same account
// has the same amount within three days, so filing the statement never counts it twice.

const DAY = 86_400_000
const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY)

/**
 * entries:   the manual-mappings `robinhoodBankTransfers` array.
 * statement: Map<last4, [{ date, amount }]>  transfers a statement printed (signed, in positive).
 * Returns { flows: Map<last4, [{ date, settle, amount }]>, dropped: [entry], invalid: [string] }.
 */
export function manualBankTransferFlows(entries, statement = new Map()) {
  const flows = new Map()
  const dropped = []
  const invalid = []
  const used = new Map()
  const list = Array.isArray(entries) ? entries : []
  list.forEach((entry, index) => {
    const label = `robinhoodBankTransfers[${index}]`
    const date = typeof entry?.date === 'string' ? entry.date : ''
    const amount = Number(entry?.amountUsd)
    const account = typeof entry?.account === 'string' ? entry.account.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return invalid.push(`${label}: date must be YYYY-MM-DD`)
    if (!Number.isFinite(amount) || amount === 0) return invalid.push(`${label}: amountUsd must be a non-zero number`)
    if (!/^\d{4}$/.test(account)) return invalid.push(`${label}: account must be the last four digits`)
    // One statement transfer covers one entry, so two equal transfers on a day need two statement lines.
    const printed = statement.get(account) ?? []
    const taken = used.get(account) ?? new Set()
    const match = printed.findIndex(
      (p, i) => !taken.has(i) && Math.abs(p.amount - amount) < 0.005 && Math.abs(dayNumber(p.date) - dayNumber(date)) <= 3
    )
    if (match >= 0) {
      taken.add(match)
      used.set(account, taken)
      return dropped.push(entry)
    }
    const moved = flows.get(account) ?? []
    moved.push({ date, settle: date, amount })
    flows.set(account, moved)
  })
  return { flows, dropped, invalid }
}
