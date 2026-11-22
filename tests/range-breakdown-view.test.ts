import assert from 'node:assert/strict'
import test from 'node:test'
import type { PositionSnapshotRow } from '../lib/adapters/portfolio-db'
import type { TotalAssetsPoint } from '../lib/net-worth'
import { rangeBreakdownView } from '../lib/range-breakdown-view'

const point = (date: string, stocks: number | null, crypto: number | null = null): TotalAssetsPoint => ({
  date,
  stocks,
  crypto,
  cash: 100,
  pensions: null,
  gold: null,
  total: 100 + (stocks ?? 0) + (crypto ?? 0),
})

const row = (date: string, market: PositionSnapshotRow['market'], ticker: string, costKrw: number, marketValueKrw: number | null): PositionSnapshotRow => ({
  date,
  market,
  ticker,
  name: ticker,
  quantity: 1,
  costKrw,
  marketValueKrw,
})

const totalPoints = [point('2026-01-31', 600, 50), point('2026-02-28', 480, 50), point('2026-03-31', 560, 80)]
const investmentPoints = [
  { date: '2026-01-31', unrealized: 110, realized: 0 },
  { date: '2026-02-28', unrealized: 90, realized: 40 },
  { date: '2026-03-31', unrealized: 185, realized: 40 },
]
const snapshots = [
  row('2026-01-31', 'KR', 'AAA', 500, 600),
  row('2026-01-31', 'CRYPTO', 'BTC', 40, 50),
  row('2026-03-31', 'KR', 'AAA', 400, 560),
  row('2026-03-31', 'CRYPTO', 'BTC', 55, 80),
]
const realized = [{ market: 'KR', ticker: 'AAA', soldDate: '2026-02-10', realizedKrw: 40 }]

test('splits stocks and crypto and derives the header investment result from the breakdown', () => {
  const view = rangeBreakdownView({ from: '2026-01-31', to: '2026-03-31', totalPoints, investmentPoints, snapshots, realized })
  assert.equal(view.change?.change, -10)
  assert.deepEqual(view.byClass, view.change?.byClass)
  assert.equal(view.stocks?.shown[0].ticker, 'AAA')
  assert.equal(view.stocks?.shown[0].marketEffect, 100)
  assert.equal(view.crypto?.shown[0].ticker, 'BTC')
  assert.equal(view.crypto?.shown[0].marketEffect, 15)
  assert.deepEqual(view.investment, { unrealized: 75, realized: 40, total: 115 })
})

test('the cost basis gap is shown only for a period ending on the last point', () => {
  const today = rangeBreakdownView({ from: '2026-01-31', to: '2026-03-31', totalPoints, investmentPoints, snapshots, realized })
  // KPI-style: (185 - 110) + 40 = 115 matches the breakdown, so no gap.
  assert.equal(today.gap, null)
  const shifted = investmentPoints.map((p) => (p.date === '2026-03-31' ? { ...p, unrealized: 200 } : p))
  assert.equal(rangeBreakdownView({ from: '2026-01-31', to: '2026-03-31', totalPoints, investmentPoints: shifted, snapshots, realized }).gap, 15)
  const past = rangeBreakdownView({
    from: '2026-01-31',
    to: '2026-02-28',
    totalPoints,
    investmentPoints: shifted,
    snapshots: [...snapshots, row('2026-02-28', 'KR', 'AAA', 400, 480), row('2026-02-28', 'CRYPTO', 'BTC', 40, 50)],
    realized,
  })
  assert.equal(past.gap, null)
})

test('no per-security records means no security sections and the class-level investment result', () => {
  const missingTable = rangeBreakdownView({ from: '2026-01-31', to: '2026-03-31', totalPoints, investmentPoints, snapshots: null, realized })
  assert.equal(missingTable.stocks, null)
  assert.equal(missingTable.crypto, null)
  assert.deepEqual(missingTable.investment, { unrealized: 75, realized: 40, total: 115 })
  assert.equal(missingTable.gap, null)
  // A date that held stocks but has no rows (written before the table existed) is not covered either.
  const missingRows = rangeBreakdownView({
    from: '2026-01-31',
    to: '2026-03-31',
    totalPoints,
    investmentPoints,
    snapshots: snapshots.filter((r) => r.date === '2026-03-31'),
    realized,
  })
  assert.equal(missingRows.stocks, null)
})

test('a start before any holding is covered: everything is money put in', () => {
  const points = [point('2025-12-31', null), ...totalPoints]
  const view = rangeBreakdownView({ from: '2025-12-31', to: '2026-01-31', totalPoints: points, investmentPoints, snapshots, realized: [] })
  assert.equal(view.stocks?.shown[0].moneyIn, 500)
})
