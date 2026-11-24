import assert from 'node:assert/strict'
import test from 'node:test'
import { dayChange, type DayChangeRow } from '../lib/day-change'

const row = (over: Partial<DayChangeRow> = {}): DayChangeRow => ({
  market: 'KR',
  ticker: 'AAA',
  name: 'Alpha',
  currency: 'KRW',
  quantity: 10,
  price: 110,
  quoteDate: '2026-11-20',
  fxNow: null,
  prevClose: 100,
  prevCloseDate: '2026-11-19',
  prevFx: null,
  ...over
})

test('a KRW row: change is quantity times price move', () => {
  const result = dayChange([row()])
  assert.equal(result.markets.length, 1)
  assert.equal(result.markets[0].market, 'KR')
  assert.equal(result.markets[0].changeKrw, 100)
  assert.equal(result.markets[0].prevValueKrw, 1000)
  assert.equal(result.markets[0].pct, 10)
  assert.equal(result.usdKrw, null)
})

test('a USD row folds in the FX move', () => {
  const result = dayChange([
    row({ market: 'US', ticker: 'USA', currency: 'USD', quantity: 1, price: 11, prevClose: 10, fxNow: 1100, prevFx: 1000 })
  ])
  assert.equal(result.markets[0].changeKrw, 2100)
  assert.deepEqual(result.usdKrw, { now: 1100, prev: 1000, prevDate: '2026-11-19' })
})

test('a purchase today is not a gain', () => {
  const result = dayChange([row({ quantity: 20, price: 100, prevClose: 100 })])
  assert.equal(result.markets[0].changeKrw, 0)
  assert.equal(result.up.length, 0)
  assert.equal(result.down.length, 0)
})

test('a closed market reports its last session', () => {
  const result = dayChange([
    row({ market: 'US', currency: 'USD', price: 12, prevClose: 10, fxNow: 1000, prevFx: 1000, quoteDate: '2026-11-20', prevCloseDate: '2026-11-19' })
  ])
  assert.equal(result.markets[0].session, '2026-11-20')
  assert.notEqual(result.markets[0].changeKrw, 0)
})

test('a row quoted a day older is excluded', () => {
  const result = dayChange([row({ ticker: 'NEW' }), row({ ticker: 'OLD', quoteDate: '2026-11-19', prevCloseDate: '2026-11-18' })])
  assert.equal(result.markets[0].session, '2026-11-20')
  assert.equal(result.markets[0].changeKrw, 100)
  assert.equal(result.excluded, 1)
})

test('rows missing a price or a previous close are excluded', () => {
  const result = dayChange([
    row(),
    row({ ticker: 'NOP', price: null }),
    row({ ticker: 'NOC', prevClose: null }),
    row({ ticker: 'NOD', prevCloseDate: null }),
    row({ market: 'US', ticker: 'NOFX', currency: 'USD', fxNow: null, prevFx: 1000 }),
    row({ market: 'OTHER', ticker: 'ODD' })
  ])
  assert.equal(result.excluded, 5)
  assert.equal(result.markets.length, 1)
  assert.equal(result.total?.changeKrw, 100)
})

test('contributors sum accounts and cap at five each way', () => {
  const gainers = Array.from({ length: 7 }, (_, i) => row({ ticker: `G${i}`, quantity: 1, price: 101 + i, prevClose: 100 }))
  const split = [row({ ticker: 'SPL', quantity: 1, price: 150, prevClose: 100 }), row({ ticker: 'SPL', quantity: 2, price: 150, prevClose: 100 })]
  const losers = [row({ ticker: 'L1', quantity: 1, price: 90 }), row({ ticker: 'L2', quantity: 1, price: 70 })]
  const result = dayChange([...gainers, ...split, ...losers])
  assert.equal(result.up.length, 5)
  assert.equal(result.up[0].ticker, 'SPL')
  assert.equal(result.up[0].changeKrw, 150)
  assert.equal(result.up[0].pricePct, 50)
  assert.deepEqual(result.up.map((c) => c.changeKrw), [...result.up.map((c) => c.changeKrw)].sort((a, b) => b - a))
  assert.deepEqual(result.down.map((c) => c.ticker), ['L2', 'L1'])
})

test('total sums markets', () => {
  const result = dayChange([
    row(),
    row({ market: 'US', ticker: 'USA', currency: 'USD', quantity: 1, price: 11, prevClose: 10, fxNow: 1100, prevFx: 1000 }),
    row({ market: 'CRYPTO', ticker: 'CRY', quantity: 1, price: 2000, prevClose: 1000 })
  ])
  assert.deepEqual(result.markets.map((m) => m.market), ['KR', 'US', 'CRYPTO'])
  assert.equal(result.total?.changeKrw, 100 + 2100 + 1000)
  assert.equal(result.total?.pct, (3200 / (1000 + 10000 + 1000)) * 100)
})

test('no counted rows gives no total', () => {
  const result = dayChange([row({ price: null })])
  assert.equal(result.total, null)
  assert.deepEqual(result.markets, [])
  assert.equal(result.excluded, 1)
})
