import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregatePositions } from '../scripts/position-snapshots.mjs'

test('aggregates accounts into one row per security', () => {
  const rows = aggregatePositions(
    [
      { market: 'KR', account: 'a', ticker: '005930', quantity: 3, cost: 300, marketValue: 330 },
      { market: 'KR', account: 'b', ticker: '005930', quantity: 2, cost: 200, marketValue: 220 },
    ],
    new Map([['KR:005930', 'Samsung']])
  )
  assert.deepEqual(rows, [
    { market: 'KR', ticker: '005930', name: 'Samsung', quantity: 5, cost_krw: 500, market_value_krw: 550 },
  ])
})

test('an unpriced account makes the security unpriced', () => {
  const [row] = aggregatePositions(
    [
      { market: 'KR', account: 'a', ticker: '005930', quantity: 3, cost: 300, marketValue: 330 },
      { market: 'KR', account: 'b', ticker: '005930', quantity: 2, cost: 200, marketValue: null },
    ],
    new Map()
  )
  assert.equal(row.market_value_krw, null)
  assert.equal(row.cost_krw, 500)
})

test('names come from the map, ticker as fallback', () => {
  const rows = aggregatePositions(
    [
      { market: 'US', account: 'a', ticker: 'AAPL', quantity: 1, cost: 1, marketValue: 2 },
      { market: 'US', account: 'a', ticker: 'MSFT', quantity: 1, cost: 1, marketValue: 2 },
    ],
    new Map([['US:AAPL', 'Apple']])
  )
  assert.deepEqual(rows.map((r) => r.name), ['Apple', 'MSFT'])
})
