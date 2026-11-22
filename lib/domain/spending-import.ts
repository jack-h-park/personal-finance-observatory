import { strictIsoDate } from './assets/query-coverage'
import { object, validateInventoryMap } from './assets/account-inventory/validation'

const kinds = ['purchase', 'refund', 'card_payment', 'own_transfer', 'fee', 'other'] as const
type Kind = typeof kinds[number]
export type Currency = 'USD' | 'KRW'
export type SpendingRow = {
  accountId: string
  postedDate: string
  transactionDate: string | null
  description: string
  amountMinor: number
  currency: Currency
  kind: Kind
  sourceId: string | null
  originalAmountMinor: number | null
  originalCurrency: Currency | null
  relatedSourceId: string | null
  transferRef: string | null
}
export type SpendingBatch = {
  schemaVersion: 1
  source: string
  periodStart: string
  periodEnd: string
  transactions: SpendingRow[]
}

const required = ['accountId', 'postedDate', 'description', 'amountMinor', 'currency', 'kind']
const optional = ['transactionDate', 'sourceId', 'originalAmountMinor', 'originalCurrency', 'relatedSourceId', 'transferRef']
const currency = (value: unknown): value is Currency => value === 'USD' || value === 'KRW'
const money = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value !== 0
const ref = (value: unknown): value is string => typeof value === 'string' && value.length <= 200 && value.trim() === value && !!value && !/[\x00-\x1f\x7f]/.test(value)

export const spendingDescriptionKey = (value: string) =>
  value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function spendingAccountIds(value: unknown) {
  const inventory = validateInventoryMap({ state: 'available', value })
  if (inventory.state !== 'available') throw new Error('invalid_inventory')
  const primary = new Set<string>()
  const invalid = new Set<string>()
  for (const { metadata, issues } of inventory.registrations) {
    if (metadata?.role !== 'primary') continue
    if (primary.has(metadata.accountId) || issues.length || metadata.owner.state !== 'confirmed') invalid.add(metadata.accountId)
    primary.add(metadata.accountId)
  }
  for (const id of invalid) primary.delete(id)
  return primary
}

function normalizeRow(value: unknown, batch: Omit<SpendingBatch, 'transactions'>, accountIds: Set<string>): SpendingRow {
  if (!object(value) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('invalid_row')
  const { accountId, description, amountMinor, kind, currency: unit, originalCurrency, originalAmountMinor,
    sourceId, relatedSourceId, transferRef } = value
  if (typeof accountId !== 'string' || !accountIds.has(accountId)) throw new Error('unknown_account')
  const postedDate = strictIsoDate(value.postedDate)
  const transactionDate = strictIsoDate(value.transactionDate)
  if (!postedDate || postedDate < batch.periodStart || postedDate > batch.periodEnd ||
    (value.transactionDate != null && (!transactionDate || transactionDate > postedDate))) throw new Error('invalid_dates')
  if (typeof description !== 'string' || !description.trim() || description.length > 1000 || description.includes('\0') ||
    !money(amountMinor) || !currency(unit) || !kinds.some(item => item === kind)) throw new Error('invalid_row')
  if ((kind === 'purchase' || kind === 'fee') && amountMinor > 0 || kind === 'refund' && amountMinor < 0) throw new Error('invalid_sign')
  if ((originalCurrency != null || originalAmountMinor != null) &&
    (!currency(originalCurrency) || !money(originalAmountMinor) || Math.sign(originalAmountMinor) !== Math.sign(amountMinor))) {
    throw new Error('invalid_original_amount')
  }
  if ((sourceId != null && !ref(sourceId)) ||
    (relatedSourceId != null && (!ref(relatedSourceId) || kind !== 'refund' || relatedSourceId === sourceId)) ||
    (transferRef != null && (!ref(transferRef) || kind !== 'own_transfer' && kind !== 'card_payment'))) {
    throw new Error('invalid_reference')
  }
  return { accountId, postedDate, transactionDate, description, amountMinor, currency: unit, kind: kind as Kind,
    sourceId: sourceId ?? null, originalAmountMinor: originalAmountMinor as number | null ?? null,
    originalCurrency: originalCurrency as Currency | null ?? null, relatedSourceId: relatedSourceId ?? null,
    transferRef: transferRef ?? null }
}

function normalizeBatch(value: unknown, accountIds: Set<string>, offlineSource?: 'offline-samsung' | 'offline-simplefin-chase' | 'offline-snaptrade-chase'): SpendingBatch {
  if (!object(value) || Object.keys(value).some(key =>
    !['schemaVersion', 'mode', 'status', 'source', 'periodStart', 'periodEnd', 'transactions'].includes(key))) {
    throw new Error('invalid_batch')
  }
  const { source, transactions } = value
  const periodStart = strictIsoDate(value.periodStart)
  const periodEnd = strictIsoDate(value.periodEnd)
  const mode = offlineSource ? 'offline' : 'synthetic'
  const validSource = offlineSource ? source === offlineSource :
    typeof source === 'string' && /^synthetic-[a-z0-9-]{1,60}$/.test(source)
  if (value.schemaVersion !== 1 || value.mode !== mode || value.status !== 'complete' ||
    typeof source !== 'string' || !validSource ||
    !periodStart || !periodEnd || periodStart > periodEnd || !Array.isArray(transactions)) throw new Error('invalid_batch')

  const batch = { schemaVersion: 1 as const, source, periodStart, periodEnd }
  return {
    ...batch,
    transactions: transactions.map((row, i) => {
      try { return normalizeRow(row, batch, accountIds) }
      catch (error) { throw new Error(`row_${i + 1}: ${(error as Error).message}`) }
    }),
  }
}

/** The public sample CLI accepts only synthetic normalized inputs. */
export function normalizeSpendingBatch(value: unknown, accountIds: Set<string>) {
  return normalizeBatch(value, accountIds)
}

export function normalizeSamsungBatch(value: unknown, accountIds: Set<string>) {
  return normalizeBatch(value, accountIds, 'offline-samsung')
}

export function normalizeSimplefinBatch(value: unknown, accountIds: Set<string>) {
  return normalizeBatch(value, accountIds, 'offline-simplefin-chase')
}

export function normalizeSnaptradeChaseBatch(value: unknown, accountIds: Set<string>) {
  return normalizeBatch(value, accountIds, 'offline-snaptrade-chase')
}

/** The normalized CSV template accepts quoted cells, escaped quotes and CRLF. */
export function readSpendingCsvRows(body: string) {
  const source = body.replace(/^\uFEFF/, '')
  const cell = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r?\n|$)/y
  const rows: string[][] = []
  for (let offset = 0; offset < source.length;) {
    const row: string[] = []
    let delimiter: string
    do {
      cell.lastIndex = offset
      const match = cell.exec(source)
      if (!match) throw new Error('invalid_csv')
      row.push(match[1]?.replace(/""/g, '"') ?? match[2])
      offset = cell.lastIndex
      delimiter = match[3]
    } while (delimiter === ',')
    rows.push(row)
  }
  return rows
}

export function readSpendingCsv(body: string) {
  const [header = [], ...data] = readSpendingCsvRows(body)
  if (!required.every(key => header.includes(key)) || new Set(header).size !== header.length ||
    header.some(key => !required.includes(key) && !optional.includes(key))) throw new Error('invalid_csv_header')
  return data.map((row, i) => {
    if (row.length !== header.length) throw new Error(`row_${i + 1}: invalid_csv_width`)
    return Object.fromEntries(header.map((key, column) => {
      const value = row[column]
      if (key === 'amountMinor' || key === 'originalAmountMinor') {
        if (value === '' && key === 'originalAmountMinor') return [key, null]
        if (!/^-?\d+$/.test(value)) throw new Error(`row_${i + 1}: invalid_amount`)
        return [key, Number(value)]
      }
      return [key, value || null]
    }))
  })
}
