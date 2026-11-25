import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { PositionSnapshotRow } from '@/lib/adapters/portfolio-db'
import { actualSummary, nominalStart, periodStart, resolveBasis, resolvePeriod } from '@/lib/period-change'

test('nominalStart steps back by the period and clamps month ends', () => {
  assert.equal(nominalStart('1w', '2030-03-12'), '2030-03-05')
  assert.equal(nominalStart('1m', '2030-03-31'), '2030-02-28')
  assert.equal(nominalStart('3m', '2030-05-31'), '2030-02-28')
  assert.equal(nominalStart('ytd', '2030-03-12'), '2029-12-31')
  assert.equal(nominalStart('1y', '2030-03-12'), '2029-03-12')
})

test('periodStart picks the latest snapshot on or before the nominal start', () => {
  const dates = ['2030-02-20', '2030-03-01', '2030-03-05', '2030-03-10']
  assert.deepEqual(periodStart('1w', '2030-03-12', dates), { date: '2030-03-05', clamped: false })
  assert.deepEqual(periodStart('1w', '2030-03-13', dates), { date: '2030-03-05', clamped: false })
})

test('periodStart clamps to the earliest snapshot when all are later', () => {
  assert.deepEqual(periodStart('1y', '2030-03-12', ['2030-01-04', '2029-12-30'].sort()), { date: '2029-12-30', clamped: true })
  assert.equal(periodStart('1m', '2030-03-12', []), null)
})

test('resolvers fall back to defaults', () => {
  assert.equal(resolvePeriod('x'), '1d')
  assert.equal(resolvePeriod('3m'), '3m')
  assert.equal(resolveBasis(undefined), 'actual')
  assert.equal(resolveBasis('held'), 'held')
})

const A = '2030-01-31'
const B = '2030-02-28'
const row = (date: string, market: PositionSnapshotRow['market'], ticker: string, costKrw: number, marketValueKrw: number | null): PositionSnapshotRow => ({
  date,
  market,
  ticker,
  name: `Name ${ticker}`,
  quantity: 1,
  costKrw,
  marketValueKrw,
})

test('actualSummary keeps the identity, per-market pct, capped sorted movers', () => {
  const rows = [
    row(A, 'KR', 'K1', 100, 100),
    row(B, 'KR', 'K1', 100, 120),
    row(A, 'KR', 'K2', 100, 100),
    row(B, 'KR', 'K2', 100, 100),
    row(A, 'US', 'U1', 200, 200),
    row(B, 'US', 'U1', 300, 330),
  ]
  for (let i = 0; i < 7; i++) {
    rows.push(row(A, 'CRYPTO', `C${i}`, 10, 10), row(B, 'CRYPTO', `C${i}`, 10, 10 + (i % 2 === 0 ? i + 1 : -(i + 1))))
  }
  const held = rows.filter((r) => r.date === B).map((r) => ({ market: r.market, ticker: r.ticker }))
  const s = actualSummary({ from: A, to: B, clamped: false, rows, realized: [], held })
  assert.equal(s.startValue + s.moneyIn + s.marketEffect, s.endValue)
  assert.equal(s.moneyIn, 100)
  const kr = s.markets.find((m) => m.market === 'KR')!
  assert.equal(kr.marketEffect, 20)
  assert.equal(kr.pct, 20 / 200)
  assert.equal(s.up.length, 5)
  assert.equal(s.down.length, 3)
  assert.ok(s.up.every((d, i) => i === 0 || s.up[i - 1].marketEffect >= d.marketEffect))
  assert.ok(s.down.every((d, i) => i === 0 || s.down[i - 1].marketEffect <= d.marketEffect))
  assert.ok(![...s.up, ...s.down].some((d) => d.ticker === 'K2'))
  assert.equal(s.unpriced, 0)
})

test('pct is null when a market starts empty', () => {
  const rows = [row(B, 'KR', 'K1', 100, 100)]
  const s = actualSummary({ from: A, to: B, clamped: true, rows, realized: [], held: [{ market: 'KR', ticker: 'K1' }] })
  assert.equal(s.pct, null)
  assert.equal(s.clamped, true)
  assert.equal(s.markets.find((m) => m.market === 'KR')!.pct, null)
})
