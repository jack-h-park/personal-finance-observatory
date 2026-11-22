import assert from 'node:assert/strict'
import test from 'node:test'
import { projectSpending, summarizeSpendingAccounts, type SpendingSnapshot } from '../lib/domain/spending-view'
import { spendingPilotEnabled } from '../lib/adapters/spending-view'

test('the spending pilot is opt-in and disabled in production', () => {
  assert.equal(spendingPilotEnabled({ NODE_ENV: 'development', SPENDING_PILOT_DB: '/tmp/spending.sqlite' }), true)
  assert.equal(spendingPilotEnabled({ NODE_ENV: 'development' }), false)
  assert.equal(spendingPilotEnabled({ NODE_ENV: 'production', SPENDING_PILOT_DB: '/tmp/spending.sqlite' }), false)
})

const snapshot: SpendingSnapshot = {
  rows: [
    { id: 'buy', accountId: 'card', postedDate: '2026-08-01', activityDate: '2026-07-31',
      currency: 'USD', amountMinor: -2000, kind: 'purchase', description: 'Store' },
    { id: 'refund', accountId: 'card', postedDate: '2026-08-02', activityDate: '2026-08-02',
      currency: 'USD', amountMinor: 100, kind: 'refund', description: 'Refund' },
    { id: 'payment', accountId: 'card', postedDate: '2026-08-04', activityDate: '2026-08-04',
      currency: 'USD', amountMinor: 2000, kind: 'card_payment', description: 'Payment' },
    { id: 'won', accountId: 'korea', postedDate: '2026-07-05', activityDate: '2026-07-05',
      currency: 'KRW', amountMinor: -1000, kind: 'purchase', description: 'Store' },
  ],
  holds: [
    { accountId: 'card', source: 'simplefin', row: 7, date: '2026-07-28', currency: 'USD', amountMinor: 50, reason: 'unclassified_card_credit' },
    { accountId: 'korea', source: 'banksalad', row: 9, date: null, currency: null, amountMinor: null, reason: 'ambiguous_match' },
  ],
  coverage: [
    { accountId: 'card', currency: 'USD', first: '2026-08-01', last: '2026-08-04', count: 3 },
    { accountId: 'korea', currency: 'KRW', first: '2026-07-05', last: '2026-07-05', count: 1 },
  ],
  reviewIncomplete: false,
}
test('spending filters use purchase activity dates, preserve native currency, and exclude payments', () => {
  const july = projectSpending(snapshot, { month: '2026-07' })
  assert.deepEqual(july.totals, { USD: { purchase: 2000, refund: 0, net: 2000 }, KRW: { purchase: 1000, refund: 0, net: 1000 } })
  assert.equal(july.holds.length, 2)
  const august = projectSpending(snapshot, { month: '2026-08', account: 'card' })
  assert.deepEqual(august.rows.map(r => r.kind), ['card_payment', 'refund'])
  assert.deepEqual(august.totals.USD, { purchase: 0, refund: 100, net: -100 })
  assert.equal(august.holds.length, 0)
  assert.deepEqual(august.coverage, [snapshot.coverage[0]])
  assert.equal(projectSpending(snapshot, { month: '2025-02' }).rows.length, 0)
})

test('account summaries retain coverage and count held observations without changing activity', () => {
  const summary = summarizeSpendingAccounts({ ...snapshot, holds: [...snapshot.holds, { ...snapshot.holds[0], row: 8 }] })
  assert.deepEqual(summary.map(row => [row.accountId, row.first, row.count, row.heldCount]), [
    ['card', '2026-08-01', 3, 2],
    ['korea', '2026-07-05', 1, 1],
  ])
  assert.deepEqual(summarizeSpendingAccounts({ ...snapshot, holds: [] }).map(row => row.heldCount), [0, 0])
})
