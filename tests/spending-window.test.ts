import assert from 'node:assert/strict'
import test from 'node:test'
import { sumSpendingWindow } from '../lib/domain/spending-window'
import { analyzeSpending, type SpendingViewRow } from '../lib/domain/spending-view'

let seq = 0
const row = (activityDate: string, currency: 'USD' | 'KRW', amountMinor: number, kind: SpendingViewRow['kind'] = 'purchase'): SpendingViewRow => ({
  id: `r${++seq}`, accountId: 'a', postedDate: activityDate, activityDate, currency, amountMinor, kind, description: 'x',
})
const year = { start: '2025-12', end: '2026-11' }
const base = { window: year, today: '2026-11-22', display: 'KRW' as const, rates: [], fallbackRate: 1400 }

test('nets purchases and refunds by activity month, skipping payments and transfers', () => {
  const result = sumSpendingWindow({
    ...base,
    rows: [
      row('2026-01-05', 'KRW', -10000),
      row('2026-01-20', 'KRW', 2000, 'refund'),
      row('2026-01-25', 'KRW', -50000, 'card_payment'),
      row('2026-01-26', 'KRW', -7000, 'own_transfer'),
      row('2025-11-30', 'KRW', -3000),
    ],
  })
  assert.equal(result.native.KRW.netMinor, 8000)
  assert.equal(result.native.KRW.observedMonths, 1)
  assert.equal(result.native.USD.netMinor, null)
  assert.equal(result.native.USD.observedMonths, 0)
  assert.equal(result.months, 12)
})

test('matches analyzeSpending for a 12-month window', () => {
  const rows = [
    row('2025-12-03', 'USD', -1250), row('2026-02-14', 'USD', -9900), row('2026-02-20', 'USD', 500, 'refund'),
    row('2026-05-01', 'KRW', -45000), row('2026-05-02', 'KRW', -12000, 'fee'), row('2026-07-09', 'KRW', 3000, 'refund'),
    row('2026-09-30', 'USD', -100000, 'card_payment'), row('2026-11-21', 'KRW', -8800), row('2025-11-30', 'USD', -777),
    row('2026-11-23', 'KRW', -1),
  ]
  const result = sumSpendingWindow({ ...base, rows })
  const expected = analyzeSpending(rows, { today: '2026-11-22', period: 12 }).totals
  assert.equal(result.native.USD.netMinor, expected.USD.net)
  assert.equal(result.native.KRW.netMinor, expected.KRW.net)
  assert.equal(result.native.USD.observedMonths, expected.USD.observedMonths)
  assert.equal(result.native.KRW.observedMonths, expected.KRW.observedMonths)
})

test('skips rows after today', () => {
  const result = sumSpendingWindow({ ...base, rows: [row('2026-11-23', 'KRW', -5000)] })
  assert.equal(result.native.KRW.netMinor, null)
  assert.equal(result.converted, null)
})

const marchRates = [{ date: '2026-03-01', rate: 1400 }, { date: '2026-03-15', rate: 1500 }]

test('converts USD at the rate on or before its date', () => {
  const rows = [row('2026-03-10', 'USD', -1000)]
  const krw = sumSpendingWindow({ ...base, rows, rates: marchRates })
  assert.equal(krw.converted, 14000)
  assert.equal(krw.undatedCount, 0)
  assert.equal(sumSpendingWindow({ ...base, rows, rates: marchRates, display: 'USD' }).converted, 10)
})

test('a KRW row in a USD view divides by the dated rate', () => {
  const result = sumSpendingWindow({ ...base, rows: [row('2026-03-10', 'KRW', -14000)], rates: marchRates, display: 'USD' })
  assert.equal(result.converted, 10)
})

test('a KRW row in a KRW view needs no rate', () => {
  const result = sumSpendingWindow({ ...base, rows: [row('2026-01-02', 'KRW', -14000)], rates: marchRates })
  assert.equal(result.converted, 14000)
  assert.equal(result.undatedCount, 0)
})

test('rows older than the rate table use the fallback and are counted', () => {
  const result = sumSpendingWindow({ ...base, rows: [row('2026-01-02', 'USD', -1000)], rates: [{ date: '2026-02-01', rate: 1300 }], fallbackRate: 1450 })
  assert.equal(result.converted, 14500)
  assert.equal(result.undatedCount, 1)
})

test('a one-month ytd window in January', () => {
  const result = sumSpendingWindow({
    ...base,
    window: { start: '2027-01', end: '2027-01' },
    today: '2027-01-10',
    rows: [row('2026-12-31', 'KRW', -900), row('2027-01-04', 'KRW', -100)],
  })
  assert.equal(result.months, 1)
  assert.equal(result.native.KRW.netMinor, 100)
})

test('months without activity are not observed', () => {
  const result = sumSpendingWindow({
    ...base,
    window: { start: '2025-01', end: '2025-12' },
    rows: [row('2025-11-02', 'KRW', -100), row('2025-12-02', 'KRW', -100), row('2025-12-09', 'KRW', -100)],
  })
  assert.equal(result.native.KRW.observedMonths, 2)
  assert.equal(result.months, 12)
})

test('refunds exceeding purchases give a negative total, unclamped', () => {
  const result = sumSpendingWindow({ ...base, rows: [row('2026-04-01', 'KRW', -100), row('2026-04-02', 'KRW', 600, 'refund')] })
  assert.equal(result.native.KRW.netMinor, -500)
  assert.equal(result.converted, -500)
})
