import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import Database from 'better-sqlite3'

const examples = path.resolve('examples/spending')
const scratch = process.env.SPENDING_TEST_ROOT ?? os.tmpdir()
fs.mkdirSync(scratch, { recursive: true })

function pilot(t: TestContext) {
  const workspace = fs.mkdtempSync(path.resolve(scratch, 'spending-test-'))
  t.after(() => fs.rmSync(workspace, { force: true, recursive: true }))
  const state = path.join(workspace, 'private-data/personal-finance-sample/state/spending.sqlite')
  const records = path.join(workspace, 'private-data/personal-finance-sample/records/spending')
  function run(file: string, ...args: string[]) {
    const input = path.isAbsolute(file) ? file : path.join(examples, file)
    return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-spending.ts',
      '--workspace', workspace, '--accounts', path.join(examples, 'accounts.json'), '--input', input, ...args],
    { encoding: 'utf8' })
  }
  function success(file: string, ...args: string[]) {
    const result = run(file, ...args)
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  function apply(file: string, ...args: string[]) {
    const { reviewToken } = success(file, ...args)
    return success(file, ...args, '--apply', '--review-token', reviewToken)
  }
  function json(name: string, edit: (body: { periodStart: string; status: string; transactions: Record<string, unknown>[] }) => void) {
    const body = JSON.parse(fs.readFileSync(path.join(examples, 'api.json'), 'utf8'))
    edit(body)
    const target = path.join(workspace, name)
    fs.writeFileSync(target, JSON.stringify(body))
    return target
  }
  return { workspace, state, records, run, success, apply, json }
}

const first = ['--source', 'synthetic-file', '--from', '2026-10-01', '--to', '2026-11-10']
const overlap = ['--source', 'synthetic-file', '--from', '2026-11-01', '--to', '2026-11-30']

test('preview stays read-only and CSV replay preserves repeat purchases, FX, refund and exclusions', (t) => {
  const p = pilot(t)
  const preview = p.success('first.csv', ...first)
  assert.deepEqual(fs.readdirSync(p.workspace), [])
  assert.equal(preview.inserted, 8)
  assert.equal(preview.observations, 8)
  const applied = p.success('first.csv', ...first, '--apply', '--review-token', preview.reviewToken)
  assert.deepEqual(applied.totals, [
    { month: '2026-11', currency: 'KRW', purchaseMinor: '18000', refundMinor: '3000', netMinor: '15000' },
    { month: '2026-11', currency: 'USD', purchaseMinor: '2400', refundMinor: '0', netMinor: '2400' },
  ])
  assert.equal(applied.excluded, 4)
  assert.equal(p.success('first.csv', ...first, '--apply', '--review-token', preview.reviewToken).status, 'already_applied')
  assert.deepEqual(p.apply('overlap.csv', ...overlap).totals, applied.totals)
  assert.equal(fs.readdirSync(p.records).length, 2)
  const db = new Database(p.state, { readonly: true })
  t.after(() => db.close())
  assert.equal(db.prepare('SELECT count(*) AS n FROM spending_transaction').pluck().get(), 8)
  assert.equal(db.prepare('SELECT count(*) AS n FROM spending_observation').pluck().get(), 12)
  assert.deepEqual(db.prepare("SELECT json_extract(payload, '$.originalCurrency') AS currency, json_extract(payload, '$.originalAmountMinor') AS amount FROM spending_transaction WHERE json_extract(payload, '$.originalCurrency') IS NOT NULL").get(), { currency: 'USD', amount: -1300 })
  assert.deepEqual(db.prepare(`
    SELECT refund.source_id AS refund, purchase.source_id AS purchase
    FROM spending_refund_link AS link
    JOIN spending_transaction AS refund ON refund.id = link.refund_id
    JOIN spending_transaction AS purchase ON purchase.id = link.purchase_id
  `).get(), { refund: 'kr-refund', purchase: 'kr-purchase' })
  assert.deepEqual(db.prepare(`
    SELECT json_extract(payload, '$.transferRef') AS ref, count(*) AS legs
    FROM spending_transaction
    WHERE ref IS NOT NULL GROUP BY ref ORDER BY ref
  `).all(), [{ ref: 'autopay-1', legs: 2 }, { ref: 'remittance-1', legs: 2 }])
})

test('API batch uses the same ledger, holds cross-source collisions, and rejects stale previews', (t) => {
  const p = pilot(t)
  const stale = p.success('api.json')
  p.apply('first.csv', ...first)
  assert.match(p.run('api.json', '--apply', '--review-token', stale.reviewToken).stderr, /stale_preview/)
  const applied = p.apply('api.json')
  assert.equal(applied.inserted, 1)
  assert.equal(applied.totals.find((x: { currency: string }) => x.currency === 'USD').netMinor, '3100')
  const replay = p.json('api-overlap.json', (batch) => { batch.periodStart = '2026-10-15' })
  assert.equal(p.apply(replay).matched, 1)
  const conflict = p.json('conflict.json', (batch) => {
    Object.assign(batch.transactions[0], { postedDate: '2026-11-04', amountMinor: -1200, sourceId: 'potential-copy' })
  })
  const preview = p.success(conflict)
  assert.deepEqual(preview.issues, [{ row: 1, code: 'possible_duplicate' }])
  assert.match(p.run(conflict, '--apply', '--review-token', preview.reviewToken).stderr, /review_required/)
  assert.deepEqual(p.success('api.json').totals, applied.totals)
})

test('invalid account, partial API data and changed stable ID leave existing ledger intact', (t) => {
  const p = pilot(t)
  p.apply('api.json')
  const invalidAccount = p.json('unknown.json', (batch) => { batch.transactions[0].accountId = 'unknown' })
  assert.match(p.run(invalidAccount).stderr, /unknown_account/)
  const partial = p.json('partial.json', (batch) => { batch.status = 'partial' })
  assert.match(p.run(partial).stderr, /invalid_batch/)
  const edited = p.json('edited.json', (batch) => { batch.transactions[0].amountMinor = -900 })
  assert.deepEqual(p.success(edited).issues, [{ row: 1, code: 'changed_source_transaction' }])
  assert.equal(fs.readdirSync(p.records).length, 1)
})
