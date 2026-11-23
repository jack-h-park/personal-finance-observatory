import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { analyzeSpending, projectSpending, resolveSpendingPeriod, spendingInKrw, summarizeSpendingAccounts, type SpendingFxRate, type SpendingSnapshot } from '../lib/domain/spending-view'
import { spendingPilotEnabled, spendingPublicationPath } from '../lib/adapters/spending-view'

test('the spending route requires a local ledger or explicit private snapshot', () => {
  assert.equal(spendingPilotEnabled({ NODE_ENV: 'development', SPENDING_PILOT_DB: '/tmp/spending.sqlite' }), true)
  assert.equal(spendingPilotEnabled({ NODE_ENV: 'development' }), false)
  assert.equal(spendingPilotEnabled({ NODE_ENV: 'production', SPENDING_PILOT_DB: '/tmp/spending.sqlite' }), false)
  const state = mkdtempSync(path.join(tmpdir(), 'spending-publication-'))
  try {
    const env = { NODE_ENV: 'production', FINANCE_MODE: 'private', FINANCE_STATE_DIR: state } as const
    const publication = path.join(state, 'spending-readonly', 'snapshot.json')
    assert.equal(spendingPublicationPath(env), publication)
    assert.equal(spendingPilotEnabled(env), false)
    mkdirSync(path.dirname(publication))
    writeFileSync(publication, '{}', { mode: 0o600 })
    assert.equal(spendingPilotEnabled(env), true)
  } finally {
    rmSync(state, { recursive: true, force: true })
  }
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

test('analytics spans calendar months, leaves gaps blank and excludes future rows and payments', () => {
  const data = analyzeSpending(snapshot.rows, { today: '2026-08-01', period: 12 })
  assert.equal(data.months.length, 12)
  assert.equal(data.months.at(-1)?.month, '2025-09')
  assert.deepEqual(data.months[0], { month: '2026-08', USD: null, KRW: null })
  assert.deepEqual(data.months[1], { month: '2026-07', USD: 2000, KRW: 1000 })
  assert.equal(data.firstDay, '2025-09-01')
  assert.deepEqual(data.totals.USD, { net: 2000, observedMonths: 1 })
  assert.equal(analyzeSpending(snapshot.rows, { today: '2026-08-04', period: 24 }).months[0].USD, -100)
})

test('analytics ranks purchases by category, merchant and individual amount, preserving native currencies', () => {
  const buy = { ...snapshot.rows[0], category: 'Shopping', categorySource: 'issuer' as const }
  const data = analyzeSpending([...snapshot.rows.slice(1), buy, { ...buy, id: 'repeat', description: 'store', amountMinor: -700 }],
    { today: '2026-08-10', period: 12 })
  assert.deepEqual(data.USD.categories, [{ name: 'Shopping', amountMinor: 2700, count: 2 }])
  assert.deepEqual(data.USD.merchants, [{ name: 'Store', amountMinor: 2700, count: 2 }])
  assert.deepEqual(data.USD.largest.map(row => row.id), ['buy', 'repeat'])
  assert.equal(data.USD.categorySources.issuer, 2)
  assert.deepEqual(data.KRW.uncategorized, { amountMinor: 1000, count: 1 })
  assert.equal(analyzeSpending(snapshot.rows, { today: '2026-08-10', period: 12, account: 'card' }).KRW.largest.length, 0)
})

test('reviewed merchant aliases group purchases while retaining issuer descriptions for drill-down', () => {
  const purchases = [
    { ...snapshot.rows[0], description: 'Store Downtown', merchantLabel: 'Store' },
    { ...snapshot.rows[0], id: 'second', description: 'Store Mall', merchantLabel: 'Store', amountMinor: -500 },
  ]
  const data = analyzeSpending(purchases, { today: '2026-08-10', period: 12 })
  assert.deepEqual(data.USD.merchants, [{ name: 'Store', amountMinor: 2500, count: 2 }])
  assert.deepEqual(data.USD.largest.map(row => row.description), ['Store Downtown', 'Store Mall'])
  assert.deepEqual(data.totals.KRW, { net: null, observedMonths: 0 })
})

test('combined view uses posting-date rates, retains source amounts and distinguishes missing FX', () => {
  const rates = new Map<string, SpendingFxRate>([
    ['2026-07-31', { date: '2026-07-31', rate: 1301.5, source: 'example' }],
    ['2026-08-01', { date: '2026-08-01', rate: 1450, source: 'example' }],
    ['2026-08-20', { date: '2026-08-20', rate: 1550, source: 'example' }],
    ['2026-08-31', { date: '2026-08-31', rate: 1404.62, source: 'example' }],
  ])
  const lackingRate = { ...snapshot.rows[0], id: 'missing', postedDate: '2026-08-15', activityDate: '2026-08-15' }
  const analysis = analyzeSpending([...snapshot.rows, lackingRate], { today: '2026-08-20', period: 12, rates })
  assert.equal(analysis.combined.net, 28550)
  assert.equal(analysis.combined.missingFx, 1)
  assert.deepEqual(analysis.combined.months.slice(0, 2), [
    { month: '2026-08', amount: -1450, fromKrw: null, fromUsd: -1450, missingFx: 1 },
    { month: '2026-07', amount: 30000, fromKrw: 1000, fromUsd: 29000, missingFx: 0 },
  ])
  assert.equal(analysis.combined.merchants[0].amountMinor, 30000)
  assert.equal(analysis.combined.largest[0].amountMinor, -2000)
  assert.equal(spendingInKrw(snapshot.rows[1], rates).quote?.date, '2026-08-01')
  assert.equal(spendingInKrw(lackingRate, rates).amount, null)
  assert.equal(spendingInKrw({ ...lackingRate, postedDate: '2026-08-31', amountMinor: -2500 }, rates).amount, -35116)
})

test('the period parameter accepts 12, 24, this year and last year, defaulting to 12', () => {
  assert.equal(resolveSpendingPeriod(undefined), 12)
  assert.equal(resolveSpendingPeriod('12'), 12)
  assert.equal(resolveSpendingPeriod('24'), 24)
  assert.equal(resolveSpendingPeriod('ytd'), 'ytd')
  assert.equal(resolveSpendingPeriod('lastYear'), 'lastYear')
  assert.equal(resolveSpendingPeriod('36'), 12)
})

test('a rolling window ends today', () => {
  const data = analyzeSpending(snapshot.rows, { today: '2026-08-10', period: 12 })
  assert.equal(data.lastDay, '2026-08-10')
})

test('this year runs from January through this month, ending today', () => {
  const data = analyzeSpending(snapshot.rows, { today: '2026-08-10', period: 'ytd' })
  assert.equal(data.months.length, 8)
  assert.equal(data.months[0].month, '2026-08')
  assert.equal(data.months.at(-1)?.month, '2026-01')
  assert.equal(data.firstDay, '2026-01-01')
  assert.equal(data.lastDay, '2026-08-10')
  assert.deepEqual(data.totals.USD, { net: 1900, observedMonths: 2 })
})

test('this year in January is one month', () => {
  const data = analyzeSpending(snapshot.rows, { today: '2027-01-03', period: 'ytd' })
  assert.deepEqual(data.months.map(row => row.month), ['2027-01'])
  assert.equal(data.totals.USD.net, null)
})

test('last year covers the previous calendar year and nothing from this year', () => {
  const rows = [...snapshot.rows,
    { id: 'old', accountId: 'korea', postedDate: '2025-06-02', activityDate: '2025-06-01', currency: 'KRW' as const, amountMinor: -700, kind: 'purchase' as const, description: 'Store' },
    { id: 'newyear', accountId: 'korea', postedDate: '2026-01-01', activityDate: '2026-01-01', currency: 'KRW' as const, amountMinor: -50, kind: 'purchase' as const, description: 'Store' }]
  const data = analyzeSpending(rows, { today: '2026-08-10', period: 'lastYear' })
  assert.equal(data.months.length, 12)
  assert.equal(data.months[0].month, '2025-12')
  assert.equal(data.months.at(-1)?.month, '2025-01')
  assert.equal(data.firstDay, '2025-01-01')
  assert.equal(data.lastDay, '2025-12-31')
  assert.deepEqual(data.totals.KRW, { net: 700, observedMonths: 1 })
  assert.equal(data.totals.USD.net, null)
})

test('each combined month splits its KRW net into KRW-settled and USD-settled spending', () => {
  const rates = new Map([['2026-07-31', { date: '2026-07-31', rate: 1400, source: 'test' }], ['2026-08-01', { date: '2026-08-01', rate: 1400, source: 'test' }]])
  const rows = [...snapshot.rows,
    { id: 'norate', accountId: 'card', postedDate: '2026-06-01', activityDate: '2026-06-01', currency: 'USD' as const, amountMinor: -500, kind: 'purchase' as const, description: 'Store' }]
  const months = analyzeSpending(rows, { today: '2026-08-10', period: 12, rates }).combined.months
  const july = months.find(item => item.month === '2026-07')!
  assert.equal(july.fromKrw, 1000)
  assert.equal(july.fromUsd, 28000)
  assert.equal(july.amount, july.fromKrw! + july.fromUsd!)
  const june = months.find(item => item.month === '2026-06')!
  assert.deepEqual([june.amount, june.fromKrw, june.fromUsd, june.missingFx], [null, null, null, 1])
  for (const item of months) assert.equal(item.amount, item.fromKrw === null && item.fromUsd === null ? null : (item.fromKrw ?? 0) + (item.fromUsd ?? 0))
})
