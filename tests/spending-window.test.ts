import assert from 'node:assert/strict'
import test from 'node:test'
import { sumSpendingWindow } from '../lib/domain/spending-window'
import { analyzeSpending, type SpendingFxRate, type SpendingViewRow } from '../lib/domain/spending-view'

let seq = 0
const row = (activityDate: string, currency: 'USD' | 'KRW', amountMinor: number, kind: SpendingViewRow['kind'] = 'purchase', postedDate = activityDate): SpendingViewRow => ({
  id: `r${++seq}`, accountId: 'a', postedDate, activityDate, currency, amountMinor, kind, description: 'x',
})
const rateMap = (entries: [string, number][]) => new Map<string, SpendingFxRate>(entries.map(([date, rate]) => [date, { date, rate, source: 'test' }]))
const year = { start: '2025-12', end: '2026-11' }
const base = { window: year, today: '2026-11-22', display: 'KRW' as const, rates: rateMap([]) }

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
  assert.equal(result.converted, 8000)
})

test('matches analyzeSpending for a 12-month window, native and combined KRW', () => {
  const rates = rateMap([['2025-12-01', 1452.37], ['2026-02-13', 1388.5], ['2026-02-21', 1391.25], ['2026-09-30', 1350]])
  const rows = [
    row('2025-12-03', 'USD', -1250),                       // 2 days after a rate: lookback
    row('2026-02-14', 'USD', -9900, 'purchase', '2026-02-15'), // posted date carries the rate
    row('2026-02-20', 'USD', 500, 'refund', '2026-02-21'),
    row('2026-05-01', 'KRW', -45000), row('2026-05-02', 'KRW', -12000, 'fee'), row('2026-07-09', 'KRW', 3000, 'refund'),
    row('2026-07-20', 'USD', -333),                        // no rate within seven days
    row('2026-09-30', 'USD', -100000, 'card_payment'), row('2026-11-21', 'KRW', -8800), row('2025-11-30', 'USD', -777),
    row('2026-11-23', 'KRW', -1),
  ]
  const result = sumSpendingWindow({ ...base, rows, rates })
  const expected = analyzeSpending(rows, { today: '2026-11-22', period: 12, rates })
  assert.equal(result.native.USD.netMinor, expected.totals.USD.net)
  assert.equal(result.native.KRW.netMinor, expected.totals.KRW.net)
  assert.equal(result.native.USD.observedMonths, expected.totals.USD.observedMonths)
  assert.equal(result.native.KRW.observedMonths, expected.totals.KRW.observedMonths)
  assert.equal(result.converted, expected.combined.net)
  assert.equal(result.missingFx, expected.combined.missingFx)
  assert.equal(result.missingFx, 1)
})

test('skips rows after today', () => {
  const result = sumSpendingWindow({ ...base, rows: [row('2026-11-23', 'KRW', -5000)] })
  assert.equal(result.native.KRW.netMinor, null)
  assert.equal(result.converted, null)
})

test('converts USD at the posting-date rate, looking back up to seven days', () => {
  const rows = [row('2026-03-09', 'USD', -1000, 'purchase', '2026-03-10')]
  const result = sumSpendingWindow({ ...base, rows, rates: rateMap([['2026-03-03', 1400]]) })
  assert.equal(result.converted, 14000)
  assert.equal(result.missingFx, 0)
})

test('a USD row with no rate within seven days is left out of the KRW total and counted', () => {
  const rows = [row('2026-03-10', 'USD', -1000), row('2026-03-11', 'KRW', -500)]
  const result = sumSpendingWindow({ ...base, rows, rates: rateMap([['2026-03-01', 1400]]) })
  assert.equal(result.converted, 500)
  assert.equal(result.missingFx, 1)
  assert.equal(result.native.USD.netMinor, 1000)
})

test('in a USD view, USD rows stay native and KRW rows divide by the posting-date rate', () => {
  const rows = [row('2026-03-10', 'USD', -1000), row('2026-03-10', 'KRW', -14000)]
  const result = sumSpendingWindow({ ...base, rows, rates: rateMap([['2026-03-10', 1400]]), display: 'USD' })
  assert.equal(result.converted, 20)
  assert.equal(result.missingFx, 0)
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
