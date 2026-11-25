import assert from 'node:assert/strict'
import test from 'node:test'
import example from '../examples/tax-history.synthetic.json'
import { validateTaxHistory } from '../lib/domain/taxes/history'
import { snapshotTaxPayments } from '../lib/application/snapshot-tax-payments'

const fixture = () => validateTaxHistory(structuredClone(example))

test('annual income tax payments cannot be attributed to a stock gain', () => {
  assert.deepEqual(snapshotTaxPayments(fixture()), [])
})

test('capital-gains payments preserve evidenced principal and tax-year scope', () => {
  const store = fixture()
  store.obligations[0].taxType = 'capital-gains'
  const [payment] = snapshotTaxPayments(store)
  assert.deepEqual(payment, {
    id: 'us-2025',
    year: 2025,
    unit: 'self-2025',
    authority: 'US:federal',
    currency: 'USD',
    principal: '8000',
    reportedMinor: null,
  })
  store.events.find(event => event.id === 'payment')!.review = 'unreviewed'
  assert.deepEqual(snapshotTaxPayments(store), [{ ...payment, principal: null, reportedMinor: '12000' }])
})

test('a capital-gains obligation without reviewed payments retains its tax-year row', () => {
  const store = fixture()
  store.obligations[2].taxType = 'capital-gains'
  assert.deepEqual(snapshotTaxPayments(store), [{
    id: 'kr-2025',
    year: 2025,
    unit: 'self-2025',
    authority: 'KR:national',
    currency: 'KRW',
    principal: null,
    reportedMinor: null,
  }])
})

test('a documented return supplies a reference amount until a payment is recorded', () => {
  const store = fixture()
  const obligation = store.obligations[2]
  obligation.taxType = 'capital-gains'
  store.returns.push({
    id: 'kr-draft', recordRevision: 1, obligationId: obligation.id, status: 'draft',
    liability: { currency: 'KRW', minor: '125000' }, evidenceIds: ['doc-1'],
  })
  assert.equal(snapshotTaxPayments(store)[0].reportedMinor, '125000')
  assert.equal(snapshotTaxPayments(store)[0].principal, null)
  store.returns.push({ ...store.returns.at(-1)!, id: 'kr-other' })
  assert.equal(snapshotTaxPayments(store)[0].reportedMinor, null)
  store.returns.at(-1)!.supersedesId = 'kr-draft'
  assert.equal(snapshotTaxPayments(store)[0].reportedMinor, '125000')
  store.evidence[0].deleted = true
  assert.equal(snapshotTaxPayments(store)[0].reportedMinor, null)
})
