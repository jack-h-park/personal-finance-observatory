import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { strictIsoDate } from '../domain/assets/query-coverage'
import { object } from '../domain/assets/account-inventory/validation'
import type { SpendingCoverage, SpendingHold, SpendingSnapshot, SpendingViewRow } from '../domain/spending-view'

const sha = (input: Buffer) => createHash('sha256').update(input).digest('hex')

export function spendingPilotEnabled(env = process.env) {
  return env.NODE_ENV === 'development' && !!env.SPENDING_PILOT_DB
}

export function loadSpendingPilot() {
  if (!spendingPilotEnabled()) return { status: 'disabled' } as const
  try {
    const ledger = process.env.SPENDING_PILOT_DB!
    const snapshot = readSpendingSnapshot(ledger, process.env.SPENDING_PILOT_BANKSALAD_OBSERVATIONS)
    const accounts = readAccountLabels(path.join(path.dirname(path.dirname(ledger)), 'account-labels.json'))
    return { status: 'available', snapshot, accounts } as const
  } catch {
    return { status: 'unavailable' } as const
  }
}

function readAccountLabels(file: string) {
  const accounts = { en: new Map<string, { label: string; note?: string }>(), ko: new Map<string, { label: string; note?: string }>() }
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!object(value)) return accounts
    for (const language of ['en', 'ko'] as const) {
      const labels = value[language]
      if (!object(labels)) continue
      for (const [id, entry] of Object.entries(labels)) {
        if (object(entry) && typeof entry.label === 'string' && entry.label.trim()) {
          accounts[language].set(id, { label: entry.label, note: typeof entry.note === 'string' ? entry.note : undefined })
        }
      }
    }
  } catch {
    // Account labels are optional. The ledger IDs remain available for filtering.
  }
  return accounts
}

function readReview(file: string, checksum: string): Record<string, unknown> {
  const bytes = fs.readFileSync(file)
  if (sha(bytes) !== checksum) throw new Error('invalid_review_hash')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!object(value)) throw new Error('invalid_review')
  return value
}

function emptyHold(accountId: string, source: SpendingHold['source'], row: number, reason: string): SpendingHold {
  return { accountId, source, row, reason, date: null, currency: null, amountMinor: null }
}

export function readSpendingSnapshot(ledger: string, bankSaladObservation?: string): SpendingSnapshot {
  if (!path.isAbsolute(ledger)) throw new Error('invalid_pilot_path')
  const db = new Database(ledger, { readonly: true, fileMustExist: true })
  try {
    const rows = db.prepare(`
      SELECT id, account_id AS accountId, posted_date AS postedDate,
        CASE WHEN json_extract(payload,'$.kind') = 'purchase'
          THEN coalesce(json_extract(payload,'$.transactionDate'),posted_date)
          ELSE posted_date END AS activityDate,
        currency, amount_minor AS amountMinor, json_extract(payload,'$.kind') AS kind,
        json_extract(payload,'$.description') AS description
      FROM spending_transaction
    `).all() as SpendingViewRow[]
    const coverage = db.prepare(`
      SELECT account_id AS accountId,currency,min(posted_date) AS first,max(posted_date) AS last,count(*) AS count
      FROM spending_transaction GROUP BY account_id,currency ORDER BY currency DESC,account_id
    `).all() as SpendingCoverage[]
    const holds: SpendingHold[] = []
    let reviewIncomplete = false
    const hasTable = (name: string) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
    const records = path.join(path.dirname(path.dirname(ledger)), 'records')
    const readArchive = (file: string, checksum: string) => {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) throw new Error('invalid_archive_name')
      return readReview(path.join(records, file), checksum)
    }

    if (hasTable('spending_workbook_review')) {
      const pending = db.prepare(`
        SELECT r.row_number AS row, r.workbook AS source, r.reason, w.record_sha256 AS workbookSha,
          (SELECT min(t.account_id) FROM spending_observation o JOIN spending_transaction t ON t.id=o.transaction_id
            WHERE o.batch_id=w.batch_id HAVING count(DISTINCT t.account_id)=1) AS accountId
        FROM spending_workbook_review r JOIN spending_workbook w ON w.batch_id=r.batch_id
        WHERE r.reason IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM spending_workbook outer_window WHERE outer_window.scope=w.scope
            AND outer_window.period_start<=w.period_start AND outer_window.period_end>=w.period_end
            AND (outer_window.period_start<w.period_start OR outer_window.period_end>w.period_end)
        )
        ORDER BY r.row_number
      `).all() as { row: number; source: 'issuer' | 'banksalad'; reason: string; workbookSha: string; accountId: string | null }[]
      const bankRows = new Map<number, { date: string; amountMinor: number }>()
      let workbookSha: unknown
      if (bankSaladObservation) {
        try {
          if (!path.isAbsolute(bankSaladObservation) || path.basename(bankSaladObservation) !== 'observation.json') {
            throw new Error('invalid_observation_path')
          }
          const manifest: unknown = JSON.parse(fs.readFileSync(path.join(path.dirname(bankSaladObservation), 'manifest.json'), 'utf8'))
          if (!object(manifest) || !object(manifest.files) || typeof manifest.files['observation.json'] !== 'string') {
            throw new Error('invalid_observation_manifest')
          }
          const observed = readReview(bankSaladObservation, manifest.files['observation.json'])
          workbookSha = observed.sourceSha256
          if (workbookSha !== manifest.files['source.xlsx'] || !Array.isArray(observed.transactions)) {
            throw new Error('invalid_observation_source')
          }
          for (const entry of observed.transactions) {
            if (!object(entry) || typeof entry.sourceRow !== 'number' || typeof entry.date !== 'string' ||
                entry.currency !== 'KRW' || !Number.isSafeInteger(Number(entry.amount))) continue
            const date = strictIsoDate(entry.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'))
            if (date) bankRows.set(entry.sourceRow, { date, amountMinor: Number(entry.amount) })
          }
        } catch {
          reviewIncomplete = true
        }
      }
      for (const row of pending) {
        if (!row.accountId) {
          reviewIncomplete = true
          continue
        }
        const source = row.source === 'issuer' ? 'samsung' : 'banksalad'
        const data = source === 'banksalad' && workbookSha === row.workbookSha ? bankRows.get(row.row) : undefined
        holds.push({ ...emptyHold(row.accountId, source, row.row, row.reason),
          ...(data ? { ...data, currency: 'KRW' as const } : {}) })
      }
    }

    const robinhood = db.prepare(`
      SELECT b.record_path AS file,b.record_sha256 AS hash,
        (SELECT min(t.account_id) FROM spending_observation o JOIN spending_transaction t ON t.id=o.transaction_id
          WHERE o.batch_id=b.id AND json_extract(t.payload,'$.kind') IN ('purchase','refund')
          HAVING count(DISTINCT t.account_id)=1) AS accountId
      FROM spending_batch b WHERE b.source='reviewed-simplefin-robinhood-card'
    `).all() as { file: string; hash: string; accountId: string | null }[]
    for (const entry of robinhood) {
      try {
        const receipt = readArchive(entry.file, entry.hash)
        if (!entry.accountId || !Array.isArray(receipt.held)) throw new Error('invalid_held_rows')
        for (const row of receipt.held) {
          if (!object(row) || !Number.isSafeInteger(row.row) || typeof row.row !== 'number' || typeof row.reason !== 'string') {
            throw new Error('invalid_held_row')
          }
          holds.push({
            ...emptyHold(entry.accountId, 'simplefin', row.row, row.reason),
            date: strictIsoDate(row.postedDate), currency: 'USD',
            amountMinor: typeof row.amountMinor === 'number' && Number.isSafeInteger(row.amountMinor) ? row.amountMinor : null,
          })
        }
      } catch {
        reviewIncomplete = true
      }
    }

    if (hasTable('spending_snaptrade')) {
      const batches = db.prepare(`
        SELECT s.batch_id AS id,s.account_id AS accountId,s.held,b.record_path AS file,b.record_sha256 AS hash
        FROM spending_snaptrade s JOIN spending_batch b ON b.id=s.batch_id ORDER BY b.applied_at,b.id
      `).all() as { id: string; accountId: string; held: string; file: string; hash: string }[]
      const resolutions = new Set<string>()
      for (const batch of batches) {
        try {
          const archive = readArchive(batch.file, batch.hash)
          if (typeof archive.supersedesHoldInBatch !== 'string' || !object(archive.heldPair) || !object(archive.review)) continue
          if (db.prepare('SELECT 1 FROM spending_transaction WHERE account_id=? AND source_id=?')
            .get(batch.accountId, archive.review.sourceId)) {
            const prior = archive.supersedesHoldInBatch
            if (batches.some(other => other.id === prior && other.accountId === batch.accountId)) {
              resolutions.add(`${prior}:chase:${archive.heldPair.chaseRow}`)
              resolutions.add(`${prior}:snaptrade:${archive.heldPair.snaptradeRow}`)
            }
          }
        } catch {
          reviewIncomplete = true
        }
      }
      for (const batch of batches) {
        for (const row of JSON.parse(batch.held) as { source: 'chase' | 'snaptrade'; row: number; reason: string }[]) {
          if (!resolutions.has(`${batch.id}:${row.source}:${row.row}`)) {
            holds.push(emptyHold(batch.accountId, row.source, row.row, row.reason))
          }
        }
      }
    }

    return { rows, coverage, holds, reviewIncomplete }
  } finally {
    db.close()
  }
}
