import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateInvestmentTaxReserve } from '../lib/domain/taxes/investment-tax-reserve'

const base = { taxable: '100,000', preferential: '0', magi: '247000', nii: '5000' }
const scenario = { taxable: '114000', preferential: '10000', magi: '261000', nii: '19000' }
const input = { profile: 'supported', filing: 'mfj', baseline: base, scenario }

test('2027 MFJ scenario crosses NIIT threshold and stacks preferred income above ordinary income', () => {
  const result = estimateInvestmentTaxReserve(input)
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.delta, { regular: 198000n, niit: 41800n, total: 239800n })
})

test('2027 single scenario straddles the 15 and 20 percent ceilings and applies NIIT to incremental NII', () => {
  const result = estimateInvestmentTaxReserve({
    ...input, filing: 'single',
    baseline: { taxable: '560000', preferential: '10000', magi: '700000', nii: '10000' },
    scenario: { taxable: '570000', preferential: '20000', magi: '710000', nii: '20000' },
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.delta, { regular: 184000n, niit: 38000n, total: 222000n })
})

test('the preferred slice is zero-rated under the published ceiling and a reduction stays signed', () => {
  const zero = { taxable: '0', preferential: '0', magi: '0', nii: '0' }
  const gains = { taxable: '51050', preferential: '51050', magi: '51050', nii: '51050' }
  const atCeiling = estimateInvestmentTaxReserve({ ...input, filing: 'single', baseline: zero, scenario: gains })
  assert.equal(atCeiling.status, 'ready')
  if (atCeiling.status !== 'ready') return
  assert.equal(atCeiling.delta.total, 0n)
  const reverse = estimateInvestmentTaxReserve({ ...input, baseline: scenario, scenario: base })
  assert.equal(reverse.status, 'ready')
  if (reverse.status !== 'ready') return
  assert.equal(reverse.delta.total, -239800n)
})

test('unknown scope, invalid filing type, blanks, malformed amounts, and inconsistent scope return no result', () => {
  assert.deepEqual(estimateInvestmentTaxReserve({ ...input, profile: '' }), { status: 'unavailable', reason: 'profile' })
  assert.deepEqual(estimateInvestmentTaxReserve({ ...input, filing: 'mfs' }), { status: 'unavailable', reason: 'filing' })
  for (const taxable of ['', '1,00.00', '1e8', '-100', '100.001']) {
    assert.deepEqual(estimateInvestmentTaxReserve({ ...input, scenario: { ...scenario, taxable } }), { status: 'unavailable', reason: 'amount' })
  }
  assert.deepEqual(estimateInvestmentTaxReserve({ ...input, scenario: { ...scenario, preferential: '114001' } }), { status: 'unavailable', reason: 'preferential' })
})

test('regular tax at every published bracket boundary matches the IRS table bases', () => {
  const zero = { taxable: '0', preferential: '0', magi: '0', nii: '0' }
  const references = {
    single: [[12800, 128000], [52025, 598700], [109125, 1854900], [208325, 4235700], [264550, 6034900], [661375, 19923775]],
    mfj: [[25600, 256000], [104050, 1197400], [218250, 3709800], [416650, 8471400], [529100, 12069800], [793650, 21329050]],
  }
  for (const [filing, rows] of Object.entries(references)) {
    for (const [taxable, baseTaxCents] of rows) {
      const result = estimateInvestmentTaxReserve({ ...input, filing, baseline: zero, scenario: { ...zero, taxable: String(taxable) } })
      assert.equal(result.status, 'ready')
      if (result.status === 'ready') assert.equal(result.scenario.regular, BigInt(baseTaxCents))
    }
  }
})

test('2026 rate schedules match the published ordinary bracket base amounts', () => {
  const zero = { taxable: '0', preferential: '0', magi: '0', nii: '0' }
  const references = {
    single: [[12400, 124000], [50400, 580000], [105700, 1796600], [201775, 4102400], [256225, 5844800], [640600, 19297925]],
    mfj: [[24800, 248000], [100800, 1160000], [211400, 3593200], [403550, 8204800], [512450, 11689600], [768700, 20658350]],
  }
  for (const [filing, rows] of Object.entries(references)) {
    for (const [taxable, taxCents] of rows) {
      const result = estimateInvestmentTaxReserve({ ...input, year: 2026, filing, baseline: zero, scenario: { ...zero, taxable: String(taxable) } })
      assert.equal(result.status, 'ready')
      if (result.status === 'ready') assert.equal(result.scenario.regular, BigInt(taxCents))
    }
  }
})

test('2026 eligible capital gains cross the 0% and 15% thresholds at the exact dollar', () => {
  const zero = { taxable: '0', preferential: '0', magi: '0', nii: '0' }
  const references = { single: [49450, 545500], mfj: [98900, 613700] }
  for (const [filing, [zeroCeiling, fifteenCeiling]] of Object.entries(references)) {
    for (const [gain, expected] of [[zeroCeiling, 0], [zeroCeiling + 1, 15], [fifteenCeiling + 1, (fifteenCeiling - zeroCeiling) * 15 + 20]]) {
      const result = estimateInvestmentTaxReserve({
        ...input, year: 2026, filing, baseline: zero, scenario: { ...zero, taxable: String(gain), preferential: String(gain) },
      })
      assert.equal(result.status, 'ready')
      if (result.status === 'ready') assert.equal(result.delta.regular, BigInt(expected))
    }
  }
})
