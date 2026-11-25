import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { attribute, ATTRIBUTION_MARKETS } from '@/lib/market-attribution'
import { rangeBreakdown } from '@/lib/range-breakdown'
import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'

const A = '2026-01-31'
const B = '2026-02-28'

const row = (date: string, market: PositionSnapshotRow['market'], ticker: string, costKrw: number, marketValueKrw: number | null): PositionSnapshotRow => ({
  date,
  market,
  ticker,
  name: `Name ${ticker}`,
  quantity: 1,
  costKrw,
  marketValueKrw,
})

const gain = (market: string, ticker: string, realizedKrw: number): RealizedGainRow => ({ market, ticker, soldDate: '2026-02-10', realizedKrw })

test('a purchase is money in, not market effect', () => {
  const rows = [row(A, 'KR', '000100', 100, 100), row(B, 'KR', '000100', 200, 230)]
  const r = attribute({ from: A, to: B, rows, realized: [], held: [{ market: 'KR', ticker: '000100' }] })
  assert.equal(r.byMarket.KR.moneyIn, 100)
  assert.equal(r.byMarket.KR.marketEffect, 30)
})

test('a Toss-held US stock sold in full lands under US', () => {
  const rows = [row(A, 'KR', 'TSLQ', 100, 100)]
  const r = attribute({ from: A, to: B, rows, realized: [gain('KR', 'TSLQ', 50)], held: [] })
  assert.equal(r.byMarket.US.marketEffect, 50)
  assert.equal(r.byMarket.KR.marketEffect, 0)
  assert.equal(r.byMarket.KR.startValue, 0)
  assert.equal(r.byMarket.US.startValue, 100)
})

const mixedRows = [
  row(A, 'KR', '000100', 100, 120),
  row(B, 'KR', '000100', 100, 150),
  row(A, 'KR', 'ABCD', 200, 210),
  row(B, 'KR', 'ABCD', 250, 300),
  row(A, 'CRYPTO', 'BTC', 50, 80),
  row(B, 'CRYPTO', 'BTC', 50, 70),
  row(A, 'KR', 'GONE', 40, 45),
]
const mixedGains = [gain('KR', 'GONE', 7), gain('KR', '000100', 3)]
const mixedHeld = [
  { market: 'KR', ticker: '000100' },
  { market: 'US', ticker: 'ABCD' },
  { market: 'CRYPTO', ticker: 'BTC' },
]

test('totals equal the unmapped rangeBreakdown', () => {
  const r = attribute({ from: A, to: B, rows: mixedRows, realized: mixedGains, held: mixedHeld })
  const plain = rangeBreakdown({ from: A, to: B, rows: mixedRows, realized: mixedGains, markets: ['KR', 'US', 'CRYPTO'] })
  assert.equal(r.breakdown.marketEffectTotal, plain.marketEffectTotal)
  assert.equal(r.breakdown.moneyInTotal, plain.moneyInTotal)
  const sum = ATTRIBUTION_MARKETS.reduce((s, m) => s + r.byMarket[m].marketEffect, 0)
  assert.equal(sum, r.breakdown.marketEffectTotal)
  assert.ok(r.byMarket.US.endValue === 300)
})

test('start + money in + effect = end, unpriced excluded', () => {
  const rows = [...mixedRows, row(A, 'US', 'NOPRICE', 10, null), row(B, 'US', 'NOPRICE', 10, null)]
  const r = attribute({ from: A, to: B, rows, realized: mixedGains, held: mixedHeld })
  assert.equal(r.breakdown.unpriced.length, 1)
  const moneyIn = ATTRIBUTION_MARKETS.reduce((s, m) => s + r.byMarket[m].moneyIn, 0)
  const effect = ATTRIBUTION_MARKETS.reduce((s, m) => s + r.byMarket[m].marketEffect, 0)
  assert.equal(r.startValue + moneyIn + effect, r.endValue)
  assert.equal(r.startValue, 120 + 210 + 80 + 45)
  assert.equal(r.endValue, 150 + 300 + 70)
})

test('one ticker under two markets, held in one, is merged before the split', () => {
  const rows = [
    row(A, 'KR', 'TSLQ', 100, 100),
    row(A, 'US', 'TSLQ', 100, 100),
    row(B, 'KR', 'TSLQ', 100, 150),
    row(B, 'US', 'TSLQ', 100, 150),
  ]
  const r = attribute({ from: A, to: B, rows, realized: [], held: [{ market: 'US', ticker: 'TSLQ' }] })
  assert.equal(r.startValue, 200)
  assert.equal(r.endValue, 300)
  assert.equal(r.byMarket.US.marketEffect, 100)
  assert.equal(r.byMarket.US.moneyIn, 0)
  const moneyIn = ATTRIBUTION_MARKETS.reduce((s, m) => s + r.byMarket[m].moneyIn, 0)
  const effect = ATTRIBUTION_MARKETS.reduce((s, m) => s + r.byMarket[m].marketEffect, 0)
  assert.equal(r.startValue + moneyIn + effect, r.endValue)
  const plain = rangeBreakdown({ from: A, to: B, rows, realized: [], markets: ['KR', 'US', 'CRYPTO'] })
  assert.equal(r.breakdown.marketEffectTotal, plain.marketEffectTotal)
})
