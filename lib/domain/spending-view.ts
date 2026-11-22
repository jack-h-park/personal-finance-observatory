import type { Currency, SpendingRow } from './spending-import'

export type SpendingViewRow = {
  id: string
  accountId: string
  postedDate: string
  activityDate: string
  currency: Currency
  amountMinor: number
  kind: SpendingRow['kind']
  description: string
}

export type SpendingCoverage = {
  accountId: string
  currency: Currency
  first: string
  last: string
  count: number
}

export type SpendingHold = {
  accountId: string
  source: 'banksalad' | 'simplefin' | 'snaptrade' | 'chase' | 'samsung'
  row: number
  date: string | null
  currency: Currency | null
  amountMinor: number | null
  reason: string
}

export type SpendingSnapshot = {
  rows: SpendingViewRow[]
  coverage: SpendingCoverage[]
  holds: SpendingHold[]
  reviewIncomplete: boolean
}

export function summarizeSpendingAccounts(snapshot: Pick<SpendingSnapshot, 'coverage' | 'holds'>) {
  const counts = new Map<string, number>()
  for (const hold of snapshot.holds) {
    counts.set(hold.accountId, (counts.get(hold.accountId) ?? 0) + 1)
  }
  return snapshot.coverage.map(account => ({ ...account, heldCount: counts.get(account.accountId) ?? 0 }))
}

export function projectSpending(snapshot: SpendingSnapshot, filters: { month?: string; account?: string }) {
  const months = [...new Set(snapshot.rows.map(row => row.activityDate.slice(0, 7)))].sort().reverse()
  const month = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(filters.month ?? '') ? filters.month : undefined
  const account = snapshot.coverage.some(row => row.accountId === filters.account) ? filters.account : undefined
  const matches = (id: string, date: string | null) =>
    (!account || id === account) && (!month || date === null || date.startsWith(month + '-'))
  const rows = snapshot.rows.filter(row => matches(row.accountId, row.activityDate))
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate) || a.id.localeCompare(b.id))
  const totals = { USD: { purchase: 0, refund: 0, net: 0 }, KRW: { purchase: 0, refund: 0, net: 0 } }
  for (const row of rows) {
    const total = totals[row.currency]
    if (row.kind === 'purchase') total.purchase -= row.amountMinor
    if (row.kind === 'refund') total.refund += row.amountMinor
    total.net = total.purchase - total.refund
  }
  return {
    month, account, months, rows, totals,
    coverage: snapshot.coverage.filter(row => !account || row.accountId === account),
    holds: snapshot.holds.filter(row => matches(row.accountId, row.date)),
  }
}
