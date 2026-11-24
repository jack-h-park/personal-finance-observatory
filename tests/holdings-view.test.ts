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

test('grouping by security sums accounts, recomputes the return, and keeps the worst status', async () => {
  const { groupBySecurity } = await import('../lib/holdings-view')
  const base = { currency: 'KRW', market: 'KR', ticker: '000660', name: 'SK hynix', long_term_qty: null, short_term_qty: null, lot_count: 1, native_unrealized_gl_pct: null }
  const groups = groupBySecurity([
    { ...base, brokerage: 'B1', account: 'a1', quantity: 10, native_cost: 100, native_market_value: 300, native_unrealized_gl: 200, base_cost: 100, base_market_value: 300, base_unrealized_gl: 200, total_cost_krw: 100, cost_status: 'ready' as const },
    { ...base, brokerage: 'B2', account: 'a2', quantity: 5, native_cost: 300, native_market_value: 100, native_unrealized_gl: -200, base_cost: 300, base_market_value: 100, base_unrealized_gl: -200, total_cost_krw: 300, cost_status: 'estimated' as const },
    { ...base, ticker: '005930', name: 'Samsung', brokerage: 'B1', account: 'a1', quantity: 1, native_cost: 50, native_market_value: null, native_unrealized_gl: null, base_cost: 50, base_market_value: null, base_unrealized_gl: null, total_cost_krw: 50, cost_status: 'unpriced' as const },
  ])
  const hynix = groups.find((g) => g.ticker === '000660')!
  assert.equal(hynix.id, 'KR:000660')
  assert.equal(hynix.quantity, 15)
  assert.equal(hynix.base_market_value, 400)
  assert.equal(hynix.native_unrealized_gl_pct, 0)
  assert.equal(hynix.lot_count, 2)
  assert.equal(hynix.cost_status, 'estimated')
  assert.deepEqual(hynix.accounts.map((a) => [a.brokerage, a.account, a.share]), [
    ['B1', 'a1', 75],
    ['B2', 'a2', 25],
  ])
  const samsung = groups.find((g) => g.ticker === '005930')!
  assert.equal(samsung.base_market_value, null)
  assert.equal(samsung.native_unrealized_gl_pct, null)
  assert.equal(samsung.accounts.length, 1)
})

test('a security held in two currencies is shown in KRW', async () => {
  const { groupBySecurity } = await import('../lib/holdings-view')
  const row = { market: 'US', ticker: 'TSLA', name: 'Tesla', brokerage: 'B', quantity: 1, native_market_value: 10, native_unrealized_gl: 1, native_unrealized_gl_pct: 10, base_market_value: 100, base_unrealized_gl: 10, total_cost_krw: 90, long_term_qty: null, short_term_qty: null, lot_count: null, cost_status: 'ready' as const }
  const [g] = groupBySecurity([
    { ...row, account: 'x', currency: 'USD', native_cost: 9, base_cost: 90 },
    { ...row, account: 'y', currency: 'KRW', native_cost: 90, base_cost: 90 },
  ])
  assert.equal(g.currency, 'KRW')
  assert.equal(g.native_cost, 180)
  assert.equal(g.native_market_value, 200)
  assert.equal(g.base_market_value, 200)
  // Return falls back to the KRW figures: 20 / 180.
  assert.ok(Math.abs(g.native_unrealized_gl_pct! - (20 / 180) * 100) < 1e-9)
  assert.equal(g.lot_count, null)
})
