import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { marketMixSeries, mixShares, mixSummary } from '../lib/market-mix'

const snap = (snapshot_date: string, kr: number | null, us: number | null, crypto: number | null) => ({
  snapshot_date,
  kr_market_value: kr,
  us_market_value_base: us,
  crypto_market_value_base: crypto,
})

test('past snapshots, then today from the holdings, replacing a same-day snapshot', () => {
  const points = marketMixSeries(
    [snap('2026-10-31', 600, 400, null), snap('2026-11-23', 1, 1, 1), snap('2026-09-30', 500, 500, 0)],
    [
      { market: 'KR', base_market_value: 700 },
      { market: 'US', base_market_value: 250 },
      { market: 'US', base_market_value: 250 },
      { market: 'CRYPTO', base_market_value: null },
      { market: 'CASH', base_market_value: 999 },
    ],
    '2026-11-23'
  )
  assert.deepEqual(
    points.map((p) => [p.date, p.KR, p.US, p.CRYPTO, p.total]),
    [
      ['2026-09-30', 500, 500, 0, 1000],
      ['2026-10-31', 600, 400, null, 1000],
      ['2026-11-23', 700, 500, null, 1200],
    ]
  )
})

test('a snapshot that values no market is dropped', () => {
  const points = marketMixSeries([snap('2026-10-31', null, null, null)], [], '2026-11-23')
  assert.deepEqual(points, [])
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
