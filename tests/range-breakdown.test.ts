import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { costBasisGap, rangeBreakdown, topDrivers, type SecurityDriver } from '@/lib/range-breakdown'
import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'

const A = '2026-01-31'
const B = '2026-02-28'

const row = (date: string, ticker: string, costKrw: number, marketValueKrw: number | null, extra: Partial<PositionSnapshotRow> = {}): PositionSnapshotRow => ({
  date,
  market: 'KR',
  ticker,
  name: `Name ${ticker}`,
  quantity: 10,
  costKrw,
  marketValueKrw,
  ...extra,
})

const gain = (ticker: string, realizedKrw: number, market = 'KR'): RealizedGainRow => ({ market, ticker, soldDate: '2026-02-10', realizedKrw })

const run = (rows: PositionSnapshotRow[], realized: RealizedGainRow[] = [], markets = ['KR', 'US']) => rangeBreakdown({ from: A, to: B, rows, realized, markets })

test('buy only', () => {
  const r = run([row(B, 'X', 1000, 1200)])
  assert.equal(r.securities.length, 1)
  const s = r.securities[0]
  assert.equal(s.valueChange, 1200)
  assert.equal(s.marketEffect, 200)
  assert.equal(s.moneyIn, 1000)
  assert.equal(r.marketEffectTotal, 200)
  assert.equal(r.moneyInTotal, 1000)
})

test('price only', () => {
  const s = run([row(A, 'X', 1000, 1000), row(B, 'X', 1000, 1300)]).securities[0]
  assert.equal(s.moneyIn, 0)
  assert.equal(s.marketEffect, 300)
})

test('full sale with gain', () => {
  const s = run([row(A, 'X', 1000, 1100)], [gain('X', 150)]).securities[0]
  assert.equal(s.valueChange, -1100)
  assert.equal(s.marketEffect, 50)
  assert.equal(s.moneyIn, -1150)
  assert.equal(s.realized, 150)
})

test('round trip inside the period', () => {
  const s = run([], [gain('X', 80)]).securities[0]
  assert.equal(s.valueChange, 0)
  assert.equal(s.marketEffect, 80)
  assert.equal(s.moneyIn, -80)
})

test('unpriced security goes to coverage', () => {
  const r = run([row(A, 'X', 900, 1000), row(B, 'X', 900, null), row(B, 'Y', 500, 600)])
  assert.equal(r.securities.length, 1)
  assert.equal(r.securities[0].ticker, 'Y')
  assert.deepEqual(r.unpriced, [{ market: 'KR', ticker: 'X', name: 'Name X', costKrw: 900, missingOn: [B] }])
  assert.equal(r.moneyInTotal, 500)
})

test('markets filter', () => {
  const r = run([row(B, 'X', 1000, 1200), row(B, 'BTC', 500, 700, { market: 'CRYPTO' })])
  assert.deepEqual(r.securities.map((s) => s.ticker), ['X'])
  const c = run([row(B, 'X', 1000, 1200), row(B, 'BTC', 500, 700, { market: 'CRYPTO' })], [], ['CRYPTO'])
  assert.deepEqual(c.securities.map((s) => s.ticker), ['BTC'])
})

test('realized gain under another market joins the held security', () => {
  const r = run([row(A, 'X', 1000, 1000), row(B, 'X', 1000, 1100)], [gain('X', 70, 'US')])
  assert.equal(r.securities.length, 1)
  assert.equal(r.securities[0].market, 'KR')
  assert.equal(r.securities[0].realized, 70)
  assert.equal(r.securities[0].marketEffect, 170)
})

test('securities are sorted by absolute value change', () => {
  const r = run([row(B, 'S', 100, 100), row(B, 'L', 100, 5000), row(A, 'N', 900, 900)])
  assert.deepEqual(r.securities.map((s) => s.ticker), ['L', 'N', 'S'])
})

const driver = (i: number): SecurityDriver => ({ market: 'KR', ticker: `T${i}`, name: `T${i}`, valueChange: 100 - i, moneyIn: 10, marketEffect: 90 - i, realized: 1 })

test('topDrivers groups the rest', () => {
  const ds = Array.from({ length: 10 }, (_, i) => driver(i))
  const { shown, other } = topDrivers(ds, 8)
  assert.equal(shown.length, 8)
  assert.ok(other)
  assert.equal(other.count, 2)
  assert.equal(other.ticker, '')
  assert.equal(other.valueChange, ds[8].valueChange + ds[9].valueChange)
  assert.equal(other.moneyIn, 20)
  assert.equal(other.marketEffect, ds[8].marketEffect + ds[9].marketEffect)
  assert.equal(other.realized, 2)
  assert.equal(topDrivers(ds.slice(0, 3), 8).other, null)
})

test('cost basis gap is named, not folded into money in', () => {
  assert.equal(costBasisGap(500, 620), 120)
  assert.equal(costBasisGap(500, 500.4), null)
  assert.equal(costBasisGap(500, null), null)
  const s = run([row(B, 'X', 1000, 1200)]).securities[0]
  assert.equal(s.moneyIn, 1000)
})
