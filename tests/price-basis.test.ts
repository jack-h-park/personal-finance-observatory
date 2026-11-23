// The line that says which prices a valuation used, and when no single date covers it.
// Every date below is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPriceBasis, pricesDifferByDate } from '../lib/price-basis'

const labels = { market: { KR: 'Korea', US: 'US', CRYPTO: 'Crypto' }, oldest: (d: string) => `oldest ${d}` }

test('each market is named with its newest price date, and an older tail is shown', () => {
  assert.equal(
    formatPriceBasis(
      [
        { market: 'KR', newest: '2030-01-08', oldest: '2030-01-07' },
        { market: 'US', newest: '2030-01-04', oldest: null },
      ],
      labels
    ),
    'Korea 2030-01-08 (oldest 2030-01-07) · US 2030-01-04'
  )
  assert.equal(formatPriceBasis([], labels), '')
})

test('markets priced on different dates, or one with an older tail, have no single date', () => {
  assert.equal(pricesDifferByDate([{ market: 'KR', newest: '2030-01-08', oldest: null }, { market: 'US', newest: '2030-01-08', oldest: null }]), false)
  assert.equal(pricesDifferByDate([{ market: 'KR', newest: '2030-01-08', oldest: null }, { market: 'US', newest: '2030-01-04', oldest: null }]), true)
  assert.equal(pricesDifferByDate([{ market: 'KR', newest: '2030-01-08', oldest: '2030-01-07' }]), true)
  assert.equal(pricesDifferByDate([]), false)
})
