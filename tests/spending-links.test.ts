import assert from 'node:assert/strict'
import test from 'node:test'
import { withParam } from '../lib/table-filter'
import { resolveSpendingView, spendingFilterParams, spendingHref } from '../lib/spending-links'

test('a link keeps the period and account and drops empty options', () => {
  assert.equal(
    spendingHref('transactions', { period: 'ytd', account: 'card' }, { month: '2026-03', currency: undefined }),
    '/spending?view=transactions&period=ytd&account=card&month=2026-03',
  )
  assert.equal(spendingHref('summary', { period: 12 }), '/spending?view=summary&period=12')
})

test('an empty account option clears the account', () => {
  assert.equal(spendingHref('summary', { period: 24, account: 'card' }, { account: '' }), '/spending?view=summary&period=24')
})

test('filter params carry the tab and every filter but not the page or the selected transaction', () => {
  assert.deepEqual(
    spendingFilterParams({ view: 'transactions', period: 'lastYear', account: 'card', month: '2025-03', category: 'Travel' }),
    { view: 'transactions', period: 'lastYear', account: 'card', month: '2025-03', category: 'Travel' },
  )
  assert.deepEqual(spendingFilterParams({ view: 'summary', period: 12 }), { view: 'summary' })
})

test('changing one filter through FilterBar keeps the tab and the others', () => {
  const params = spendingFilterParams({ view: 'transactions', period: 'ytd', account: 'card' })
  assert.equal(withParam('/spending', params, 'period', 'lastYear'), '/spending?view=transactions&account=card&period=lastYear')
  assert.equal(withParam('/spending', params, 'account', null), '/spending?view=transactions&period=ytd')
})

test('the tab follows the request, and a month or page opens transactions', () => {
  assert.equal(resolveSpendingView(undefined, {}), 'summary')
  assert.equal(resolveSpendingView('review', { month: '2026-03' }), 'review')
  assert.equal(resolveSpendingView('transactions', {}), 'transactions')
  assert.equal(resolveSpendingView(undefined, { month: '2026-03' }), 'transactions')
  assert.equal(resolveSpendingView('summary', { page: '2' }), 'transactions')
  assert.equal(resolveSpendingView('bogus', {}), 'summary')
})

test('filter params carry the transaction kind and sort only when they are not the defaults', () => {
  assert.deepEqual(spendingFilterParams({ view: 'transactions', period: 12, kinds: 'all', sort: 'largest' }), { view: 'transactions', kinds: 'all', sort: 'largest' })
  assert.deepEqual(spendingFilterParams({ view: 'transactions', period: 12, kinds: 'spending', sort: 'recent' }), { view: 'transactions' })
})
