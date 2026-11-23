import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { holdingWeight, trendChangePct, trendDates, trendSeries, weightTotal } from '../lib/holdings-view'

test('weights divide by the known displayed value and skip unknown rows', () => {
  const total = weightTotal([{ base_market_value: 300 }, { base_market_value: null }, { base_market_value: 100 }])
  assert.equal(total, 400)
  assert.equal(holdingWeight(300, total), 75)
  assert.equal(holdingWeight(null, total), null)
  assert.equal(holdingWeight(10, 0), null)
  assert.equal(weightTotal([{ base_market_value: null }]), null)
})

test('trend dates keep the last snapshot of each month, newest months only', () => {
  const dates = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-03-05', '2026-04-10', '2026-04-30', '2026-05-02']
  assert.deepEqual(trendDates(dates, 3), ['2026-03-31', '2026-04-30', '2026-05-02'])
  assert.deepEqual(trendDates(['2026-02-28', '2026-01-31']), ['2026-01-31', '2026-02-28'])
})

test('a Toss US stock keyed KR in the snapshots joins its US holding line', () => {
  const dates = ['2026-01-31', '2026-02-28']
  const series = trendSeries(
    [
      { date: '2026-01-31', market: 'US', ticker: 'TSLA', marketValueKrw: 100 },
      { date: '2026-01-31', market: 'KR', ticker: 'TSLA', marketValueKrw: 50 },
      { date: '2026-02-28', market: 'US', ticker: 'TSLA', marketValueKrw: 120 },
      { date: '2026-02-28', market: 'KR', ticker: 'TSLA', marketValueKrw: 60 },
      { date: '2026-02-28', market: 'KR', ticker: '005930', marketValueKrw: 900 },
    ],
    dates,
    [{ market: 'US', ticker: 'TSLA' }, { market: 'KR', ticker: '005930' }]
  )
  assert.deepEqual(series.get('US:TSLA'), [150, 180])
  assert.deepEqual(series.get('KR:005930'), [0, 900])
  assert.equal(series.has('KR:TSLA'), false)
})

test('a ticker held under two markets keeps each market its own rows', () => {
  const series = trendSeries(
    [
      { date: 'd', market: 'US', ticker: 'X', marketValueKrw: 1 },
      { date: 'd', market: 'CRYPTO', ticker: 'X', marketValueKrw: 2 },
      { date: 'd', market: 'KR', ticker: 'X', marketValueKrw: 4 },
    ],
    ['d'],
    [{ market: 'US', ticker: 'X' }, { market: 'CRYPTO', ticker: 'X' }]
  )
  assert.deepEqual(series.get('US:X'), [1])
  assert.deepEqual(series.get('CRYPTO:X'), [2])
})

test('an unpriced row makes that date unknown, not a partial sum', () => {
  const series = trendSeries(
    [
      { date: 'a', market: 'US', ticker: 'T', marketValueKrw: 100 },
      { date: 'a', market: 'KR', ticker: 'T', marketValueKrw: null },
      { date: 'b', market: 'US', ticker: 'T', marketValueKrw: 120 },
    ],
    ['a', 'b'],
    [{ market: 'US', ticker: 'T' }]
  )
  assert.deepEqual(series.get('US:T'), [null, 120])
})

test('trend change reads first and last known points', () => {
  assert.equal(trendChangePct([null, 100, null, 150]), 50)
  assert.equal(trendChangePct([0, 100]), null)
  assert.equal(trendChangePct([100]), null)
})
