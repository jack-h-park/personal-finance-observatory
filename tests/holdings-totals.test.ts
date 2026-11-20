import assert from 'node:assert/strict'
import { test } from 'node:test'
import { holdingsTotals } from '../lib/holdings-totals'

const holding = { base_cost: 20, total_cost_krw: 15, base_market_value: 21, base_unrealized_gl: 1 }

test('an empty filter result has no money totals', () => {
  assert.deepEqual(holdingsTotals([]), { cost: null, marketValue: null, unrealized: null })
})

test('a real zero stays zero and the existing cost fallback is preserved', () => {
  assert.deepEqual(holdingsTotals([holding, { ...holding, base_cost: null, base_market_value: 3, base_unrealized_gl: -1 }]), {
    cost: 35, marketValue: 24, unrealized: 0,
  })
})

test('missing valuations invalidate only the affected totals', () => {
  assert.deepEqual(holdingsTotals([holding, { ...holding, base_market_value: null }]), {
    cost: 40, marketValue: null, unrealized: 2,
  })
  assert.deepEqual(holdingsTotals([{ ...holding, base_market_value: 0, base_unrealized_gl: null }]), {
    cost: 20, marketValue: 0, unrealized: null,
  })
})
