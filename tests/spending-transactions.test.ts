import assert from 'node:assert/strict'
import test from 'node:test'
import type { SpendingViewRow } from '../lib/domain/spending-view'
import {
  resolveTransactionOptions,
  spendingAmountMinor,
  visibleTransactions,
} from '../lib/spending-transactions'

const row = (id: string, kind: SpendingViewRow['kind'], amountMinor: number, activityDate = '2026-07-10', currency: 'USD' | 'KRW' = 'KRW'): SpendingViewRow => ({
  id, accountId: 'a', postedDate: activityDate, activityDate, currency, amountMinor, kind, description: id,
})

const rows = [
  row('buy', 'purchase', -5000, '2026-07-01'),
  row('refund', 'refund', 1000, '2026-07-03'),
  row('fee', 'fee', -200, '2026-07-02'),
  row('autopay', 'card_payment', -9000, '2026-07-04'),
  row('move', 'own_transfer', 40000, '2026-07-05'),
  row('misc', 'other', -10, '2026-07-06'),
  row('big', 'purchase', -12000, '2026-06-20'),
]

test('options default to spending rows, newest first, and accept only known values', () => {
  assert.deepEqual(resolveTransactionOptions({}), { kinds: 'spending', sort: 'recent' })
  assert.deepEqual(resolveTransactionOptions({ kinds: 'all', sort: 'largest' }), { kinds: 'all', sort: 'largest' })
  assert.deepEqual(resolveTransactionOptions({ kinds: 'bogus', sort: 'bogus' }), { kinds: 'spending', sort: 'recent' })
})

test('by default payments, transfers and other rows are hidden and counted', () => {
  const result = visibleTransactions(rows, { kinds: 'spending', sort: 'recent' }, () => null)
  assert.deepEqual(result.rows.map(r => r.id), ['refund', 'fee', 'buy', 'big'])
  assert.equal(result.hidden, 3)
})

test('the toggle shows every ledger row', () => {
  const result = visibleTransactions(rows, { kinds: 'all', sort: 'recent' }, () => null)
  assert.equal(result.rows.length, 7)
  assert.equal(result.hidden, 0)
  assert.equal(result.rows[0].id, 'misc')
})

test('largest first orders by the KRW amount spent, and rows without a rate go last', () => {
  const krw = (r: SpendingViewRow) => (r.currency === 'KRW' ? r.amountMinor : null)
  const mixed = [...rows, row('usd', 'purchase', -999999, '2026-07-07', 'USD')]
  const result = visibleTransactions(mixed, { kinds: 'spending', sort: 'largest' }, krw)
  assert.deepEqual(result.rows.map(r => r.id), ['big', 'buy', 'fee', 'refund', 'usd'])
})

test('a spending amount is money out as positive, so a purchase reads positive and a refund negative', () => {
  assert.equal(spendingAmountMinor(row('p', 'purchase', -5000)), 5000)
  assert.equal(spendingAmountMinor(row('r', 'refund', 1000)), -1000)
  assert.equal(spendingAmountMinor(row('t', 'own_transfer', 40000)), -40000)
})
