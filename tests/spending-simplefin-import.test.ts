import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import Database from 'better-sqlite3'
import { prepareSimplefinSpending } from '../lib/adapters/spending-simplefin'
import { importSpending } from '../lib/adapters/spending-store'

const binding = { accountId: 'test-checking', providerAccountId: 'provider-account', connectionId: 'connection-id' }
const accounts = new Set([binding.accountId])
const descriptionSha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const postedAt = '2026-11-11T01:00:00.000Z'
const postedDate = '2026-11-10' // New York date differs from UTC.
const accountRef = 'test-account-ref'
const tx = (providerTransactionId: string, amount: string, description: string) => ({
  accountRef, providerTransactionId, postedAt, amount, description, currency: 'USD', state: 'posted',
})
const checking = [
  tx('retail', '-20.00', 'Known shop'),
  tx('payment', '-16.00', 'Known card payment'),
  tx('transfer', '-40.00', 'Known self transfer'),
  tx('deposit', '80.00', 'Known deposit'),
  tx('unknown', '-6.00', 'Unresolved'),
]
function decision(sourceId: string, amountMinor: number, description: string, kind: string) {
  return { sourceId, postedDate, amountMinor, descriptionSha256: descriptionSha256(description), kind, basis: 'Reviewed fixture evidence' }
}
const decisions = { schemaVersion: 1, decisions: [
  decision('retail', -2000, 'Known shop', 'purchase'),
  decision('payment', -1600, 'Known card payment', 'card_payment'),
  decision('transfer', -4000, 'Known self transfer', 'own_transfer'),
  decision('deposit', 8000, 'Known deposit', 'other'),
] }

function snapshot(runId: string, transactions = checking) {
  return {
    manifest: { schemaVersion: 'banking/1.0', provider: 'simplefin', environment: 'live', sample: false, runId,
      fetchedAt: '2026-11-22T17:17:29.000Z', connectionKey: 'chase-checking',
      connectionId: binding.connectionId, accountIds: [binding.providerAccountId] },
    data: {
      accounts: [{ providerAccountId: binding.providerAccountId, connectionId: binding.connectionId, accountRef, currency: 'USD', name: 'Example Chase Checking' }],
      transactions,
      'pending-transactions': [{ ...tx('pending', '-3.00', 'Pending'), state: 'pending', postedAt: null }],
    },
  }
}

function pilot(t: TestContext) {
  const root = fs.mkdtempSync(path.resolve(process.env.SPENDING_TEST_ROOT ?? os.tmpdir(), 'spending-simplefin-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const ledgerPath = path.join(root, 'state/spending.sqlite')
  const recordsDir = path.join(root, 'records')
  function input(run = snapshot('run-one'), reviewed: unknown = decisions) {
    const prepared = prepareSimplefinSpending({
      run, binding, decisions: reviewed, accountIds: accounts, manifestSha256: descriptionSha256(run.manifest.runId),
      connectionKey: 'chase-checking',
    })
    return { ...prepared, inventorySha256: 'fixture-inventory', ledgerPath, recordsDir }
  }
  return { ledgerPath, root, input }
}

test('saved SimpleFIN preview and replay exclude card payments and self transfers and retain held rows', (t) => {
  const p = pilot(t)
  const unreviewed = importSpending(p.input(snapshot('run-one'), { schemaVersion: 1, decisions: [] }))
  assert.equal(unreviewed.inserted, 0)
  assert.equal(unreviewed.held?.length, 5)
  const first = p.input()
  const preview = importSpending(first)
  assert.deepEqual(fs.readdirSync(p.root), [])
  assert.equal(preview.inserted, 4)
  assert.equal(preview.pendingIgnored, 1)
  assert.deepEqual(preview.held?.map(({ row, reason }) => ({ row, reason })), [{ row: 5, reason: 'unreviewed_transaction' }])
  assert.throws(() => importSpending({ ...first, reviewToken: unreviewed.reviewToken }), /stale_preview/)
  const applied = importSpending({ ...first, reviewToken: preview.reviewToken })
  assert.equal(applied.status, 'applied')
  assert.deepEqual(applied.totals, [{ month: '2026-11', currency: 'USD', purchaseMinor: '2000', refundMinor: '0', netMinor: '2000' }])
  assert.equal(applied.excluded, 3)
  assert.equal(importSpending({ ...first, reviewToken: preview.reviewToken }).status, 'already_applied')
  const next = p.input(snapshot('run-two', [...checking].reverse()))
  const overlap = importSpending(next)
  assert.equal(overlap.inserted, 0)
  assert.equal(overlap.matched, 4)
  assert.equal(overlap.pendingIgnored, 1)
  assert.deepEqual(importSpending({ ...next, reviewToken: overlap.reviewToken }).totals, applied.totals)
  const db = new Database(p.ledgerPath, { readonly: true })
  t.after(() => db.close())
  assert.deepEqual(db.prepare("select json_extract(payload,'$.kind') as kind, count(*) as count from spending_transaction group by kind order by kind").all(),
    [{ kind: 'card_payment', count: 1 }, { kind: 'other', count: 1 }, { kind: 'own_transfer', count: 1 }, { kind: 'purchase', count: 1 }])
  assert.equal(db.prepare('select count(*) from spending_saved_bank_hold').pluck().get(), 2)
  assert.equal(db.prepare('select count(*) from spending_observation').pluck().get(), 8)
})

test('saved SimpleFIN provenance and decisions stay bound to the reviewed account and transaction', (t) => {
  const p = pilot(t)
  const wrong = snapshot('wrong-account')
  wrong.data.accounts[0].providerAccountId = 'different-account'
  assert.throws(() => p.input(wrong), /simplefin_account_mismatch/)
  const first = p.input()
  const preview = importSpending(first)
  const changed = checking.map((row, i) => i === 0 ? { ...row, amount: '-22.00' } : row)
  const next = p.input(snapshot('run-changed', changed))
  assert.throws(() => importSpending({ ...next, reviewToken: preview.reviewToken }), /stale_preview/)
  const revised = importSpending(next)
  assert.equal(revised.inserted, 3)
  assert.equal(revised.held?.[0].reason, 'decision_evidence_mismatch')
  importSpending({ ...first, reviewToken: preview.reviewToken })
  const reclassified = p.input(snapshot('run-two'), {
    schemaVersion: 1, decisions: [decision('retail', -2000, 'Known shop', 'other'), ...decisions.decisions.slice(1)],
  })
  const conflict = importSpending(reclassified)
  assert.equal(conflict.held?.[0].reason, 'changed_source_transaction')
  assert.equal(conflict.inserted, 0)
  assert.deepEqual(conflict.totals, preview.totals)
})

test('a reviewed cross-source link preserves the original transaction across saved runs', (t) => {
  const p = pilot(t)
  const first = p.input(snapshot('baseline', [checking[0]]))
  const seed = { ...first, savedBank: undefined, batch: { ...first.batch, source: 'reviewed-csv' } }
  importSpending({ ...seed, reviewToken: importSpending(seed).reviewToken })
  const db = new Database(p.ledgerPath, { readonly: true })
  t.after(() => db.close())
  const target = db.prepare('SELECT id, payload FROM spending_transaction').get() as { id: string; payload: string }
  const reviewed = { schemaVersion: 1, decisions: [{ ...decisions.decisions[0], linkToTransactionId: target.id }] }
  const incoming = p.input(snapshot('incoming', [checking[0]]), reviewed)
  const preview = importSpending(incoming)
  assert.equal(preview.inserted, 0)
  assert.equal(preview.matched, 1)
  assert.deepEqual(preview.held, [])
  assert.equal(importSpending({ ...incoming, reviewToken: preview.reviewToken }).observations, 1)
  assert.equal(importSpending({ ...incoming, reviewToken: preview.reviewToken }).status, 'already_applied')

  const next = p.input(snapshot('overlap', [checking[0]]), reviewed)
  assert.equal(importSpending({ ...next, reviewToken: importSpending(next).reviewToken }).matched, 1)
  const changed = { ...checking[0], description: 'Known  shop' }
  const revision = p.input(snapshot('revision', [changed]), {
    schemaVersion: 1, decisions: [{ ...decision('retail', -2000, changed.description, 'purchase'), linkToTransactionId: target.id }],
  })
  assert.equal(importSpending(revision).held?.[0].reason, 'changed_source_transaction')
  assert.deepEqual(db.prepare('SELECT id, payload FROM spending_transaction').all(), [target])
  assert.equal(db.prepare('SELECT count(*) FROM spending_observation').pluck().get(), 3)
})

test('a second unreviewed posting with the same date and amount blocks a cross-source link', (t) => {
  const p = pilot(t)
  const base = p.input(snapshot('base', [checking[0]]))
  const seed = { ...base, savedBank: undefined, batch: { ...base.batch, source: 'reviewed-csv' } }
  importSpending({ ...seed, reviewToken: importSpending(seed).reviewToken })
  const db = new Database(p.ledgerPath, { readonly: true })
  t.after(() => db.close())
  const target = db.prepare('SELECT id FROM spending_transaction').pluck().get() as string
  const incoming = snapshot('possible-link', [checking[0]])
  assert.equal(importSpending(p.input(incoming)).held?.[0].linkCandidateId, target)
  const repeated = snapshot('ambiguous', [checking[0], tx('other-retail', '-20.00', 'Known shop')])
  const reviewed = { schemaVersion: 1, decisions: [{ ...decisions.decisions[0], linkToTransactionId: target }] }
  const preview = importSpending(p.input(repeated, reviewed))
  assert.equal(preview.matched, 0)
  assert.deepEqual(preview.held?.map(row => row.reason), ['reviewed_link_mismatch', 'unreviewed_transaction'])
})
