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
  })
  store.events.find(event => event.id === 'payment')!.review = 'unreviewed'
  assert.deepEqual(snapshotTaxPayments(store), [{ ...payment, principal: null }])
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
  }])
})
