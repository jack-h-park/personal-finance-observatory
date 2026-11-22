import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { strictIsoDate } from '../domain/assets/query-coverage'
import { object } from '../domain/assets/account-inventory/validation'
import { normalizeSamsungBatch } from '../domain/spending-import'
import type { WorkbookHold } from './spending-store'

const reader = fileURLToPath(new URL('../../scripts/read-spending-workbooks.py', import.meta.url))
const projectPython = fileURLToPath(new URL('../../.venv/bin/python', import.meta.url))
const maxSize = 16 * 1024 * 1024
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

function workbookBytes(file: string) {
  const stat = fs.statSync(file)
  if (!file.toLowerCase().endsWith('.xlsx') || !stat.isFile() || stat.size > maxSize) {
    throw new Error('invalid_workbook_input')
  }
  return fs.readFileSync(file)
}

type ReaderResult = {
  issuerStart: string
  issuerEnd: string
  transactions: { row: number; transaction: unknown }[]
  links: { row: number; issuerRow: number; basis?: 'legal_name_marker' }[]
  held: WorkbookHold[]
}

export function loadSpendingWorkbooks(options: {
  samsung: string
  banksalad: string
  binding: string
  from?: string
  to?: string
  accountIds: Set<string>
}) {
  const periodStart = strictIsoDate(options.from)
  const periodEnd = strictIsoDate(options.to)
  if (!periodStart || !periodEnd || periodStart > periodEnd) throw new Error('invalid_banksalad_period')
  const binding: unknown = JSON.parse(fs.readFileSync(options.binding, 'utf8'))
  if (!object(binding) || Object.keys(binding).length !== 3 || typeof binding.accountId !== 'string' ||
    typeof binding.samsungCardNumber !== 'string' || !binding.samsungCardNumber.trim() ||
    typeof binding.bankSaladPaymentMethod !== 'string' || !binding.bankSaladPaymentMethod.trim()) {
    throw new Error('invalid_workbook_binding')
  }
  if (!options.accountIds.has(binding.accountId)) throw new Error('unknown_account')
  const samsung = workbookBytes(options.samsung)
  const banksalad = workbookBytes(options.banksalad)
  const result = spawnSync(process.env.STOCK_PYTHON_BIN || (fs.existsSync(projectPython) ? projectPython : 'python3'), [reader], {
    encoding: 'utf8',
    input: JSON.stringify({ binding, periodStart, periodEnd, samsung: samsung.toString('base64'), banksalad: banksalad.toString('base64') }),
    maxBuffer: 24 * 1024 * 1024,
    timeout: 60_000,
  })
  if (result.status !== 0) {
    const code = result.stderr?.trim().split('\n').at(-1)?.match(/^ValueError: (invalid_sheet|invalid_banksalad_period|invalid_issuer_period|issuer_card_not_found|disjoint_workbook_periods)$/)?.[1]
    throw new Error(code ?? 'workbook_parse_failed')
  }
  const read = JSON.parse(result.stdout) as ReaderResult
  const batch = normalizeSamsungBatch({
    schemaVersion: 1, mode: 'offline', status: 'complete', source: 'offline-samsung',
    periodStart: read.issuerStart, periodEnd: read.issuerEnd, transactions: read.transactions.map(r => r.transaction),
  }, options.accountIds)
  return {
    batch, bytes: samsung, format: 'xlsx' as const,
    workbook: {
      bytes: banksalad, periodStart, periodEnd,
      scope: hash(JSON.stringify([binding.accountId, binding.samsungCardNumber, binding.bankSaladPaymentMethod])),
      sourceRows: read.transactions.map(r => r.row), links: read.links, held: read.held,
    },
  }
}
