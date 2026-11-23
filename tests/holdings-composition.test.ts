import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { aggregateSecurities, concentration, gainContributors, securityWeights } from '../lib/holdings-composition'

const row = (market: string, ticker: string, value: number | null, gain: number | null = 0, name = ticker) => ({
  market,
  ticker,
  name,
  base_market_value: value,
  base_unrealized_gl: gain,
})

test('a security held in two accounts is one position; an unpriced account row makes it unknown', () => {
  const securities = aggregateSecurities([row('KR', '005930', 100, 10), row('KR', '005930', 50, 5), row('US', 'NVDA', 30, null), row('US', 'NVDA', null, 1)])
  assert.deepEqual(
    securities.map((s) => [s.key, s.value, s.gain]),
    [
      ['KR:005930', 150, 15],
      ['US:NVDA', null, null],
    ]
  )
})

test('weights are of the priced total, largest first, and skip unpriced positions', () => {
  const weights = securityWeights(aggregateSecurities([row('KR', 'A', 300), row('KR', 'B', 100), row('KR', 'C', null)]))
  assert.deepEqual(weights.map((w) => [w.ticker, w.pct]), [['A', 75], ['B', 25]])
})

test('concentration: top shares and the effective number of holdings', () => {
  const equal = concentration(aggregateSecurities(Array.from({ length: 4 }, (_, i) => row('KR', `S${i}`, 100))))!
  assert.equal(equal.count, 4)
  assert.ok(Math.abs(equal.effectiveCount - 4) < 1e-9)
  assert.equal(equal.top5Pct, 100)

  const skewed = concentration(aggregateSecurities([row('KR', 'A', 80), row('KR', 'B', 10), row('KR', 'C', 10)]))!
  // 1 / (0.64 + 0.01 + 0.01)
  assert.ok(Math.abs(skewed.effectiveCount - 1 / 0.66) < 1e-9)
  assert.equal(concentration([]), null)
})

test('gain contributors split gains from losses and leave unknown or flat gains out', () => {
  const { gainers, losers } = gainContributors(
    aggregateSecurities([row('KR', 'A', 1, 50), row('KR', 'B', 1, -20), row('KR', 'C', 1, 0), row('KR', 'D', 1, null), row('KR', 'E', 1, 70), row('KR', 'F', 1, -40)]),
    1
  )
  assert.deepEqual(gainers.map((s) => s.ticker), ['E'])
  assert.deepEqual(losers.map((s) => s.ticker), ['F'])
})
