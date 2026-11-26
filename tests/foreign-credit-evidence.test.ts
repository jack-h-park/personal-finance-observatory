import assert from 'node:assert/strict'
import test from 'node:test'
import { projectForeignCreditRecords, readForeignCreditFacts } from '@/lib/application/foreign-credit-evidence'
import { emptyTaxHistory } from '@/lib/domain/taxes/history'

const hash = 'a'.repeat(64)
const row = {
  taxReturnId: 'return', evidenceId: 'pdf', sha256: hash, page: 12, year: 2025,
  authority: 'us', category: 'general-income', eligibleMinor: '130000', limitMinor: '50000', appliedMinor: '50000',
}
function fixture() {
  const store = emptyTaxHistory()
  store.taxUnits.push({ id: 'unit', recordRevision: 1, year: 2025, kind: 'individual', ownerIds: ['synthetic'] })
  store.evidence.push({ id: 'pdf', recordRevision: 1, root: 'tax', relativePath: 'sample.pdf', sha256: hash })
  store.obligations.push({ id: 'income', recordRevision: 1, taxUnitId: 'unit', taxYear: 2025,
    authority: 'US:federal', taxType: 'income', currency: 'USD', coverageConfirmed: true,
    effectiveBasis: { kind: 'return', id: 'return', recordRevision: 1, reviewedAt: '2026-05-01', evidenceIds: ['pdf'] },
  })
  store.returns.push({ id: 'return', recordRevision: 1, obligationId: 'income', status: 'accepted',
    evidenceIds: ['pdf'], liability: { currency: 'USD', minor: '900000' } })
  return store
}

test('requires matching, accepted private evidence and preserves the historical year and locator', () => {
  const facts = readForeignCreditFacts({ version: 1, facts: [row] })
  assert.equal(projectForeignCreditRecords(fixture(), facts)[0]?.source, '/taxes/evidence/pdf')
  assert.equal(projectForeignCreditRecords(fixture(), facts)[0]?.year, 2025)
  assert.equal(projectForeignCreditRecords(fixture(), facts)[0]?.page, 12)
  const changed = fixture()
  changed.evidence[0].sha256 = 'b'.repeat(64)
  assert.deepEqual(projectForeignCreditRecords(changed, facts), [])
  const draft = fixture()
  draft.returns[0].status = 'draft'
  assert.deepEqual(projectForeignCreditRecords(draft, facts), [])
  const stale = fixture()
  stale.returns[0].recordRevision = 2
  assert.deepEqual(projectForeignCreditRecords(stale, facts), [])
  const missingReview = fixture()
  missingReview.obligations[0].effectiveBasis!.evidenceIds = ['missing']
  assert.deepEqual(projectForeignCreditRecords(missingReview, facts), [])
  const removedUnit = fixture()
  removedUnit.taxUnits[0].deleted = true
  assert.deepEqual(projectForeignCreditRecords(removedUnit, facts), [])
})

test('keeps blanks unknown, accepts a documented zero and rejects malformed amounts', () => {
  const zero = readForeignCreditFacts({ version: 1, facts: [{ ...row, limitMinor: null, eligibleMinor: '0', appliedMinor: null }] })
  assert.equal(projectForeignCreditRecords(fixture(), zero)[0]?.eligibleMinor, '0')
  for (const value of ['-1', '1.5', '1e3', '']) {
    assert.throws(() => readForeignCreditFacts({ version: 1, facts: [{ ...row, eligibleMinor: value }] }))
  }
})
