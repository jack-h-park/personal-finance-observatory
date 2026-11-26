import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { strictIsoDate } from '../domain/assets/query-coverage'
import { instant, object, text } from '../domain/assets/account-inventory/validation'
import { normalizeSimplefinBatch, type SpendingRow } from '../domain/spending-import'
import type { SavedBankFingerprint } from './spending-store'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const sha256 = /^[a-f0-9]{64}$/
const runKey = /^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/
const newYorkDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
})
const kinds: SpendingRow['kind'][] = ['purchase', 'refund', 'card_payment', 'own_transfer', 'fee', 'other']
type Decision = SavedBankFingerprint & { kind: SpendingRow['kind']; basis: string; transferRef?: string; linkToTransactionId?: string; targetDescriptionSha256?: string }

function postedDate(value: unknown, card: boolean) {
  if (!instant(value)) throw new Error('invalid_simplefin_date')
  return card ? new Date(value).toISOString().slice(0, 10) : newYorkDate.format(new Date(value))
}

function cents(value: unknown) {
  if (typeof value !== 'string' || value.length > 40) throw new Error('invalid_simplefin_amount')
  const parts = /^(-?)(\d+)(?:\.(\d{1,2})(0*))?$/.exec(value)
  if (!parts) throw new Error('invalid_simplefin_amount')
  const minor = Number(BigInt(parts[2]) * 100n + BigInt((parts[3] ?? '').padEnd(2, '0')))
  if (!Number.isSafeInteger(minor)) throw new Error('invalid_simplefin_amount')
  return parts[1] ? -minor : minor
}

function providerId(value: unknown): value is string {
  return text(value) && value.length <= 200 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
}

function reviewDecisions(value: unknown) {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.decisions) ||
      Object.keys(value).some(key => !['schemaVersion', 'decisions'].includes(key))) throw new Error('invalid_simplefin_decisions')
  const decisions = new Map<string, Decision>()
  for (const row of value.decisions) {
    if (!object(row)) throw new Error('invalid_simplefin_decisions')
    const { sourceId, amountMinor, descriptionSha256, kind, basis, transferRef, linkToTransactionId, targetDescriptionSha256 } = row
    const date = strictIsoDate(row.postedDate)
    if (!providerId(sourceId) || decisions.has(sourceId) || !date ||
      typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || !amountMinor ||
      typeof descriptionSha256 !== 'string' || !sha256.test(descriptionSha256) ||
      !kinds.includes(kind as SpendingRow['kind']) || !text(basis) || basis.length > 800 ||
      (transferRef !== undefined && (!providerId(transferRef) || (kind !== 'card_payment' && kind !== 'own_transfer'))) ||
      (linkToTransactionId !== undefined && (typeof linkToTransactionId !== 'string' || !sha256.test(linkToTransactionId))) ||
      (targetDescriptionSha256 !== undefined && (typeof targetDescriptionSha256 !== 'string' ||
        !sha256.test(targetDescriptionSha256) || !linkToTransactionId)) ||
      Object.keys(row).some(key => !['sourceId', 'postedDate', 'amountMinor', 'descriptionSha256', 'kind', 'basis', 'transferRef', 'linkToTransactionId', 'targetDescriptionSha256'].includes(key))) {
      throw new Error('invalid_simplefin_decisions')
    }
    decisions.set(sourceId, {
      sourceId, postedDate: date, amountMinor, descriptionSha256, kind: kind as SpendingRow['kind'], basis,
      ...(transferRef === undefined ? {} : { transferRef }),
      ...(linkToTransactionId === undefined ? {} : { linkToTransactionId }),
      ...(targetDescriptionSha256 === undefined ? {} : { targetDescriptionSha256 }),
    })
  }
  return decisions
}

type AccountKind = 'credit_card' | 'checking' | 'savings'

function accountBinding(value: unknown, accountIds: Set<string>) {
  if (!object(value) || Object.keys(value).some(key => !['accountId', 'providerAccountId', 'connectionId', 'accountKind', 'expectedAccountName'].includes(key)) || !text(value.accountId) ||
      !providerId(value.providerAccountId) || !providerId(value.connectionId) ||
      (value.accountKind !== undefined && !['credit_card', 'checking', 'savings'].includes(value.accountKind as string)) ||
      (value.expectedAccountName !== undefined && (value.accountKind !== 'credit_card' || !providerId(value.expectedAccountName)))) {
    throw new Error('invalid_simplefin_binding')
  }
  if (!accountIds.has(value.accountId)) throw new Error('unknown_account')
  return { accountId: value.accountId, providerAccountId: value.providerAccountId, connectionId: value.connectionId,
    ...(value.accountKind === undefined ? {} : { accountKind: value.accountKind as AccountKind }),
    ...(value.expectedAccountName === undefined ? {} : { expectedAccountName: value.expectedAccountName }) }
}

/** Prepare transactions from the connector's already verified banking/v1 run. */
export function prepareSimplefinSpending(options: {
  run: unknown
  binding: unknown
  decisions: unknown
  accountIds: Set<string>
  manifestSha256: string
  connectionKey: string
}) {
  const binding = accountBinding(options.binding, options.accountIds)
  const card = binding.accountKind === 'credit_card'
  const legacyChecking = binding.accountKind === undefined
  const accountName = binding.accountKind === 'savings' ? /\bsavings\b/i :
    card ? /\bcard\b/i : legacyChecking ? /\bchecking\b/i : /\b(checking|banking)\b/i
  const source = card ? 'offline-simplefin-card' : legacyChecking ? 'offline-simplefin-chase' : 'offline-simplefin-deposit'
  const decisions = reviewDecisions(options.decisions)
  const { run, manifestSha256, connectionKey } = options
  if (!sha256.test(manifestSha256) || !runKey.test(connectionKey) ||
      !object(run) || !object(run.manifest) || !object(run.data)) throw new Error('invalid_simplefin_run')
  const { manifest, data } = run
  if (manifest.schemaVersion !== 'banking/1.0' || manifest.provider !== 'simplefin' ||
      manifest.environment !== 'live' || manifest.sample !== false || manifest.connectionKey !== connectionKey ||
      typeof manifest.runId !== 'string' || !runKey.test(manifest.runId) || !instant(manifest.fetchedAt) ||
      !Array.isArray(data.accounts) || data.accounts.length !== 1 || !Array.isArray(data.transactions) ||
      !Array.isArray(data['pending-transactions'])) throw new Error('invalid_simplefin_run')
  const [account] = data.accounts
  if (!object(account) || !text(account.accountRef) || account.currency !== 'USD' ||
      typeof account.name !== 'string' ||
      (binding.expectedAccountName === undefined ? !accountName.test(account.name) : account.name !== binding.expectedAccountName) ||
      account.providerAccountId !== binding.providerAccountId || account.connectionId !== binding.connectionId ||
      manifest.connectionId !== binding.connectionId || !Array.isArray(manifest.accountIds) ||
      manifest.accountIds.length !== 1 || manifest.accountIds[0] !== binding.providerAccountId) {
    throw new Error('simplefin_account_mismatch')
  }

  const transactions: Record<string, unknown>[] = []
  const sourceRows: number[] = []
  const held: { row: number; reason: string; fingerprint?: SavedBankFingerprint }[] = []
  const seen = new Set<string>()
  const dates: string[] = []
  const usedDecisions: Decision[] = []
  const postingRows = new Map<string, number[]>()
  const reviewedLinks: { row: number; transactionId: string; targetDescriptionSha256?: string }[] = []
  for (const [index, row] of data.transactions.entries()) {
    if (!object(row) || row.state !== 'posted' || row.currency !== 'USD' || row.accountRef !== account.accountRef ||
        !providerId(row.providerTransactionId) || seen.has(row.providerTransactionId) || typeof row.description !== 'string') {
      throw new Error('invalid_simplefin_posted')
    }
    const sourceId = row.providerTransactionId
    seen.add(sourceId)
    const date = postedDate(row.postedAt, card)
    dates.push(date)
    const amountMinor = cents(row.amount)
    const rowNumber = index + 1
    const postingKey = JSON.stringify([date, amountMinor])
    const peers = postingRows.get(postingKey) ?? []
    peers.push(rowNumber)
    postingRows.set(postingKey, peers)
    if (!amountMinor || !row.description.trim() || row.description.length > 1000 || row.description.includes('\0')) {
      held.push({ row: rowNumber, reason: 'unsupported_posted_transaction' })
      continue
    }
    const fingerprint = { sourceId, postedDate: date, amountMinor, descriptionSha256: hash(row.description) }
    const decision = decisions.get(sourceId)
    if (decision) usedDecisions.push(decision)
    if (!decision || decision.postedDate !== date || decision.amountMinor !== amountMinor ||
        decision.descriptionSha256 !== fingerprint.descriptionSha256) {
      held.push({ row: rowNumber, reason: decision ? 'decision_evidence_mismatch' : 'unreviewed_transaction', fingerprint })
      continue
    }
    transactions.push({
      accountId: binding.accountId, sourceId, postedDate: date, amountMinor, currency: 'USD',
      description: row.description, kind: decision.kind, transferRef: decision.transferRef,
    })
    sourceRows.push(rowNumber)
    if (decision.linkToTransactionId) reviewedLinks.push({ row: rowNumber, transactionId: decision.linkToTransactionId,
      targetDescriptionSha256: decision.targetDescriptionSha256 })
  }
  dates.sort()
  const start = dates[0] ?? postedDate(manifest.fetchedAt, card)
  const batch = normalizeSimplefinBatch({
    schemaVersion: 1, mode: 'offline', status: 'complete', source,
    periodStart: start, periodEnd: dates.at(-1) ?? start, transactions,
  }, options.accountIds, source)
  // The collector keeps the immutable original; this archive preserves its
  // manifest hash, normalized rows with their raw pointers, and review evidence.
  const bytes = Buffer.from(JSON.stringify({ manifestSha256, run, binding, decisions: usedDecisions }))
  const scopeBinding = { ...binding }
  delete scopeBinding.expectedAccountName
  return {
    batch, bytes, format: 'json' as const,
    savedBank: {
      scope: hash(JSON.stringify([scopeBinding, connectionKey])),
      accountId: binding.accountId, card, legacyChecking, providerKey: hash(JSON.stringify([binding.connectionId, binding.providerAccountId])),
      ...(card ? { reviewedEvidenceScope: hash(JSON.stringify(['simplefin-card', [binding.connectionId, binding.providerAccountId]])) } : {}),
      sourceRows, held, reviewedLinks,
      ambiguousPostingRows: [...postingRows.values()].filter(rows => rows.length > 1).flat(),
      pendingIgnored: data['pending-transactions'].length,
    },
  }
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export async function loadSimplefinSpending(options: {
  pointer: string
  config: string
  connectorRepo: string
  binding: string
  decisions?: string
  accountIds: Set<string>
}) {
  const pointer = readJson(options.pointer)
  const config = readJson(options.config)
  if (!object(pointer) || pointer.schemaVersion !== 'banking/1.0' || pointer.provider !== 'simplefin' ||
      pointer.environment !== 'live' || typeof pointer.connectionKey !== 'string' || !runKey.test(pointer.connectionKey) ||
      typeof pointer.runId !== 'string' || !runKey.test(pointer.runId) ||
      typeof pointer.manifestSha256 !== 'string' || !sha256.test(pointer.manifestSha256)) {
    throw new Error('invalid_simplefin_pointer')
  }
  const binding = accountBinding(readJson(options.binding), options.accountIds)
  const domains = binding.accountKind === undefined ? ['chase.com'] :
    binding.accountKind === 'credit_card' ? ['americanexpress.com', 'amazon.syf.com', 'bankofamerica.com', 'chase.com', 'robinhood.com'] :
      binding.accountKind === 'savings' ? ['americanexpress.com', 'robinhood.com'] :
      ['americanexpress.com', 'bankofamerica.com', 'robinhood.com']
  if (!object(config) || config.provider !== 'simplefin' || config.environment !== 'live' || config.sample !== false ||
      typeof config.institutionDomain !== 'string' || !domains.includes(config.institutionDomain) || config.connectionKey !== pointer.connectionKey) {
    throw new Error('invalid_simplefin_config')
  }
  if (config.connectionId !== binding.connectionId || !Array.isArray(config.accountIds) ||
      config.accountIds.length !== 1 || config.accountIds[0] !== binding.providerAccountId) {
    throw new Error('simplefin_account_mismatch')
  }
  const repo = fs.realpathSync(options.connectorRepo)
  const moduleUrl = (name: string) => pathToFileURL(path.join(repo, 'dist/providers/simplefin', name)).href
  let run: unknown
  try {
    const { loadBankConfig } = await import(moduleUrl('config.js'))
    const { readBankRun } = await import(moduleUrl('storage.js'))
    run = readBankRun(loadBankConfig(config), pointer.runId, pointer.manifestSha256)
  } catch {
    throw new Error('simplefin_saved_run_validation_failed')
  }
  return prepareSimplefinSpending({
    run, binding, accountIds: options.accountIds, connectionKey: pointer.connectionKey,
    manifestSha256: pointer.manifestSha256,
    decisions: options.decisions ? readJson(options.decisions) : { schemaVersion: 1, decisions: [] },
  })
}
