import type { Currency, SpendingRow } from './spending-import'

export type SpendingCategorySource = 'issuer' | 'notion' | 'banksalad'

export type SpendingViewRow = {
  id: string
  accountId: string
  postedDate: string
  activityDate: string
  currency: Currency
  amountMinor: number
  kind: SpendingRow['kind']
  description: string
  merchantLabel?: string
  category?: string
  categorySource?: SpendingCategorySource
}

export type SpendingPeriod = 12 | 24
export type SpendingRank = { name: string; amountMinor: number; count: number }

export function spendingMerchantKey(description: string) {
  return description.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

function rank(groups: Map<string, SpendingRank>) {
  return [...groups.values()].sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name))
}

function summarizePurchases(purchases: SpendingViewRow[]) {
  const categories = new Map<string, SpendingRank>()
  const merchants = new Map<string, SpendingRank>()
  const uncategorized = { amountMinor: 0, count: 0 }
  const categorySources = { issuer: 0, notion: 0, banksalad: 0 }
  const add = (groups: Map<string, SpendingRank>, key: string, name: string, amountMinor: number) => {
    const summary = groups.get(key) ?? { name, amountMinor: 0, count: 0 }
    summary.amountMinor += amountMinor
    summary.count++
    groups.set(key, summary)
  }
  for (const row of purchases) {
    const amount = -row.amountMinor
    const merchant = row.merchantLabel ?? row.description
    add(merchants, spendingMerchantKey(merchant), merchant, amount)
    if (row.category && row.categorySource) {
      add(categories, row.category, row.category, amount)
      categorySources[row.categorySource]++
    } else {
      uncategorized.amountMinor += amount
      uncategorized.count++
    }
  }
  const largest = purchases.sort((a, b) => a.amountMinor - b.amountMinor ||
    b.activityDate.localeCompare(a.activityDate) || a.id.localeCompare(b.id))
  return { categories: rank(categories), merchants: rank(merchants), largest, uncategorized, categorySources }
}

export function analyzeSpending(rows: SpendingViewRow[], options: { today: string; period: SpendingPeriod; account?: string }) {
  const [year, month] = options.today.split('-').map(Number)
  const months = Array.from({ length: options.period }, (_, index) => ({
    month: new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7),
    USD: null as number | null,
    KRW: null as number | null,
  }))
  const byMonth = new Map(months.map(item => [item.month, item]))
  const purchases: Record<Currency, SpendingViewRow[]> = { USD: [], KRW: [] }
  for (const row of rows) {
    if ((options.account && options.account !== row.accountId) || row.activityDate > options.today) continue
    if (row.kind !== 'purchase' && row.kind !== 'refund') continue
    const bucket = byMonth.get(row.activityDate.slice(0, 7))
    if (!bucket) continue
    bucket[row.currency] = (bucket[row.currency] ?? 0) - row.amountMinor
    if (row.kind === 'purchase') purchases[row.currency].push(row)
  }
  const totals = (currency: Currency) => {
    const values = months.flatMap(row => row[currency] ?? [])
    return { net: values.length ? values.reduce((total, value) => total + value, 0) : null, observedMonths: values.length }
  }
  return {
    months, firstDay: months[months.length - 1].month + '-01',
    totals: { USD: totals('USD'), KRW: totals('KRW') },
    USD: summarizePurchases(purchases.USD), KRW: summarizePurchases(purchases.KRW),
  }
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
