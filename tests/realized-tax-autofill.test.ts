import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeRealizedTaxInputs } from '@/lib/application/realized-tax-inputs'
import { estimateKrRecordedStockTax } from '@/lib/domain/taxes/kr-overseas-stock-tax'
import { scenarioWithRecordedGains } from '@/lib/domain/taxes/investment-tax-reserve'
import type { RealizedLotView } from '@/lib/realized-lots'

const lot = (overrides: Partial<RealizedLotView> = {}) => ({
  sold_year: '2026', market: 'US', currency: 'USD', ticker: 'SAMPLE', account_wrapper: 'taxable',
  asset_class: 'security', tax_term: 'Short-term', basis: 'replay', gain_usd: 100.21, cost_usd: 150,
  proceeds_krw: 260000, acquisition_cost_krw: 100000, ...overrides,
}) as RealizedLotView

test('rolls up the selected year with jurisdiction-specific measures and records skipped lots', () => {
  const input = summarizeRealizedTaxInputs([
    lot(),
    lot({ tax_term: 'Long-term', gain_usd: -20.55 }),
    lot({ tax_term: 'Long-term', basis: '1099b', native_realized_gl: 12, gain_usd: 3 }),
    lot({ ticker: '', basis: '1099b', native_realized_gl: 9999 }),
    lot({ ticker: ' ' }),
    lot({ tax_term: 'Undetermined', acquisition_cost_krw: null }),
    lot({ ticker: 'IAU', collectible: true }),
    lot({ account_wrapper: 'isa', market: 'KR' }),
    lot({ market: 'KR' }),
    lot({ superseded_by: 'form' }),
    lot({ sold_year: '2027' }),
  ], 2026)
  assert.deepEqual(input.us, { shortUsd: 100.21, longUsd: -20.55, lots: 2, skipped: 7 })
  assert.deepEqual(input.kr, { gainKrw: 320000, lots: 2, skipped: 5 })
})

test('distinguishes zero, unavailable basis, and no rows in the selected year', () => {
  assert.deepEqual(summarizeRealizedTaxInputs([lot({ gain_usd: 0 })], 2027), {
    us: { shortUsd: 0, longUsd: 0, lots: 0, skipped: 0 },
    kr: { gainKrw: 0, lots: 0, skipped: 0 },
  })
  const input = summarizeRealizedTaxInputs([
    lot({ gain_usd: 0, acquisition_cost_krw: 260000 }),
    lot({ gain_usd: null, acquisition_cost_krw: null }),
    lot({ gain_usd: 900, cost_usd: 0, acquisition_cost_krw: 0 }),
  ], 2026)
  assert.deepEqual(input.us, { shortUsd: 0, longUsd: 0, lots: 1, skipped: 2 })
  assert.deepEqual(input.kr, { gainKrw: 0, lots: 1, skipped: 2 })
})

test('adds recorded gains and signed adjustments to complete US baseline values', () => {
  const baseline = { taxable: '100,000', preferential: '1000', magi: '160000', nii: '1000' }
  const recorded = { shortUsd: -250, longUsd: 1500.01 }
  assert.deepEqual(scenarioWithRecordedGains(baseline, recorded, { short: '-50', long: '' }), {
    taxable: '101200.01', preferential: '2200.01', magi: '161200.01', nii: '2200.01',
  })
  assert.deepEqual(scenarioWithRecordedGains(baseline, { shortUsd: 500, longUsd: -400 }, { short: '', long: '' }), {
    taxable: '100100.00', preferential: '1000.00', magi: '160100.00', nii: '1100.00',
  })
  assert.equal(scenarioWithRecordedGains(baseline, { shortUsd: -2500, longUsd: 100 }, { short: '', long: '' }), null)
  assert.equal(scenarioWithRecordedGains({ ...baseline, taxable: '1000' }, recorded, { short: '', long: '' }), null)
  assert.equal(scenarioWithRecordedGains({ ...baseline, nii: '' }, recorded, { short: '', long: '' }), null)
  assert.equal(scenarioWithRecordedGains(baseline, recorded, { short: 'abc', long: '' }), null)
})

test('applies the Korean annual deduction once after a signed correction', () => {
  const estimate = estimateKrRecordedStockTax(4000000, '-500,000', 2026)
  assert.equal(estimate.status, 'ready')
  if (estimate.status === 'ready') assert.equal(estimate.delta.total, 220000n)
  assert.equal(estimateKrRecordedStockTax(4000000, '0.5', 2026).status, 'unavailable')
  assert.equal(estimateKrRecordedStockTax(4000000, '+-1', 2026).status, 'unavailable')
})
