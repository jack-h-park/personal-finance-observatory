import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import Database from 'better-sqlite3'
import { loadSimplefinSpending, prepareSimplefinSpending } from '../lib/adapters/spending-simplefin'
import { importSpending } from '../lib/adapters/spending-store'
import { spendingAccountIds } from '../lib/domain/spending-import'

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
  const candidate = importSpending(p.input(incoming)).held?.[0]
  assert.equal(candidate && 'linkCandidateId' in candidate && candidate.linkCandidateId, target)
  const repeated = snapshot('ambiguous', [checking[0], tx('other-retail', '-20.00', 'Known shop')])
  const reviewed = { schemaVersion: 1, decisions: [{ ...decisions.decisions[0], linkToTransactionId: target }] }
  const preview = importSpending(p.input(repeated, reviewed))
  assert.equal(preview.matched, 0)
  assert.deepEqual(preview.held?.map(row => row.reason), ['reviewed_link_mismatch', 'unreviewed_transaction'])
})

test('repeated card purchases link only with evidence for the exact SimpleFIN account and transaction', (t) => {
  const p = pilot(t)
  const txs = [checking[0], { ...checking[0], providerTransactionId: 'second' }]
  const run = snapshot('repeated-card', txs)
  run.data.accounts[0].name = 'Example Credit Card'
  const cardBinding = { ...binding, accountKind: 'credit_card' }
  const baseDecisions = txs.map(x => ({ ...decision(x.providerTransactionId, -2000, x.description, 'purchase'), postedDate: '2026-11-11' }))
  function incoming(reviewed: unknown) {
    return { ...p.input(), ...prepareSimplefinSpending({ run, binding: cardBinding, decisions: reviewed, accountIds: accounts,
      manifestSha256: descriptionSha256(run.manifest.runId), connectionKey: run.manifest.connectionKey }) }
  }
  const first = incoming({ schemaVersion: 1, decisions: baseDecisions })
  const seed = { ...first, savedBank: undefined, batch: { ...first.batch, source: 'reviewed-saved-card' } }
  importSpending({ ...seed, reviewToken: importSpending(seed).reviewToken })
  const db = new Database(p.ledgerPath)
  t.after(() => db.close())
  const target = db.prepare('SELECT id FROM spending_transaction WHERE source_id = ?').pluck()
  const links = baseDecisions.map(row => ({ ...row, linkToTransactionId: target.get(row.sourceId),
    targetDescriptionSha256: row.descriptionSha256 }))
  const reviewed = incoming({ schemaVersion: 1, decisions: links })
  db.exec('CREATE TABLE spending_us_provider_evidence (account_id, provider_scope, source_id, transaction_id, fingerprint)')
  const notice = db.prepare('INSERT INTO spending_us_provider_evidence VALUES (?, ?, ?, ?, ?)')
  const scope = descriptionSha256(JSON.stringify(['simplefin-card', [binding.connectionId, binding.providerAccountId]]))
  const legacyFingerprint = (row: typeof links[number]) => descriptionSha256(JSON.stringify({
    amountMinor: row.amountMinor, descriptionSha256: row.descriptionSha256, postedDate: row.postedDate, sourceId: row.sourceId,
  }))
  notice.run(binding.accountId, scope, links[0].sourceId, links[0].linkToTransactionId, legacyFingerprint(links[0]))
  notice.run(binding.accountId, 'other-provider-account', links[1].sourceId, links[1].linkToTransactionId, legacyFingerprint(links[1]))
  assert.equal(importSpending(reviewed).matched, 1)
  assert.equal(importSpending(reviewed).held?.length, 1)
  notice.run(binding.accountId, scope, links[1].sourceId, links[1].linkToTransactionId, legacyFingerprint(links[1]))
  const swapped = incoming({ schemaVersion: 1, decisions: [
    { ...links[0], linkToTransactionId: links[1].linkToTransactionId }, links[1],
  ] })
  assert.equal(importSpending(swapped).held?.length, 1)
  const original = run.data.transactions[1]
  run.data.transactions[1] = { ...original, description: 'Changed card description' }
  const revised = incoming({ schemaVersion: 1, decisions: [links[0],
    { ...links[1], descriptionSha256: descriptionSha256('Changed card description') },
  ] })
  assert.equal(importSpending(revised).held?.length, 1)
  run.data.transactions[1] = original
  const preview = importSpending(reviewed)
  assert.equal(preview.matched, 2)
  assert.equal(preview.inserted, 0)
  assert.deepEqual(preview.held, [])
  importSpending({ ...reviewed, reviewToken: preview.reviewToken })
  assert.equal(db.prepare('SELECT count(*) FROM spending_transaction').pluck().get(), 2)
})

test('two approved credit card scopes coexist with the legacy checking scope and replay without changing spend', (t) => {
  const p = pilot(t)
  const legacy = p.input()
  importSpending({ ...legacy, reviewToken: importSpending(legacy).reviewToken })
  const db = new Database(p.ledgerPath)
  t.after(() => db.close())
  db.exec('DROP TABLE spending_saved_bank_scope')

  const inventory = spendingAccountIds({ accounts: Object.fromEntries(
    [['Amex credit card', 'amex', 'card-one'], ['Synchrony credit card', 'synchrony', 'card-two']].map(
      ([label, providerId, accountId]) => [label, { institution: providerId, inventory: {
        role: 'primary', accountId, providerId, owner: { state: 'confirmed', ownerId: 'test-owner' },
        dimensions: { wrappers: ['credit-card'], assetClasses: [] }, lifecycle: { state: 'active' },
        requirements: [{ kind: 'activity', freshnessPolicyId: 'bank-30' }],
      } }],
    ),
  ) })
  assert.deepEqual([...inventory], ['card-one', 'card-two'])
  const rows = [tx('purchase-1', '-8.22', 'Sample retail'), tx('purchase-2', '-8.22', 'Sample retail'),
    tx('refund', '1.50', 'Sample retail'), tx('payment', '50.00', 'Payment'),
    tx('benefit', '2.00', 'Card benefit')]
  const review = { schemaVersion: 1, decisions: [
    decision('purchase-1', -822, 'Sample retail', 'purchase'), decision('purchase-2', -822, 'Sample retail', 'purchase'),
    decision('refund', 150, 'Sample retail', 'refund'), decision('payment', 5000, 'Payment', 'card_payment'),
    decision('benefit', 200, 'Card benefit', 'other'),
  ].map(row => ({ ...row, postedDate: '2026-11-11' })) }

  function card(accountId: string, runId: string, providerAccountId = accountId, connectionKey = accountId) {
    const run = snapshot(runId, rows)
    const cardBinding = { ...binding, accountId, providerAccountId, accountKind: 'credit_card' }
    Object.assign(run.manifest, { connectionKey, accountIds: [providerAccountId] })
    Object.assign(run.data.accounts[0], { providerAccountId, name: 'Example Credit Card' })
    const prepared = prepareSimplefinSpending({ run, binding: cardBinding, decisions: review,
      accountIds: new Set([accountId]), manifestSha256: descriptionSha256(runId), connectionKey })
    return { ...p.input(), ...prepared }
  }

  for (const name of ['card-one', 'card-two']) {
    const input = card(name, name + '-first')
    const preview = importSpending(input)
    assert.equal(preview.inserted, 5)
    assert.equal(preview.pendingIgnored, 1)
    assert.deepEqual(preview.held, [])
    const applied = importSpending({ ...input, reviewToken: preview.reviewToken })
    assert.equal(applied.excluded, name === 'card-one' ? 5 : 7)
    const net = applied.totals[0].netMinor
    assert.equal(net, name === 'card-one' ? '3494' : '4988')

    const alternate = card(name, name + '-overlap')
    const overlap = importSpending(alternate)
    assert.equal(overlap.inserted, 0)
    assert.equal(overlap.matched, 5)
    assert.deepEqual(importSpending({ ...alternate, reviewToken: overlap.reviewToken }).totals, applied.totals)
  }
  assert.equal(importSpending(p.input(snapshot('legacy-overlap'))).matched, 4)
  assert.throws(() => importSpending(card('card-one', 'new-binding', 'different-provider')), /offline_scope_changed/)
  assert.throws(() => importSpending(card('card-three', 'reused-binding', 'card-one')), /offline_scope_changed/)
  assert.throws(() => importSpending(card(binding.accountId, 'wrong-kind')), /offline_scope_changed/)
  assert.equal(db.prepare('SELECT count(*) FROM spending_transaction').pluck().get(), 14)
})

test('the saved-run loader accepts a pinned BofA card name without breaking an existing scope', async (t) => {
  const p = pilot(t)
  const run = snapshot('issuer-card')
  const accountName = 'Example Cash Rewards Visa Signature (6265)'
  run.manifest.connectionKey = 'bofa-card'
  run.data.accounts[0].name = 'Example Credit Card'
  const cardBinding = { ...binding, accountKind: 'credit_card', expectedAccountName: accountName }
  const cardDecisions = { ...decisions, decisions: decisions.decisions.map(row => ({ ...row, postedDate: '2026-11-11' })) }
  const input = { run, binding: { ...binding, accountKind: 'credit_card' }, decisions: cardDecisions, accountIds: accounts,
    manifestSha256: descriptionSha256('issuer-card'), connectionKey: run.manifest.connectionKey }
  const first = { ...p.input(), ...prepareSimplefinSpending(input) }
  importSpending({ ...first, reviewToken: importSpending(first).reviewToken })

  run.manifest.runId = 'issuer-card-renamed'
  run.data.accounts[0].name = accountName
  const connector = path.join(p.root, 'connector')
  const modules = path.join(connector, 'dist/providers/simplefin')
  fs.mkdirSync(modules, { recursive: true })
  const write = (name: string, data: unknown) => {
    const file = path.join(p.root, name)
    fs.writeFileSync(file, JSON.stringify(data))
    return file
  }
  fs.writeFileSync(path.join(modules, 'config.js'), 'exports.loadBankConfig = value => value')
  fs.writeFileSync(path.join(modules, 'storage.js'), `exports.readBankRun = () => (${JSON.stringify(run)})`)
  for (const institutionDomain of ['bankofamerica.com', 'chase.com', 'robinhood.com']) {
    const loaded = await loadSimplefinSpending({ connectorRepo: connector, accountIds: accounts,
      pointer: write('pointer.json', { ...run.manifest, manifestSha256: descriptionSha256(run.manifest.runId) }),
      config: write('config.json', { ...run.manifest, institutionDomain }),
      binding: write('binding.json', cardBinding), decisions: write('decisions.json', cardDecisions) })
    const preview = importSpending({ ...first, ...loaded })
    assert.equal(preview.matched, 4)
    assert.equal(preview.inserted, 0)
  }
  assert.throws(() => prepareSimplefinSpending({ ...input,
    binding: { ...cardBinding, accountKind: 'checking' } }), /invalid_simplefin_binding/)
  run.data.accounts[0].name = 'Another Credit Card (6265)'
  assert.throws(() => prepareSimplefinSpending({ ...input, binding: cardBinding }), /simplefin_account_mismatch/)
})

test('an explicit deposit binding preserves a reviewed cross-source merchant alias', (t) => {
  const p = pilot(t)
  const baseline = p.input(snapshot('seed-deposit', [checking[0]]))
  const seed = { ...baseline, savedBank: undefined, batch: { ...baseline.batch, source: 'reviewed-csv' } }
  importSpending({ ...seed, reviewToken: importSpending(seed).reviewToken })
  const db = new Database(p.ledgerPath, { readonly: true })
  t.after(() => db.close())
  const id = db.prepare('select id from spending_transaction').pluck().get() as string
  const row = tx('retail-deposit', '-20.00', 'Known shop issuer alias')
  const incoming = snapshot('deposit-1', [row])
  incoming.data.accounts[0].name = 'Example Adv Plus Banking'
  const reviewed = decision('retail-deposit', -2000, row.description, 'purchase')
  const input = (expected: string) => ({ ...baseline, ...prepareSimplefinSpending({
    run: incoming, binding: { ...binding, accountKind: 'checking' },
    decisions: { schemaVersion: 1, decisions: [{ ...reviewed, linkToTransactionId: id, targetDescriptionSha256: expected }] },
    accountIds: accounts, manifestSha256: descriptionSha256('deposit-1'), connectionKey: 'chase-checking',
  }) })
  assert.equal(importSpending(input(descriptionSha256('different shop'))).held?.[0].reason, 'reviewed_link_mismatch')
  const good = input(descriptionSha256('Known shop'))
  const preview = importSpending(good)
  assert.equal(preview.matched, 1)
  assert.equal(preview.inserted, 0)
  assert.deepEqual(preview.held, [])
  assert.equal(importSpending({ ...good, reviewToken: preview.reviewToken }).status, 'applied')
  assert.equal(db.prepare('select count(*) from spending_transaction').pluck().get(), 1)
})

test('Robinhood checking and savings loads remain scoped to their verified account', async (t) => {
  for (const [accountKind, name] of [['checking', 'Checking (8149)'], ['savings', 'Savings (6227)']]) {
    const p = pilot(t)
    const connector = path.join(p.root, 'connector')
    const modules = path.join(connector, 'dist/providers/simplefin')
    fs.mkdirSync(modules, { recursive: true })
    fs.writeFileSync(path.join(modules, 'config.js'), 'exports.loadBankConfig = value => value')
    fs.writeFileSync(path.join(modules, 'storage.js'), 'exports.readBankRun = config => config.fixture')
    const write = (name: string, data: unknown) => {
      const file = path.join(p.root, name)
      fs.writeFileSync(file, JSON.stringify(data))
      return file
    }
    const run = snapshot(accountKind, [checking[0]])
    run.data.accounts[0].name = name
    const config = { ...run.manifest, institutionDomain: 'robinhood.com', fixture: run }
    const load = (changedBinding = binding, institutionDomain = config.institutionDomain) => loadSimplefinSpending({
      connectorRepo: connector, accountIds: accounts,
      pointer: write('pointer.json', { ...run.manifest, manifestSha256: descriptionSha256(run.manifest.runId) }),
      config: write('config.json', { ...config, institutionDomain }),
      binding: write('binding.json', { ...changedBinding, accountKind }), decisions: write('decisions.json', decisions),
    })
    const input = { ...p.input(), ...await load() }
    const preview = importSpending(input)
    const applied = importSpending({ ...input, reviewToken: preview.reviewToken })
    assert.equal(applied.status, 'applied')
    assert.equal(applied.totals[0].netMinor, '2000')
    assert.equal(importSpending({ ...input, reviewToken: preview.reviewToken }).status, 'already_applied')
    await assert.rejects(load({ ...binding, providerAccountId: 'other-account' }), /simplefin_account_mismatch/)
    await assert.rejects(load(binding, 'unapproved.example'), /invalid_simplefin_config/)
  }
})
