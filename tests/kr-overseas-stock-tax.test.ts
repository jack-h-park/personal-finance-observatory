import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateKrOverseasStockTax } from '../lib/domain/taxes/kr-overseas-stock-tax'

test('applies the annual deduction once and reports national and local tax changes', () => {
  assert.deepEqual(estimateKrOverseasStockTax('2,000,000', '12,000,000'), {
    status: 'ready',
    baseline: { taxable: 0n, national: 0n, local: 0n, total: 0n },
    scenario: { taxable: 9_500_000n, national: 1_900_000n, local: 190_000n, total: 2_090_000n },
    delta: { taxable: 9_500_000n, national: 1_900_000n, local: 190_000n, total: 2_090_000n },
  })
})

test('preserves loss scenarios and reports a signed decrease', () => {
  const result = estimateKrOverseasStockTax('7,500,000', '-3,000,000')
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.scenario.total, 0n)
  assert.equal(result.delta.total, -1_100_000n)
})

test('handles the deduction boundary and plans in whole won by component', () => {
  const result = estimateKrOverseasStockTax('2500000', '2500025')
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(result.baseline.total, 0n)
  assert.deepEqual(result.scenario, { taxable: 25n, national: 5n, local: 1n, total: 6n })
  const unchanged = estimateKrOverseasStockTax('0', '0')
  assert.equal(unchanged.status, 'ready')
  if (unchanged.status === 'ready') assert.equal(unchanged.delta.total, 0n)
})

test('requires both amounts and rejects malformed or oversized input', () => {
  for (const invalid of ['', ' ', '1e6', '10,00', '100.5', '₩100', '1000000000000000']) {
    assert.deepEqual(estimateKrOverseasStockTax(invalid, '0'), { status: 'unavailable' })
    assert.deepEqual(estimateKrOverseasStockTax('0', invalid), { status: 'unavailable' })
  }
})

test('does not inherit a preferential SME rate or a domestic major-shareholder bracket', () => {
  const result = estimateKrOverseasStockTax('0', '402500000')
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.scenario, { taxable: 400_000_000n, national: 80_000_000n, local: 8_000_000n, total: 88_000_000n })
})
