import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { marketMixSeries, mixShares, mixSummary } from '../lib/market-mix'

const at = (date: string, market: string, ticker: string, marketValueKrw: number | null) => ({ date, market, ticker, marketValueKrw })

test('past dates sum rows by market, then today from the holdings', () => {
  const rows = [
    at('2026-10-30', 'KR', '005930', 600),
    at('2026-10-30', 'US', 'NVDA', 400),
    at('2026-11-23', 'KR', '005930', 1),
    at('2026-09-30', 'KR', '005930', 500),
    at('2026-09-30', 'US', 'NVDA', 300),
    at('2026-09-30', 'US', 'MSFT', 200),
    at('2026-09-30', 'CRYPTO', 'BTC', 0),
  ]
  const holdings = [
    { market: 'KR', ticker: '005930', base_market_value: 700 },
    { market: 'US', ticker: 'NVDA', base_market_value: 250 },
    { market: 'US', ticker: 'MSFT', base_market_value: 250 },
    { market: 'CRYPTO', ticker: 'BTC', base_market_value: null },
    { market: 'CASH', ticker: 'KRW', base_market_value: 999 },
  ]
  const points = marketMixSeries(rows, ['2026-09-30', '2026-10-30', '2026-11-23'], holdings, '2026-11-23')
  assert.deepEqual(
    points.map((p) => [p.date, p.KR, p.US, p.CRYPTO, p.total]),
    [
      ['2026-09-30', 500, 500, 0, 1000],
      ['2026-10-30', 600, 400, null, 1000],
      ['2026-11-23', 700, 500, null, 1200],
    ]
  )
})

test('a date no row values is dropped, and a null row value is skipped', () => {
  const rows = [at('2026-11-20', 'KR', '005930', null), at('2026-11-19', 'KR', '005930', 5), at('2026-11-19', 'US', 'NVDA', null)]
  const holdings = [
    { market: 'KR', ticker: '005930', base_market_value: null },
    { market: 'US', ticker: 'NVDA', base_market_value: null },
  ]
  const points = marketMixSeries(rows, ['2026-11-19', '2026-11-20'], holdings, '2026-11-23')
  assert.deepEqual(points.map((p) => [p.date, p.KR, p.US]), [['2026-11-19', 5, null]])
})

test('a Toss-held US stock stays in US on past points', () => {
  const rows = [
    { date: '2026-11-20', market: 'KR', ticker: 'TSLA', marketValueKrw: 100 },
    { date: '2026-11-20', market: 'KR', ticker: '005930', marketValueKrw: 50 },
  ]
  const holdings = [
    { market: 'US', ticker: 'TSLA', base_market_value: 110 },
    { market: 'KR', ticker: '005930', base_market_value: 55 },
  ]
  const points = marketMixSeries(rows, ['2026-11-20'], holdings, '2026-11-23')
  assert.deepEqual(points.map((p) => [p.date, p.KR, p.US]), [['2026-11-20', 50, 100], ['2026-11-23', 55, 110]])
})

test('shares are of each date total, and an unvalued market stays null', () => {
  const [a] = mixShares([{ date: 'd', KR: 300, US: 100, CRYPTO: null, total: 400 }])
  assert.deepEqual([a.KR, a.US, a.CRYPTO, a.total], [75, 25, null, 100])
})

test('the summary reports the last shares and their move since the first point', () => {
  const summary = mixSummary([
    { date: 'a', KR: 500, US: 500, CRYPTO: null, total: 1000 },
    { date: 'b', KR: 600, US: 300, CRYPTO: 100, total: 1000 },
  ])
  assert.deepEqual(summary, [
    { market: 'KR', pct: 60, changePp: 10 },
    { market: 'US', pct: 30, changePp: -20 },
    { market: 'CRYPTO', pct: 10, changePp: null },
  ])
  assert.deepEqual(mixSummary([{ date: 'a', KR: 1, US: 0, CRYPTO: null, total: 1 }]), [{ market: 'KR', pct: 100, changePp: null }])
})
