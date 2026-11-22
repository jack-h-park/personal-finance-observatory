import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { strictIsoDate } from '../domain/assets/query-coverage'
import { object, text } from '../domain/assets/account-inventory/validation'
import { normalizeSnaptradeChaseBatch, readSpendingCsvRows, spendingDescriptionKey, type SpendingRow } from '../domain/spending-import'
import type { SnaptradeHold } from './spending-store'

type Activity = { row: number; postedDate: string; transactionDate: string; amountMinor: number; description: string }
type ProviderRow = Activity & { id: string }
type IssuerRow = Activity & { transactionType: string }
type Match = { issuer: IssuerRow; provider: ProviderRow; method: 'description' | 'unique_date_amount' }

const header = 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo'.split(',')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const providerId = (value: unknown): value is string =>
  text(value) && value.length <= 200 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value)
const decode = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes)

function cents(value: unknown) {
  const parts = (typeof value === 'number' || typeof value === 'string') && /^(-?)(\d{1,16})(?:\.(\d{1,2})0*)?$/.exec(String(value))
  if (!parts) throw new Error('invalid_chase_card_amount')
  const minor = Number(BigInt(parts[2]) * 100n + BigInt((parts[3] ?? '').padEnd(2, '0')))
  if (!Number.isSafeInteger(minor)) throw new Error('invalid_chase_card_amount')
  return parts[1] ? -minor : minor
}

function csvDate(value: string) {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  const date = parts && strictIsoDate(`${parts[3]}-${parts[1]}-${parts[2]}`)
  if (!date) throw new Error('invalid_chase_card_date')
  return date
}

function activityDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(value) ||
      !Number.isFinite(Date.parse(value))) throw new Error('invalid_snaptrade_date')
  const date = strictIsoDate(value.slice(0, 10))
  if (!date) throw new Error('invalid_snaptrade_date')
  return date
}

function readIssuer(bytes: Buffer): IssuerRow[] {
  const [columns = [], ...data] = readSpendingCsvRows(decode(bytes))
  if (columns.length !== header.length || new Set(columns).size !== header.length ||
      header.some(column => !columns.includes(column))) throw new Error('invalid_chase_card_header')
  const column = (name: string) => columns.indexOf(name)
  return data.map((cells, index) => {
    if (cells.length !== columns.length) throw new Error('invalid_chase_card_width')
    const postedDate = csvDate(cells[column('Post Date')])
    const transactionDate = csvDate(cells[column('Transaction Date')])
    if (transactionDate > postedDate) throw new Error('invalid_chase_card_date')
    return { row: index + 1, postedDate, transactionDate, description: cells[column('Description')].trim(),
      amountMinor: cents(cells[column('Amount')]), transactionType: cells[column('Type')].trim() }
  })
}

function readSnapshot(value: unknown, providerAccountId: string, maskedSuffix: string): ProviderRow[] {
  if (!object(value) || !object(value.account) || !object(value.pagination) || !Array.isArray(value.data) ||
      typeof value.fetchedAt !== 'string' || !Number.isFinite(Date.parse(value.fetchedAt)) ||
      value.pagination.offset !== 0 || value.pagination.total !== value.data.length ||
      !Number.isSafeInteger(value.pagination.limit) || Number(value.pagination.limit) < value.data.length) {
    throw new Error('invalid_snaptrade_card_snapshot')
  }
  if (value.account.rawType !== 'CREDITCARD' || value.account.id !== providerAccountId ||
      value.account.maskedSuffix !== maskedSuffix || !text(value.account.product)) {
    throw new Error('snaptrade_account_mismatch')
  }
  const seen = new Set<string>()
  return value.data.map((item, index) => {
    if (!object(item) || !providerId(item.id) || seen.has(item.id) || typeof item.description !== 'string' ||
        item.type !== 'CREDIT_TRANSACTION' || (object(item.currency) ? item.currency.code : item.currency) !== 'USD') {
      throw new Error('invalid_snaptrade_card_activity')
    }
    seen.add(item.id)
    return { row: index + 1, id: item.id, postedDate: activityDate(item.settlement_date),
      transactionDate: activityDate(item.trade_date), amountMinor: cents(item.amount), description: item.description }
  })
}

function group<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const id = key(row)
    const list = groups.get(id) ?? []
    list.push(row)
    groups.set(id, list)
  }
  return groups
}

function matchRows(issuer: IssuerRow[], provider: ProviderRow[]) {
  const economics = (row: Activity) => JSON.stringify([row.postedDate, row.amountMinor])
  const described = (row: Activity) => JSON.stringify([economics(row), spendingDescriptionKey(row.description)])
  const providerByDescription = group(provider, described)
  const matches: Match[] = []
  const usedIssuer = new Set<number>()
  const usedProvider = new Set<number>()
  const match = (issuerRow: IssuerRow, providerRow: ProviderRow, method: Match['method']) => {
    matches.push({ issuer: issuerRow, provider: providerRow, method })
    usedIssuer.add(issuerRow.row)
    usedProvider.add(providerRow.row)
  }
  for (const [key, rows] of group(issuer, described)) {
    const candidates = providerByDescription.get(key) ?? []
    if (rows.length === 1 && candidates.length === 1) {
      match(rows[0], candidates[0], 'description')
      continue
    }
    // Resolve collisions by issuer purchase date before considering equal rows.
    const dates = group(rows, row => row.transactionDate)
    const providerDates = group(candidates, row => row.transactionDate)
    for (const [date, issuerDate] of dates) {
      const providerDate = providerDates.get(date) ?? []
      if (issuerDate.length === providerDate.length && new Set(issuerDate.map(row => row.transactionType)).size === 1) {
        providerDate.sort((a, b) => a.id.localeCompare(b.id))
        issuerDate.forEach((row, index) => match(row, providerDate[index], 'description'))
      }
    }
    const left = rows.filter(row => !usedIssuer.has(row.row))
    const right = candidates.filter(row => !usedProvider.has(row.row))
    if (left.length === 1 && right.length === 1) match(left[0], right[0], 'description')
  }
  const issuerGroups = group(issuer.filter(row => !usedIssuer.has(row.row)), economics)
  const providerGroups = group(provider.filter(row => !usedProvider.has(row.row)), economics)
  const held: SnaptradeHold[] = []
  for (const [key, rows] of issuerGroups) {
    const candidates = providerGroups.get(key) ?? []
    if (rows.length === 1 && candidates.length === 1) {
      match(rows[0], candidates[0], 'unique_date_amount')
    } else {
      for (const row of rows) held.push({ source: 'chase', row: row.row, reason: candidates.length ? 'ambiguous_match' : 'unmatched_chase_row' })
    }
  }
  for (const [key, rows] of providerGroups) {
    for (const row of rows) {
      if (!usedProvider.has(row.row)) {
        held.push({ source: 'snaptrade', row: row.row, reason: issuerGroups.has(key) ? 'ambiguous_match' : 'unmatched_snaptrade_row' })
      }
    }
  }
  return { matches: matches.sort((a, b) => a.provider.row - b.provider.row), held }
}

function classification(row: IssuerRow): SpendingRow['kind'] | undefined {
  const { transactionType: type, amountMinor: amount } = row
  const description = row.description.toUpperCase()
  if (type === 'Sale' && amount < 0) return 'purchase'
  if (type === 'Return' && amount > 0) return 'refund'
  if (type === 'Payment' && amount > 0) return 'card_payment'
  if (type === 'Fee' && amount < 0) return 'fee'
  if (type === 'Refund' && amount > 0 && description === 'ANNUAL FEE REFUND') return 'other'
  if (type === 'Adjustment' && (amount < 0 && description === 'CREDIT BALANCE REFUND' ||
      amount > 0 && (description.startsWith('OFFER:') ||
        /^(?:PAYYOURSELFBACK CREDIT|ANNUAL HOTEL CREDIT|RIDESHARE CREDIT \$\d+\/YEAR|UA INFLIGHT\/INCLUB CREDIT)$/.test(description)))) {
    return 'other'
  }
}

export function loadSnaptradeChaseSpending(options: {
  snapshot: string
  chaseCsv: string
  binding: string
  accountIds: Set<string>
}) {
  const binding: unknown = JSON.parse(fs.readFileSync(options.binding, 'utf8'))
  if (!object(binding) || Object.keys(binding).length !== 3 || !text(binding.accountId) ||
      !providerId(binding.providerAccountId) || typeof binding.maskedSuffix !== 'string' ||
      !/^\d{4}$/.test(binding.maskedSuffix)) throw new Error('invalid_snaptrade_binding')
  const { accountId, providerAccountId, maskedSuffix } = binding
  if (!options.accountIds.has(accountId)) throw new Error('unknown_account')
  const snapshotBytes = fs.readFileSync(options.snapshot)
  const issuerBytes = fs.readFileSync(options.chaseCsv)
  const provider = readSnapshot(JSON.parse(decode(snapshotBytes)), providerAccountId, maskedSuffix)
  const issuer = readIssuer(issuerBytes)
  const { matches, held } = matchRows(issuer, provider)
  const transactions = []
  const reviews = []
  for (const { issuer: row, provider: activity, method } of matches) {
    const validDescription = !!row.description && row.description.length <= 1000 && !row.description.includes('\0')
    const kind = validDescription ? classification(row) : undefined
    if (!kind) {
      held.push({ source: 'chase', row: row.row, reason: validDescription ? 'unclassified_issuer_type' : 'unsupported_chase_description' })
    } else {
      transactions.push({ accountId, postedDate: row.postedDate, transactionDate: row.transactionDate,
        description: row.description, kind, currency: 'USD', amountMinor: activity.amountMinor, sourceId: activity.id })
    }
    reviews.push({ snaptradeRow: activity.row, chaseRow: row.row, method, kind: kind ?? null })
  }
  const dates = [...provider, ...issuer].map(row => row.postedDate).sort()
  if (!dates.length) throw new Error('empty_snaptrade_chase_inputs')
  const batch = normalizeSnaptradeChaseBatch({ schemaVersion: 1, mode: 'offline', status: 'complete',
    source: 'offline-snaptrade-chase', periodStart: dates[0], periodEnd: dates.at(-1), transactions }, options.accountIds)
  const archive = (bytes: Buffer) => ({ sha256: sha(bytes), base64: bytes.toString('base64') })
  const bytes = Buffer.from(JSON.stringify({
    version: 1, binding, sources: { snaptrade: archive(snapshotBytes), chase: archive(issuerBytes) }, reviews, held,
  }))
  return { batch, bytes, format: 'json' as const, snaptrade: {
    accountId, providerAccountId, held,
    sourceRows: reviews.filter(review => review.kind !== null).map(review => review.snaptradeRow),
    fallbackMatches: reviews.filter(review => review.method === 'unique_date_amount')
      .map(({ snaptradeRow, chaseRow }) => ({ snaptradeRow, chaseRow })),
  } }
}
