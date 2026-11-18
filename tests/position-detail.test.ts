import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { Holding, PositionDetail, WashSaleReview } from '@/lib/adapters/portfolio-db'
import { accountRows, washSaleForTicker } from '@/lib/position-detail'

type Window = WashSaleReview['windows'][number]

function windowFor(ticker: string): Window {
  return {
    ticker,
    blockedThrough: '2026-01-31',
    clearFrom: '2026-02-01',
    daysLeft: 10,
    loss: -100,
    possiblyDisallowed: 0,
    sales: [],
    boughtSinceSale: false,
    stillHeldIn: [],
  }
}

const review: WashSaleReview = {
  today: '2026-01-21',
  transactionsThrough: '2026-01-20',
  windows: [windowFor('AAA'), windowFor('BBB')],
}

test('washSaleForTicker keeps only the US ticker on the page', () => {
  const only = washSaleForTicker(review, 'US', 'AAA')
  assert.deepEqual(only.windows.map((w) => w.ticker), ['AAA'])
  assert.equal(only.today, review.today)
  assert.equal(only.transactionsThrough, review.transactionsThrough)
})

test('washSaleForTicker returns no windows outside the US market', () => {
  assert.deepEqual(washSaleForTicker(review, 'KR', 'AAA').windows, [])
})

test('washSaleForTicker returns no windows for a ticker without one', () => {
  assert.deepEqual(washSaleForTicker(review, 'US', 'CCC').windows, [])
})

function holding(brokerage: string, account: string, quantity: number): Holding {
  return {
    id: 1,
    market: 'US',
    currency: 'USD',
    brokerage,
    account,
    ticker: 'AAA',
    name: 'Example',
    quantity,
    native_cost: quantity * 10,
    native_market_value: quantity * 12,
    native_unrealized_gl: quantity * 2,
    native_unrealized_gl_pct: 20,
    base_cost: null,
    base_market_value: null,
    base_unrealized_gl: null,
    total_cost_krw: 0,
    long_term_qty: null,
    short_term_qty: null,
    lot_count: null,
  }
}

const lot = (brokerage: string, account: string, tax_term: string, cost_basis_krw: number | null) => ({
  brokerage,
  account,
  tax_term,
  cost_basis_krw,
})

test('accountRows profiles each account holding from its lots', () => {
  const holdings: PositionDetail['holdings'] = [holding('Broker A', 'acct-1', 5), holding('Broker B', 'acct-2', 3)]
  const lots: PositionDetail['lots'] = [
    lot('Broker A', 'acct-1', 'Long-term', 1000),
    lot('Broker A', 'acct-1', 'Short-term', 500),
    lot('Broker A', 'acct-1', 'Long-term', null),
    lot('Broker B', 'acct-2', 'Short-term', 300),
    // Same account name at another broker: not this holding's lot.
    lot('Broker B', 'acct-1', 'Long-term', 9999),
  ]
  const rows = accountRows(holdings, lots)
  assert.equal(rows.length, 2)
  const [a, b] = rows
  assert.equal(a.brokerage, 'Broker A')
  assert.equal(a.account, 'acct-1')
  assert.equal(a.quantity, 5)
  assert.equal(a.native_cost, 50)
  assert.equal(a.native_market_value, 60)
  assert.equal(a.native_unrealized_gl, 10)
  assert.equal(a.currency, 'USD')
  assert.equal(a.lot_count, 3)
  assert.equal(a.long_count, 2)
  assert.equal(a.short_count, 1)
  assert.equal(a.lot_cost_krw, 1500)
  assert.equal(b.lot_count, 1)
  assert.equal(b.long_count, 0)
  assert.equal(b.short_count, 1)
  assert.equal(b.lot_cost_krw, 300)
  assert.notEqual(a.id, b.id)
})

test('accountRows gives a holding without lots zero counts', () => {
  const [row] = accountRows([holding('Broker A', 'acct-1', 2)], [])
  assert.equal(row.lot_count, 0)
  assert.equal(row.long_count, 0)
  assert.equal(row.short_count, 0)
  assert.equal(row.lot_cost_krw, 0)
})
