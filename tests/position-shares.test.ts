import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { MAX_SHARE_SERIES, positionShares, rowMarket, shareDates, shareMoves, type ShareRow } from '../lib/position-shares'

const row = (date: string, market: string, ticker: string, v: number | null, name = ticker): ShareRow => ({ date, market, ticker, name, marketValueKrw: v })

test('dates: last snapshot of each past month, every snapshot of the newest month', () => {
  assert.deepEqual(shareDates(['2026-09-15', '2026-09-30', '2026-10-31', '2026-11-03', '2026-11-20', '2026-10-31']), [
    '2026-09-30',
    '2026-10-31',
    '2026-11-03',
    '2026-11-20',
  ])
})

test('a Toss US row keyed KR joins the US holding; a sold letters-only KR ticker is US', () => {
  const held = new Map([['TSLA', new Set(['US'])], ['005930', new Set(['KR'])]])
  assert.equal(rowMarket('KR', 'TSLA', held), 'US')
  assert.equal(rowMarket('KR', '005930', held), 'KR')
  assert.equal(rowMarket('KR', 'AAPL', held), 'US')
  assert.equal(rowMarket('KR', '0000D0', held), 'KR')
  assert.equal(rowMarket('CRYPTO', 'BTC', held), 'CRYPTO')
})

test('shares of the in-scope total, with Toss US folded into the US security', () => {
  const { series, points } = positionShares({
    rows: [
      row('a', 'KR', '005930', 600, 'Samsung'),
      row('a', 'US', 'TSLA', 300, 'Tesla'),
      row('a', 'KR', 'TSLA', 100, 'Tesla'),
      row('b', 'KR', '005930', 500, 'Samsung'),
      row('b', 'US', 'TSLA', 500, 'Tesla'),
    ],
    dates: ['a', 'b'],
    held: [{ market: 'KR', ticker: '005930' }, { market: 'US', ticker: 'TSLA' }],
    scope: 'all',
  })
  assert.deepEqual(series.map((s) => [s.id, s.key]), [['s0', 'KR:005930'], ['s1', 'US:TSLA']])
  assert.deepEqual(points.map((p) => [p.date, p.s0, p.s1, p.other]), [
    ['a', 60, 40, 0],
    ['b', 50, 50, 0],
  ])
})

test('a market scope divides by that market only', () => {
  const { series, points } = positionShares({
    rows: [row('a', 'KR', '005930', 300), row('a', 'KR', '000660', 100), row('a', 'US', 'NVDA', 600)],
    dates: ['a'],
    held: [],
    scope: 'KR',
  })
  assert.deepEqual(series.map((s) => s.key), ['KR:005930', 'KR:000660'])
  assert.deepEqual([points[0].s0, points[0].s1], [75, 25])
})

test('past the top eight the rest folds into Other, and a pin keeps a small security out of it', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row('a', 'KR', `00000${i}`, 100 - i))
  const total = rows.reduce((sum, r) => sum + r.marketValueKrw!, 0)
  const plain = positionShares({ rows, dates: ['a'], held: [], scope: 'all' })
  assert.equal(plain.series.length, MAX_SHARE_SERIES)
  assert.ok(Math.abs((plain.points[0].other as number) - ((92 + 91) / total) * 100) < 1e-9)

  const pinned = positionShares({ rows, dates: ['a'], held: [], scope: 'all', pins: ['KR:000009', 'KR:missing'] })
  assert.equal(pinned.series.length, MAX_SHARE_SERIES)
  assert.ok(pinned.series.some((s) => s.key === 'KR:000009' && s.pinned))
  assert.ok(!pinned.series.some((s) => s.key === 'KR:000007'))
  // Colours follow size: the pinned small one is drawn last.
  assert.equal(pinned.series.at(-1)!.key, 'KR:000009')
})

test('an unpriced security is left out of that date only, and the date is listed with its cost share', () => {
  const { series, points, excluded } = positionShares({
    rows: [
      { ...row('a', 'KR', 'X1', 100), costKrw: 100 },
      { ...row('a', 'KR', 'X2', 300), costKrw: 300 },
      { ...row('b', 'KR', 'X1', 300), costKrw: 100 },
      { ...row('b', 'KR', 'X2', 100), costKrw: 300 },
      { ...row('b', 'KR', 'BOND', null), costKrw: 100 },
    ],
    dates: ['a', 'b'],
    held: [],
    scope: 'all',
  })
  assert.deepEqual(series.map((s) => s.key), ['KR:X1', 'KR:X2'])
  // Date b: shares of the priced 400, the bond out.
  assert.deepEqual([points[1].s0, points[1].s1, points[1].other], [75, 25, 0])
  assert.deepEqual(excluded, [{ date: 'b', count: 1, costPct: 20 }])
})

test('a drawn security with no price that day is a gap, not zero', () => {
  const { series, points } = positionShares({
    rows: [row('a', 'KR', 'A1', 100), row('a', 'KR', 'B1', 100), row('b', 'KR', 'A1', null), row('b', 'KR', 'B1', 100)],
    dates: ['a', 'b'],
    held: [],
    scope: 'all',
    pins: ['KR:A1'],
  })
  const a = series.find((s) => s.key === 'KR:A1')!
  const b = series.find((s) => s.key === 'KR:B1')!
  assert.equal(points[1][a.id], null)
  assert.equal(points[1][b.id], 100)
})

test('a date with nothing priced is unknown for every band', () => {
  const { points } = positionShares({ rows: [row('a', 'KR', 'A1', 100), row('b', 'KR', 'A1', null)], dates: ['a', 'b'], held: [], scope: 'all' })
  assert.equal(points[1].s0, null)
})

test('moves read the first and last known shares', () => {
  const series = [{ id: 's0', key: 'k', name: 'n', market: 'KR', pinned: false }]
  const moves = shareMoves(
    [
      { date: 'a', total: 100, other: 0, s0: 20 },
      { date: 'b', total: 100, other: null, s0: null },
      { date: 'c', total: 100, other: 0, s0: 35 },
    ],
    series
  )
  assert.deepEqual(moves, [{ id: 's0', pct: 35, changePp: 15 }])
})
