import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { cumulativeEffect, dailyChangeSeries, dailyChangeShares, type DailyChangePoint } from '@/lib/daily-change'
import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'

const D1 = '2026-03-02'
const D2 = '2026-03-03'
const D3 = '2026-03-04'

const row = (date: string, market: PositionSnapshotRow['market'], ticker: string, costKrw: number, marketValueKrw: number | null): PositionSnapshotRow => ({
  date,
  market,
  ticker,
  name: `Name ${ticker}`,
  quantity: 1,
  costKrw,
  marketValueKrw,
})

const held = [
  { market: 'KR', ticker: '000100' },
  { market: 'US', ticker: 'AAAA' },
]

test('one point per consecutive pair, market effects per market', () => {
  const rows = [
    row(D1, 'KR', '000100', 100, 100),
    row(D2, 'KR', '000100', 100, 110),
    row(D3, 'KR', '000100', 100, 105),
    row(D1, 'US', 'AAAA', 200, 200),
    row(D2, 'US', 'AAAA', 200, 190),
    row(D3, 'US', 'AAAA', 200, 220),
  ]
  const points = dailyChangeSeries({ dates: [D1, D2, D3], rows, realized: [], held })
  assert.equal(points.length, 2)
  assert.deepEqual(points.map((p) => p.date), [D2, D3])
  assert.equal(points[0].KR, 10)
  assert.equal(points[0].US, -10)
  assert.equal(points[0].total, 0)
  assert.equal(points[0].previousTotal, 300)
  assert.equal(points[1].KR, -5)
  assert.equal(points[1].US, 30)
  assert.equal(points[1].previousTotal, 300)
})

test('a purchase is not a gain in the series', () => {
  const rows = [row(D1, 'KR', '000100', 100, 100), row(D2, 'KR', '000100', 200, 205)]
  const [p] = dailyChangeSeries({ dates: [D1, D2], rows, realized: [], held })
  assert.equal(p.KR, 5)
})

test('a realized gain counts in the pair containing its sale date', () => {
  const rows = [row(D1, 'KR', '000100', 100, 100), row(D2, 'KR', '000100', 100, 100), row(D3, 'KR', '000100', 100, 100)]
  const realized: RealizedGainRow[] = [{ market: 'KR', ticker: '000100', soldDate: D3, realizedKrw: 40 }]
  const points = dailyChangeSeries({ dates: [D1, D2, D3], rows, realized, held })
  assert.equal(points[0].KR, 0)
  assert.equal(points[1].KR, 40)
})

test('an intermediate unpriced security is left out of that pair only and counted in gaps', () => {
  const rows = [
    row(D1, 'KR', '000100', 100, 100),
    row(D2, 'KR', '000100', 100, null),
    row(D3, 'KR', '000100', 100, 130),
    row(D1, 'US', 'AAAA', 200, 200),
    row(D2, 'US', 'AAAA', 200, 210),
    row(D3, 'US', 'AAAA', 200, 220),
  ]
  const points = dailyChangeSeries({ dates: [D1, D2, D3], rows, realized: [], held })
  assert.equal(points[0].gaps, 1)
  assert.equal(points[0].KR, 0)
  assert.equal(points[0].US, 10)
  assert.equal(points[0].previousTotal, 200)
  assert.equal(points[1].gaps, 1)
  assert.equal(points[1].US, 10)
})

test('shares are percent of the previous total', () => {
  const p: DailyChangePoint = { date: D2, KR: 10, US: -20, CRYPTO: 0, total: -10, previousTotal: 200, gaps: 0 }
  const [s] = dailyChangeShares([p])
  assert.equal(s.KR, 5)
  assert.equal(s.US, -10)
  assert.equal(s.total, -5)
  const [z] = dailyChangeShares([{ ...p, previousTotal: 0 }])
  assert.equal(z.KR, 0)
  assert.equal(z.total, 0)
})

test('cumulative effect runs over the points', () => {
  const pts = [1, -3, 2].map((total) => ({ date: D2, KR: total, US: 0, CRYPTO: 0, total, previousTotal: 100, gaps: 0 }))
  assert.deepEqual(cumulativeEffect(pts), [1, -2, 0])
})
