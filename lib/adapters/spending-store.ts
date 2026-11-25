import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { spendingDescriptionKey, type Currency, type SpendingBatch, type SpendingRow } from '../domain/spending-import'

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const digest = (value: unknown) => sha256(JSON.stringify(value))
const schema = `
  CREATE TABLE IF NOT EXISTS spending_batch (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    record_sha256 TEXT NOT NULL,
    record_path TEXT NOT NULL,
    adapter TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    applied_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spending_transaction (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    account_id TEXT NOT NULL,
    posted_date TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    source_id TEXT,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS spending_match ON spending_transaction(account_id, posted_date, currency, amount_minor);
  CREATE UNIQUE INDEX IF NOT EXISTS spending_source_id ON spending_transaction(source, account_id, source_id)
    WHERE source_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS spending_observation (
    batch_id TEXT NOT NULL REFERENCES spending_batch(id),
    row_number INTEGER NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES spending_transaction(id),
    PRIMARY KEY (batch_id, row_number)
  );
  CREATE VIEW IF NOT EXISTS spending_refund_link AS
    SELECT refund.id AS refund_id, purchase.id AS purchase_id
    FROM spending_transaction AS refund
    LEFT JOIN spending_transaction AS purchase
      ON purchase.source = refund.source AND purchase.account_id = refund.account_id
      AND purchase.source_id = json_extract(refund.payload, '$.relatedSourceId')
      AND json_extract(purchase.payload, '$.kind') = 'purchase'
    WHERE json_extract(refund.payload, '$.kind') = 'refund';
`

const workbookSchema = `
  CREATE TABLE IF NOT EXISTS spending_workbook (
    batch_id TEXT PRIMARY KEY REFERENCES spending_batch(id),
    scope TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    record_sha256 TEXT NOT NULL,
    record_path TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spending_workbook_review (
    batch_id TEXT NOT NULL REFERENCES spending_workbook(batch_id),
    workbook TEXT NOT NULL CHECK (workbook IN ('issuer', 'banksalad')),
    row_number INTEGER NOT NULL,
    transaction_id TEXT REFERENCES spending_transaction(id),
    reason TEXT,
    CHECK ((transaction_id IS NULL) <> (reason IS NULL)),
    PRIMARY KEY (batch_id, workbook, row_number)
  );
`

const savedBankSchema = `
  CREATE TABLE IF NOT EXISTS spending_saved_bank (
    batch_id TEXT PRIMARY KEY REFERENCES spending_batch(id),
    scope TEXT NOT NULL,
    pending_ignored INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spending_saved_bank_scope (
    scope TEXT PRIMARY KEY,
    account_id TEXT NOT NULL UNIQUE,
    provider_key TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS spending_saved_bank_hold (
    batch_id TEXT NOT NULL REFERENCES spending_saved_bank(batch_id),
    row_number INTEGER NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY (batch_id, row_number)
  );
  CREATE TABLE IF NOT EXISTS spending_saved_bank_alias (
    scope TEXT NOT NULL,
    source_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES spending_transaction(id),
    payload_sha256 TEXT NOT NULL,
    PRIMARY KEY (scope, source_id),
    UNIQUE (scope, transaction_id)
  );
`

export type SavedBankFingerprint = {
  sourceId: string
  postedDate: string
  amountMinor: number
  descriptionSha256: string
}
type SavedBankHold = { row: number; reason: string; fingerprint?: SavedBankFingerprint; linkCandidateId?: string }
type SavedBankEvidence = {
  scope: string
  accountId: string
  providerKey: string
  card: boolean
  sourceRows: number[]
  held: SavedBankHold[]
  pendingIgnored: number
  reviewedLinks?: { row: number; transactionId: string }[]
  ambiguousPostingRows?: number[]
}

export type SnaptradeHold = { source: 'snaptrade' | 'chase'; row: number; reason: string }
type SnaptradeEvidence = {
  accountId: string
  providerAccountId: string
  sourceRows: number[]
  held: SnaptradeHold[]
  fallbackMatches: { snaptradeRow: number; chaseRow: number }[]
}
const snaptradeSchema = `
  CREATE TABLE IF NOT EXISTS spending_snaptrade (
    batch_id TEXT PRIMARY KEY REFERENCES spending_batch(id),
    account_id TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    held TEXT NOT NULL
  );
`

export type WorkbookHold = { workbook: 'issuer' | 'banksalad'; row: number; reason: string }
type WorkbookEvidence = {
  bytes: Buffer
  periodStart: string
  periodEnd: string
  scope: string
  sourceRows: number[]
  links: { row: number; issuerRow: number; basis?: 'legal_name_marker' }[]
  held: WorkbookHold[]
}

type ImportInput = {
  batch: SpendingBatch
  bytes: Buffer
  format: 'csv' | 'json' | 'xlsx'
  inventorySha256: string
  ledgerPath: string
  recordsDir: string
  reviewToken?: string
  workbook?: WorkbookEvidence
  savedBank?: SavedBankEvidence
  snaptrade?: SnaptradeEvidence
}
type Pending = { id: string; row: SpendingRow; rowNumber: number; insert: boolean }
type Issue = { row: number; code: 'duplicate_source_id' | 'changed_source_transaction' | 'possible_duplicate' | 'reviewed_link_mismatch' }
type Totals = { month: string; currency: Currency; purchase: bigint; refund: bigint }

const postingKey = (row: SpendingRow) => JSON.stringify([row.accountId, row.postedDate, row.currency, row.amountMinor])

const bankDescription = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

const snaptradeMatchKey = (row: SpendingRow) => JSON.stringify([
  row.accountId, row.postedDate, row.currency, row.amountMinor,
  spendingDescriptionKey(row.description),
])

function summarize(rows: SpendingRow[]) {
  const totals = new Map<string, Totals>()
  let excluded = 0
  for (const row of rows) {
    const { kind, currency } = row
    if (kind !== 'purchase' && kind !== 'refund') {
      excluded++
      continue
    }
    const month = (kind === 'refund' ? row.postedDate : row.transactionDate ?? row.postedDate).slice(0, 7)
    const key = `${month}:${currency}`
    const group = totals.get(key) ?? { month, currency, purchase: 0n, refund: 0n }
    if (kind === 'purchase') group.purchase -= BigInt(row.amountMinor)
    else group.refund += BigInt(row.amountMinor)
    totals.set(key, group)
  }
  return {
    excluded,
    totals: [...totals.keys()].sort().map(key => {
      const { month, currency, purchase, refund } = totals.get(key)!
      return { month, currency, purchaseMinor: String(purchase), refundMinor: String(refund), netMinor: String(purchase - refund) }
    }),
  }
}

/** Archive exact input bytes before the database commits. If a process stops after
 * archiving, the unreferenced content can be reused by an identical retry. */
function archive(directory: string, name: string, bytes: Buffer, hash: string) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const final = path.join(directory, name)
  const temporary = path.join(directory, `.${randomUUID()}.pending`)
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600, flush: true })
    try { fs.linkSync(temporary, final) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (!fs.lstatSync(final).isFile() || sha256(fs.readFileSync(final)) !== hash) throw new Error('archive_hash_mismatch')
    }
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function holdConflictingRefunds(
  db: Database.Database | null,
  source: string,
  pending: Pending[],
  held: WorkbookHold[],
) {
  const purchases = new Map(pending.filter(p => p.row.kind === 'purchase').map(p => [p.row.sourceId, p.row]))
  const priorAmounts = new Map<string, bigint>()
  const newAmounts = new Map<string, bigint>()
  const observedIds = new Set(pending.map(item => item.row.sourceId))
  const missingPrior = new Set<string>()
  const addRefund = (row: SpendingRow, amounts: Map<string, bigint>) => {
    if (row.kind === 'refund' && row.relatedSourceId) {
      const key = row.relatedSourceId
      amounts.set(key, (amounts.get(key) ?? 0n) + BigInt(row.amountMinor))
    }
  }
  const history = db?.prepare("SELECT payload FROM spending_transaction WHERE source = ? AND json_extract(payload, '$.kind') = 'refund'").pluck().all(source) ?? []
  for (const payload of history) {
    const refund = JSON.parse(payload as string) as SpendingRow
    addRefund(refund, priorAmounts)
    if (refund.relatedSourceId && !observedIds.has(refund.sourceId)) missingPrior.add(refund.relatedSourceId)
  }
  for (const item of pending) if (item.insert) addRefund(item.row, newAmounts)
  return pending.filter(item => {
    const { kind, relatedSourceId } = item.row
    if (kind !== 'refund' || !relatedSourceId) return true
    const purchase = purchases.get(relatedSourceId)
    const total = (priorAmounts.get(relatedSourceId) ?? 0n) + (newAmounts.get(relatedSourceId) ?? 0n)
    let reason: string
    if (!purchase) reason = 'unlinked_cancellation'
    else if (!item.insert) return true
    else if (total > -BigInt(purchase.amountMinor)) reason = 'refund_exceeds_purchase'
    else if (missingPrior.has(relatedSourceId)) reason = 'conflicting_cancellation_history'
    else return true
    held.push({ workbook: 'issuer', row: item.rowNumber, reason })
    return false
  })
}

function matchWorkbookEvidence(
  workbook: WorkbookEvidence,
  pending: Pending[],
  stored: { id: string; row: SpendingRow }[],
  held: WorkbookHold[],
) {
  const economicKey = (row: SpendingRow) => JSON.stringify([
    row.accountId, row.postedDate, row.currency, row.amountMinor,
  ])
  const key = (row: SpendingRow) => JSON.stringify([
    economicKey(row),
    row.description.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''),
  ])
  const ledgerRows = [...stored, ...pending]
  function index(keyOf: (row: SpendingRow) => string) {
    const candidates = new Map<string, Set<string>>()
    for (const { id, row } of ledgerRows) {
      const signature = keyOf(row)
      const ids = candidates.get(signature) ?? new Set()
      ids.add(id)
      candidates.set(signature, ids)
    }
    return candidates
  }
  const candidateIds = index(key)
  const economicIds = index(economicKey)
  const byRow = new Map(pending.map(record => [record.rowNumber, record]))
  const matched: { row: number; transactionId: string }[] = []
  for (const link of workbook.links) {
    const target = byRow.get(link.issuerRow)
    if (!target) held.push({ workbook: 'banksalad', row: link.row, reason: 'issuer_row_held' })
    else if (link.basis === 'legal_name_marker'
      ? economicIds.get(economicKey(target.row))?.size !== 1
      : candidateIds.get(key(target.row))?.size !== 1) {
      held.push({ workbook: 'banksalad', row: link.row, reason: 'ambiguous_match' })
    } else matched.push({ row: link.row, transactionId: target.id })
  }
  return matched
}

function validateSavedBankScope(db: Database.Database, evidence: SavedBankEvidence) {
  const { scope, accountId, providerKey, card } = evidence
  const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE name = ? AND type = 'table'")
  if (hasTable.get('spending_saved_bank_scope') && db.prepare(`
    SELECT 1 FROM spending_saved_bank_scope
    WHERE (scope = ? OR account_id = ? OR provider_key = ?)
      AND NOT (scope = ? AND account_id = ? AND provider_key = ?)
    LIMIT 1
  `).get(scope, accountId, providerKey, scope, accountId, providerKey)) {
    throw new Error('offline_scope_changed')
  }
  // A pre-registry ledger allowed exactly one Chase Checking binding.
  if (hasTable.get('spending_saved_bank') && db.prepare(`
    SELECT 1 FROM spending_saved_bank bank
    JOIN spending_batch batch ON batch.id = bank.batch_id
    WHERE bank.scope <> ? AND batch.adapter = 'simplefin-chase-checking-v1'
      AND (? = 0 OR EXISTS (
        SELECT 1 FROM spending_observation obs
        JOIN spending_transaction tx ON tx.id = obs.transaction_id
        WHERE obs.batch_id = bank.batch_id AND tx.account_id = ?
      ))
    LIMIT 1
  `).get(scope, Number(card), accountId)) {
    throw new Error('offline_scope_changed')
  }
}

function processBatch(db: Database.Database | null, input: ImportInput) {
  const { batch, bytes, format, workbook, savedBank, snaptrade } = input
  const adapter = workbook ? 'samsung-banksalad-xlsx-v1' :
    savedBank ? (savedBank.card ? 'simplefin-card-v1' : 'simplefin-chase-checking-v1') :
      snaptrade ? 'snaptrade-chase-card-v1' : `synthetic-${format}-v${batch.schemaVersion}`
  const rawHash = sha256(bytes)
  const recordName = `${rawHash}.${format}`
  const bankHash = workbook && sha256(workbook.bytes)
  const batchKey = [adapter, batch.source, batch.periodStart, batch.periodEnd, rawHash]
  if (workbook) batchKey.push(workbook.scope, workbook.periodStart, workbook.periodEnd, bankHash!)
  if (savedBank) batchKey.push(savedBank.scope)
  const batchId = digest(batchKey)
  const hasWorkbookTable = workbook && db?.prepare("SELECT 1 FROM sqlite_master WHERE name = 'spending_workbook' AND type = 'table'").get()
  if (hasWorkbookTable && db!.prepare('SELECT 1 FROM spending_workbook WHERE scope <> ? LIMIT 1').get(workbook.scope)) {
    throw new Error('offline_scope_changed')
  }
  if (savedBank && db) validateSavedBankScope(db, savedBank)
  if (snaptrade && db?.prepare("SELECT 1 FROM sqlite_master WHERE name = 'spending_snaptrade' AND type = 'table'").get() &&
      db.prepare('SELECT 1 FROM spending_snaptrade WHERE (account_id = ?) <> (provider_account_id = ?) LIMIT 1')
        .get(snaptrade.accountId, snaptrade.providerAccountId)) {
    throw new Error('offline_scope_changed')
  }
  const count = db?.prepare('SELECT count(*) FROM spending_batch').pluck().get() ?? 0
  const applied = db?.prepare('SELECT id FROM spending_batch WHERE id = ?').get(batchId)
  const stored = ((db?.prepare('SELECT id, source, payload FROM spending_transaction ORDER BY id').all() ?? []) as
    { id: string; source: string; payload: string }[])
    .map(({ id, source, payload }) => ({ id, source, row: JSON.parse(payload) as SpendingRow }))
  const existing = stored.map(record => record.row)
  const reviewedLinks = new Map(savedBank?.reviewedLinks?.map(link => [link.row, link.transactionId]))
  const storedAliases = savedBank && db?.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'spending_saved_bank_alias'",
  ).get() ? db.prepare('SELECT source_id, transaction_id, payload_sha256 FROM spending_saved_bank_alias WHERE scope = ? ORDER BY source_id')
    .all(savedBank.scope) as { source_id: string; transaction_id: string; payload_sha256: string }[] : []
  const aliasBySource = new Map(storedAliases.map(row => [row.source_id, row]))
  const sourceByAlias = new Map(storedAliases.map(row => [row.transaction_id, row.source_id]))
  const overlapState = reviewedLinks.size || storedAliases.length
    ? [storedAliases, stored.map(({ id, row }) => [id, row])] : null
  const reviewToken = digest([input.ledgerPath, batchId, input.inventorySha256, count, ...(overlapState ? [overlapState] : [])])

  if (applied) return {
    status: 'already_applied', reviewToken, inserted: 0, matched: 0, observations: 0, issues: [],
    ...(savedBank ? { pendingIgnored: savedBank.pendingIgnored } : {}), ...summarize(existing),
    ...(snaptrade ? {
      held: JSON.parse(db!.prepare('SELECT held FROM spending_snaptrade WHERE batch_id = ?').pluck().get(batchId) as string) as SnaptradeHold[],
      fallbackMatches: snaptrade.fallbackMatches,
    } : {}),
  }

  const byId = db?.prepare('SELECT payload FROM spending_transaction WHERE id = ?').pluck()
  const candidates = db?.prepare(`
    SELECT 1 FROM spending_transaction
    WHERE account_id = ? AND posted_date = ? AND currency = ? AND amount_minor = ?
      AND (source <> ? OR ((source_id IS NULL) <> ?))
    LIMIT 1
  `)
  const seenIds = new Set<string>()
  const multiplicity = new Map<string, number>()
  const matchModes = new Map<string, boolean>()
  const ambiguousPostings = new Set(savedBank?.ambiguousPostingRows)
  function bankCandidate(row: SpendingRow, rowNumber: number) {
    if (ambiguousPostings.has(rowNumber)) return
    const posted = stored.filter(candidate => postingKey(candidate.row) === postingKey(row))
    const target = posted[0]
    if (posted.length === 1 && target.source !== batch.source && target.row.kind === row.kind &&
        (!row.transferRef || target.row.transferRef === row.transferRef) &&
        bankDescription(target.row.description) === bankDescription(row.description)) return target.id
  }
  const newAliases: { sourceId: string; transactionId: string; payloadSha256: string }[] = []
  const priorCardKeys = snaptrade && new Set(stored
    .filter(record => record.source === batch.source)
    .map(record => snaptradeMatchKey(record.row)))
  let pending: Pending[] = []
  const issues: Issue[] = []
  const held = [...(workbook?.held ?? [])]
  const bankHeld = [...(savedBank?.held ?? [])]
  const cardHeld = [...(snaptrade?.held ?? [])]
  const sourceRows = workbook?.sourceRows ?? savedBank?.sourceRows ?? snaptrade?.sourceRows
  batch.transactions.forEach((row, index) => {
    const rowNumber = sourceRows?.[index] ?? index + 1
    const payload = JSON.stringify(row)
    const fingerprint = sha256(payload)
    const ordinal = (multiplicity.get(fingerprint) ?? 0) + 1
    if (!row.sourceId) multiplicity.set(fingerprint, ordinal)
    const id = digest([batch.source, row.accountId, row.sourceId ? ['id', row.sourceId] : ['row', fingerprint, ordinal]])
    const prior = byId?.get(id)
    const matchKey = postingKey(row)
    const hasSourceId = row.sourceId !== null
    const batchMode = matchModes.get(matchKey)
    const approvedTarget = reviewedLinks.get(rowNumber)
    const previousAlias = row.sourceId ? aliasBySource.get(row.sourceId) : undefined
    const targetId = approvedTarget ?? previousAlias?.transaction_id
    if (seenIds.has(id)) issues.push({ row: rowNumber, code: 'duplicate_source_id' })
    else if ((prior && prior !== payload) || (previousAlias && previousAlias.payload_sha256 !== fingerprint)) issues.push({ row: rowNumber, code: 'changed_source_transaction' })
    else if (targetId && row.sourceId) {
      const claimedBy = sourceByAlias.get(targetId)
      if (prior || (previousAlias && previousAlias.transaction_id !== targetId) || (claimedBy && claimedBy !== row.sourceId) ||
          bankCandidate(row, rowNumber) !== targetId) {
        issues.push({ row: rowNumber, code: 'reviewed_link_mismatch' })
      } else {
        pending.push({ id: targetId, row, rowNumber, insert: false })
        if (!previousAlias) newAliases.push({ sourceId: row.sourceId, transactionId: targetId, payloadSha256: fingerprint })
      }
    } else if ((batchMode !== undefined && batchMode !== hasSourceId) ||
      candidates?.get(row.accountId, row.postedDate, row.currency, row.amountMinor, batch.source, Number(!hasSourceId)) ||
      (!prior && priorCardKeys?.has(snaptradeMatchKey(row)))) {
      issues.push({ row: rowNumber, code: 'possible_duplicate' })
    } else pending.push({ id, row, rowNumber, insert: !prior })
    seenIds.add(id)
    matchModes.set(matchKey, hasSourceId)
  })
  if (workbook) {
    held.push(...issues.map(({ row, code }): WorkbookHold => ({ workbook: 'issuer', row, reason: code })))
    issues.length = 0
    pending = holdConflictingRefunds(db, batch.source, pending, held)
  }
  if (savedBank) {
    const byRow = new Map(savedBank.sourceRows.map((row, index) => [row, batch.transactions[index]]))
    for (const { row, code } of issues) {
      const transaction = byRow.get(row)
      const candidate = transaction && code === 'possible_duplicate' ? bankCandidate(transaction, row) : undefined
      const claimed = candidate ? sourceByAlias.get(candidate) : undefined
      bankHeld.push({ row, reason: code, ...(candidate && !claimed ? { linkCandidateId: candidate } : {}) })
    }
    issues.length = 0
    bankHeld.sort((a, b) => a.row - b.row)
  }
  if (snaptrade) {
    for (const { row, code } of issues) cardHeld.push({ source: 'snaptrade', row, reason: code })
    issues.length = 0
    cardHeld.sort((a, b) => a.source.localeCompare(b.source) || a.row - b.row)
  }
  const linked = workbook ? matchWorkbookEvidence(workbook, pending, stored, held) : []
  held.sort((a, b) => a.workbook.localeCompare(b.workbook) || a.row - b.row)
  const inserted = pending.filter(record => record.insert)
  const result = {
    reviewToken, inserted: inserted.length, matched: pending.length - inserted.length,
    observations: pending.length, issues,
    ...(workbook ? { evidenceLinked: linked.length, held } : {}),
    ...(savedBank ? { pendingIgnored: savedBank.pendingIgnored, held: bankHeld } : {}),
    ...(snaptrade ? { held: cardHeld, fallbackMatches: snaptrade.fallbackMatches } : {}),
    ...summarize(issues.length ? existing : [...existing, ...inserted.map(record => record.row)]),
  }
  if (input.reviewToken === undefined) return { status: issues.length ? 'review_required' : 'preview', ...result }
  if (reviewToken !== input.reviewToken) throw new Error('stale_preview')
  if (issues.length) throw new Error('review_required')
  if (!db) throw new Error('ledger_unavailable')

  archive(input.recordsDir, recordName, bytes, rawHash)
  const bankName = `${bankHash}.xlsx`
  if (workbook && bankHash) archive(input.recordsDir, bankName, workbook.bytes, bankHash)
  db.prepare('INSERT INTO spending_batch VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    batchId, batch.source, batch.periodStart, batch.periodEnd, rawHash, recordName, adapter, pending.length, new Date().toISOString(),
  )
  const insertTransaction = db.prepare('INSERT INTO spending_transaction VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const observe = db.prepare('INSERT INTO spending_observation VALUES (?, ?, ?)')
  for (const { id, row, rowNumber, insert } of pending) {
    if (insert) insertTransaction.run(id, batch.source, row.accountId, row.postedDate, row.currency, row.amountMinor, row.sourceId, JSON.stringify(row))
    observe.run(batchId, rowNumber, id)
  }
  if (workbook) {
    db.prepare('INSERT INTO spending_workbook VALUES (?, ?, ?, ?, ?, ?)').run(
      batchId, workbook.scope, workbook.periodStart, workbook.periodEnd, bankHash, bankName,
    )
    const record = db.prepare('INSERT INTO spending_workbook_review VALUES (?, ?, ?, ?, ?)')
    for (const link of linked) record.run(batchId, 'banksalad', link.row, link.transactionId, null)
    for (const hold of held) record.run(batchId, hold.workbook, hold.row, null, hold.reason)
  }
  if (savedBank) {
    db.prepare('INSERT INTO spending_saved_bank_scope VALUES (?, ?, ?) ON CONFLICT(scope) DO NOTHING')
      .run(savedBank.scope, savedBank.accountId, savedBank.providerKey)
    const addAlias = db.prepare('INSERT INTO spending_saved_bank_alias VALUES (?, ?, ?, ?)')
    for (const alias of newAliases) addAlias.run(savedBank.scope, alias.sourceId, alias.transactionId, alias.payloadSha256)
    db.prepare('INSERT INTO spending_saved_bank VALUES (?, ?, ?)').run(batchId, savedBank.scope, savedBank.pendingIgnored)
    const record = db.prepare('INSERT INTO spending_saved_bank_hold VALUES (?, ?, ?)')
    for (const hold of bankHeld) record.run(batchId, hold.row, hold.reason)
  }
  if (snaptrade) {
    db.prepare('INSERT INTO spending_snaptrade VALUES (?, ?, ?, ?)').run(
      batchId, snaptrade.accountId, snaptrade.providerAccountId, JSON.stringify(cardHeld),
    )
  }
  return { status: 'applied', ...result, ...(savedBank ? { evidenceSha256: rawHash } : {}) }
}

export function importSpending(input: ImportInput) {
  if (input.reviewToken === undefined && !fs.existsSync(input.ledgerPath)) return processBatch(null, input)
  const apply = input.reviewToken !== undefined
  if (apply) {
    fs.mkdirSync(path.dirname(input.ledgerPath), { recursive: true, mode: 0o700 })
    // Create with explicit permissions before SQLite opens the file.
    fs.closeSync(fs.openSync(input.ledgerPath, 'a', 0o600))
  }
  const db = new Database(input.ledgerPath, { readonly: !apply, fileMustExist: true })
  try {
    return db.transaction(() => {
      const version = db.pragma('user_version', { simple: true })
      if (version !== 0 && version !== 1) throw new Error('unsupported_ledger')
      if (version === 0) {
        if (db.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get()) throw new Error('unsupported_ledger')
        // A first apply may have opened the file but not committed the schema.
        if (!apply) return processBatch(null, input)
        db.exec(schema)
        db.pragma('user_version = 1')
      }
      if (apply && input.workbook) db.exec(workbookSchema)
      if (apply && input.savedBank) db.exec(savedBankSchema)
      if (apply && input.snaptrade) db.exec(snaptradeSchema)
      return processBatch(db, input)
    })[apply ? 'immediate' : 'deferred']()
  } finally { db.close() }
}
