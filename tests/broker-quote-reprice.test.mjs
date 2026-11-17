import assert from 'node:assert/strict'
import test from 'node:test'
import { repriceFromQuote } from '../scripts/broker-quote-reprice.mjs'

// Invented figures; the repository is public.
const toBase = (value) => (value == null ? null : value * 1000)

const holding = () => ({
  market: 'US', currency: 'USD', as_of_date: '2026-11-12', quantity: 10, native_cost: 400,
  native_price: 50, native_market_value: 500, native_unrealized_gl: 100, native_unrealized_gl_pct: 25,
  base_market_value: 500_000, base_unrealized_gl: 100_000,
})

test('a newer quote revalues a holding at its price, keeping quantity and cost', () => {
  const row = holding()
  assert.equal(repriceFromQuote(row, { price: 60, currency: 'USD', asOfDate: '2026-11-16' }, toBase), true)
  assert.equal(row.native_price, 60)
  assert.equal(row.native_market_value, 600)
  assert.equal(row.native_unrealized_gl, 200)
  assert.equal(row.native_unrealized_gl_pct, 50)
  assert.equal(row.base_market_value, 600_000)
  assert.equal(row.base_unrealized_gl, 200_000)
  assert.equal(row.price_as_of, '2026-11-16')
  assert.equal(row.quantity, 10)
  assert.equal(row.native_cost, 400)
})

test('a tax lot is revalued on its own quantity and basis', () => {
  const lot = { currency: 'USD', as_of_date: '2026-11-12', open_quantity: 4, native_cost_basis: 100, native_market_value: 200, native_unrealized_gl: 100 }
  assert.equal(repriceFromQuote(lot, { price: 60, asOfDate: '2026-11-16' }, toBase), true)
  assert.equal(lot.native_market_value, 240)
  assert.equal(lot.native_unrealized_gl, 140)
  assert.equal('native_price' in lot, false)
})

test('a quote no newer than the file, in another currency, or missing leaves the broker price', () => {
  for (const quote of [
    { price: 60, currency: 'USD', asOfDate: '2026-11-12' },
    { price: 60, currency: 'USD', asOfDate: '2026-11-11' },
    { price: 60, currency: 'KRW', asOfDate: '2026-11-16' },
    { price: 0, currency: 'USD', asOfDate: '2026-11-16' },
    { price: 60, currency: 'USD' },
    undefined,
  ]) {
    const row = holding()
    assert.equal(repriceFromQuote(row, quote, toBase), false, JSON.stringify(quote))
    assert.deepEqual(row, holding())
  }
})
