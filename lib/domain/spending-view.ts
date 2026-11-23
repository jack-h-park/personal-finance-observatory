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
export type SpendingFxRate = { date: string; rate: number; source: string }

export function spendingRateOn(rates: ReadonlyMap<string, SpendingFxRate>, date: string) {
  const day = new Date(date + 'T00:00:00Z')
  if (!Number.isFinite(day.valueOf())) return undefined
  for (let elapsed = 0; elapsed <= 7; elapsed++) {
    const quote = rates.get(day.toISOString().slice(0, 10))
    if (quote && Number.isFinite(quote.rate) && quote.rate > 0) return quote
    day.setUTCDate(day.getUTCDate() - 1)
  }
}

export function spendingInKrw(row: SpendingViewRow, rates: ReadonlyMap<string, SpendingFxRate>) {
  if (row.currency === 'KRW') return { amount: row.amountMinor, quote: undefined }
  const quote = spendingRateOn(rates, row.postedDate)
  return { amount: quote ? Math.sign(row.amountMinor) * Math.round(Math.abs(row.amountMinor) * quote.rate / 100) : null, quote }
}

export function spendingMerchantKey(description: string) {
  return description.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

function rank(groups: Map<string, SpendingRank>) {
  return [...groups.values()].sort((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name))
}

function summarizePurchases(purchases: SpendingViewRow[], value = (row: SpendingViewRow) => row.amountMinor) {
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
    const amount = -value(row)
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
  const largest = purchases.sort((a, b) => value(a) - value(b) ||
    b.activityDate.localeCompare(a.activityDate) || a.id.localeCompare(b.id))
  return { categories: rank(categories), merchants: rank(merchants), largest, uncategorized, categorySources }
}

export function analyzeSpending(rows: SpendingViewRow[], options: {
  today: string; period: SpendingPeriod; account?: string; rates?: ReadonlyMap<string, SpendingFxRate>
}) {
  const [year, month] = options.today.split('-').map(Number)
  const months = Array.from({ length: options.period }, (_, index) => ({
    month: new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7),
    USD: null as number | null,
    KRW: null as number | null,
  }))
  const byMonth = new Map(months.map(item => [item.month, item]))
  const purchases: Record<Currency, SpendingViewRow[]> = { USD: [], KRW: [] }
  const combined = new Map(months.map(item => [item.month, { month: item.month, amount: null as number | null, missingFx: 0 }]))
  const purchaseKrw = new Map<string, number>()
  const convertedPurchases: SpendingViewRow[] = []
  const rates = options.rates ?? new Map()
  for (const row of rows) {
    if ((options.account && options.account !== row.accountId) || row.activityDate > options.today) continue
    if (row.kind !== 'purchase' && row.kind !== 'refund') continue
    const bucket = byMonth.get(row.activityDate.slice(0, 7))
    if (!bucket) continue
    bucket[row.currency] = (bucket[row.currency] ?? 0) - row.amountMinor
    if (row.kind === 'purchase') purchases[row.currency].push(row)
    const combinedMonth = combined.get(bucket.month)!
    const { amount } = spendingInKrw(row, rates)
    if (amount === null) {
      combinedMonth.missingFx++
      continue
    }
    combinedMonth.amount = (combinedMonth.amount ?? 0) - amount
    if (row.kind === 'purchase') {
      purchaseKrw.set(row.id, amount)
      convertedPurchases.push(row)
    }
  }
  const totals = (currency: Currency) => {
    const values = months.flatMap(row => row[currency] ?? [])
    return { net: values.length ? values.reduce((total, value) => total + value, 0) : null, observedMonths: values.length }
  }
  const combinedMonths = [...combined.values()]
  const coveredMonths = combinedMonths.flatMap(item => item.amount ?? [])
  return {
    months, firstDay: months[months.length - 1].month + '-01',
    totals: { USD: totals('USD'), KRW: totals('KRW') },
    USD: summarizePurchases(purchases.USD), KRW: summarizePurchases(purchases.KRW),
    combined: {
      months: combinedMonths,
      net: coveredMonths.length ? coveredMonths.reduce((total, amount) => total + amount, 0) : null,
      observedMonths: combinedMonths.filter(item => item.amount !== null || item.missingFx).length,
      missingFx: combinedMonths.reduce((count, item) => count + item.missingFx, 0),
      purchaseKrw,
      ...summarizePurchases(convertedPurchases, row => purchaseKrw.get(row.id)!),
    },
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
