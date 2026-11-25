import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import type { SnaptradeHold } from '../lib/adapters/spending-store'

type Activity = readonly [id: string, description: string, amount: number, type: string]

test('SnapTrade CLI previews, holds uncertain rows, and preserves totals on replay and overlap', (t) => {
  const root = fs.mkdtempSync(path.resolve(process.env.SPENDING_TEST_ROOT ?? os.tmpdir(), 'spending-snaptrade-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (name: string, data: unknown) => {
    const file = path.join(root, name)
    fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
    return file
  }
  const binding = { accountId: 'sample-card', providerAccountId: 'provider-card', maskedSuffix: '1234' }
  const accounts = write('accounts.json', { accounts: { 'Chase Card': { institution: 'chase', inventory: {
    role: 'primary', accountId: binding.accountId, providerId: 'chase', owner: { state: 'confirmed', ownerId: 'self' },
    dimensions: { wrappers: [], assetClasses: [] }, lifecycle: { state: 'active' }, requirements: [],
  } } } })
  const bindingFile = write('binding.json', binding)
  const rows: Activity[] = [
    ['p1', 'Store', -20, 'Sale'], ['p2', 'Store', -20, 'Sale'],
    ['r', 'Store', 4, 'Return'], ['pay', 'Payment', 30, 'Payment'],
    ['annual', 'ANNUAL FEE REFUND', 1, 'Refund'],
    ['ride', 'RIDESHARE CREDIT $50/YEAR', 5, 'Adjustment'],
    ['inflight', 'UA INFLIGHT/INCLUB CREDIT', 2.50, 'Adjustment'],
    ['unknown', 'Other adjustment', 2, 'Adjustment'],
    ['ambiguous', 'Provider label', -3, 'Sale'],
  ]
  const csvLine = (desc: string, amount: number, type: string) => `11/05/2026,11/06/2026,"${desc}",,${type},${amount},`
  const csv = (lines: string[]) => ['Transaction Date,Post Date,Description,Category,Type,Amount,Memo', ...lines].join('\r\n') + '\r\n'
  const issuer = write('chase.csv', csv([...rows.slice(0, -1).map(([, desc, amount, type]) => csvLine(desc, amount, type)),
    csvLine('Candidate A', -3, 'Sale'), csvLine('Candidate B', -3, 'Sale')]))
  function snapshot(name: string, data: readonly Activity[]) {
    return write(name, {
      fetchedAt: '2026-11-22T18:00:00.000Z',
      account: { maskedSuffix: '1234', id: binding.providerAccountId, product: 'Freedom Unlimited', rawType: 'CREDITCARD' },
      pagination: { offset: 0, total: data.length, limit: 1000 },
      data: data.map(([id, description, amount]) => ({ id, description, amount, currency: { code: 'USD' },
        type: 'CREDIT_TRANSACTION', trade_date: '2026-11-05T00:00:00Z', settlement_date: '2026-11-06T00:00:00Z' })),
    })
  }
  function run(input: string, chaseCsv: string, ...flags: string[]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-spending.ts',
      '--workspace', root, '--accounts', accounts, '--input', input, '--chase-csv', chaseCsv, '--binding', bindingFile, ...flags], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  const first = snapshot('snaptrade.json', rows)
  const invalidWindow = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-spending.ts',
    '--workspace', root, '--accounts', accounts, '--input', first, '--chase-csv', issuer,
    '--binding', bindingFile, '--from', '2026-11-07', '--to', '2026-11-09'], { encoding: 'utf8' })
  assert.notEqual(invalidWindow.status, 0)
  assert.match(invalidWindow.stderr, /snaptrade_chase_outside_review_window/)
  const preview = run(first, issuer, '--from', '2026-11-06', '--to', '2026-11-06')
  assert.equal(preview.status, 'preview')
  assert.equal(preview.inserted, 7)
  assert.deepEqual(preview.held.map((row: SnaptradeHold) => row.reason).sort(),
    ['ambiguous_match', 'ambiguous_match', 'ambiguous_match', 'unclassified_issuer_type'])
  const ledger = path.join(root, 'private-data/personal-finance-offline/state/spending.sqlite')
  assert.equal(fs.existsSync(ledger), false)
  const applied = run(first, issuer, '--apply', '--review-token', preview.reviewToken)
  assert.equal(applied.status, 'applied')
  assert.equal(applied.excluded, 4)
  assert.deepEqual(applied.totals, [{ month: '2026-11', currency: 'USD', purchaseMinor: '4000', refundMinor: '400', netMinor: '3600' }])
  const replay = run(first, issuer)
  assert.equal(replay.status, 'already_applied')
  assert.deepEqual(replay.held, preview.held)

  const overlap = snapshot('overlap.json', [rows[3], rows[2]])
  const subset = write('overlap.csv', csv([csvLine('Store', 4, 'Return'), csvLine('Payment', 30, 'Payment')]))
  const overlapPreview = run(overlap, subset)
  assert.equal(overlapPreview.inserted, 0)
  assert.equal(overlapPreview.matched, 2)
  assert.deepEqual(run(overlap, subset, '--apply', '--review-token', overlapPreview.reviewToken).totals, applied.totals)
  const replacement = snapshot('changed-source.json', [['p1', 'Changed provider label', -20, 'Sale']])
  const singleSale = write('single.csv', csv([csvLine('Store', -20, 'Sale')]))
  const changed = run(replacement, write('revised.csv', csv([csvLine('Changed issuer label', -20, 'Sale')])))
  assert.equal(changed.inserted, 0)
  assert.deepEqual(changed.held, [{ source: 'snaptrade', row: 1, reason: 'changed_source_transaction' }])
  assert.deepEqual(changed.fallbackMatches, [{ snaptradeRow: 1, chaseRow: 1 }])
  const rotated = snapshot('rotated-id.json', [['rotated', 'Store', -20, 'Sale']])
  const possibleDuplicate = run(rotated, singleSale)
  assert.equal(possibleDuplicate.inserted, 0)
  assert.deepEqual(possibleDuplicate.held, [{ source: 'snaptrade', row: 1, reason: 'possible_duplicate' }])
  const db = new Database(ledger, { readonly: true })
  try {
    assert.equal(db.prepare('SELECT count(*) FROM spending_transaction').pluck().get(), 7)
    assert.equal(db.prepare('SELECT count(*) FROM spending_observation').pluck().get(), 9)
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  } finally {
    db.close()
  }
})
