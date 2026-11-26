import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateCrossBorderSaleTax, type CrossBorderSaleInput } from '../lib/domain/taxes/cross-border-sale-tax'

const example = {
  supported: true,
  filing: 'mfj',
  krwPerUsd: '1,300.50',
  baseline: { us: { taxable: '100000', preferential: '0', magi: '247000', nii: '5000' }, krwGain: '2000000' },
  scenario: { us: { taxable: '114000', preferential: '10000', magi: '261000', nii: '19000' }, krwGain: '12000000' },
  credit: { authority: 'unknown' },
} satisfies CrossBorderSaleInput

test('derives both jurisdictions and shows the gross delta alone until credit treatment is known', () => {
  const result = estimateCrossBorderSaleTax(example)
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.delta.us, { regular: 198000n, niit: 41800n, total: 239800n })
  assert.equal(result.delta.kr.national, 1_900_000n)
  assert.equal(result.delta.kr.local, 190_000n)
  assert.equal(result.delta.grossKrw, 5_208_599n)
  assert.deepEqual(result.credit, { status: 'unavailable', reason: 'unknown' })
})

test('takes the lower reviewed US credit amount and limit against regular tax alone', () => {
  const result = estimateCrossBorderSaleTax({
    ...example,
    credit: { authority: 'us', baseline: { eligibleTax: '0', limit: '0' }, scenario: { eligibleTax: '1500', limit: '1200' } },
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready' || result.credit.status !== 'ready') return assert.fail('Expected after-credit estimate')
  assert.equal(result.credit.scenario.usCreditCents, 120_000n)
  assert.equal(result.credit.scenario.usNetCents, result.scenario.us.total - 120_000n)
  assert.equal(result.credit.scenario.krNetWon, result.scenario.kr.total)
  assert.equal(result.credit.delta.combinedKrw, 3_647_999n)
})

test('applies the reviewed Korean credit in won against the Korean national component', () => {
  const result = estimateCrossBorderSaleTax({
    ...example,
    credit: { authority: 'kr', baseline: { eligibleTax: '0', limit: '0' }, scenario: { eligibleTax: '700000', limit: '800000' } },
  })
  if (result.status !== 'ready' || result.credit.status !== 'ready') return assert.fail('Expected after-credit estimate')
  assert.equal(result.credit.scenario.krCreditWon, 700_000n)
  assert.equal(result.credit.scenario.krNetWon, 1_390_000n)
  assert.equal(result.credit.scenario.usNetCents, result.scenario.us.total)
  assert.equal(result.credit.delta.combinedKrw, 4_508_599n)
})

test('does not silently zero missing credit facts or let a large credit spill into NIIT or local tax', () => {
  for (const [authority, eligibleTax, limit, reason] of [
    ['us', '', '100', 'creditAmount'],
    ['us', '100', '', 'creditAmount'],
    ['us', '13600', '13600', 'receivingTax'],
    ['kr', '2000000', '2000000', 'receivingTax'],
    ['kr', '100.5', '900', 'creditAmount'],
  ] as const) {
    const result = estimateCrossBorderSaleTax({
      ...example, credit: { authority, baseline: { eligibleTax: '0', limit: '0' }, scenario: { eligibleTax, limit } },
    })
    if (result.status !== 'ready') return assert.fail('Expected the pre-credit estimate')
    assert.deepEqual(result.credit, { status: 'unavailable', reason })
  }
})

test('explicit no credit keeps both totals equal and reverses the signed change', () => {
  const result = estimateCrossBorderSaleTax({
    ...example, baseline: example.scenario, scenario: example.baseline, credit: { authority: 'none' },
  })
  if (result.status !== 'ready' || result.credit.status !== 'ready') return assert.fail('Expected explicit-zero credit estimate')
  assert.equal(result.delta.grossKrw, -5_208_599n)
  assert.equal(result.credit.delta.combinedKrw, result.delta.grossKrw)
})

test('rejects broken scope, FX, or jurisdiction inputs before doing any currency combination', () => {
  assert.deepEqual(estimateCrossBorderSaleTax({ ...example, supported: false }), { status: 'unavailable', reason: 'scope' })
  for (const krwPerUsd of ['', '0', '-1300', '13,00', '1e3', '1300.00001']) {
    assert.deepEqual(estimateCrossBorderSaleTax({ ...example, krwPerUsd }), { status: 'unavailable', reason: 'fx' })
  }
  assert.deepEqual(estimateCrossBorderSaleTax({ ...example, filing: '' }), { status: 'unavailable', reason: 'us' })
  assert.deepEqual(estimateCrossBorderSaleTax({ ...example, scenario: { ...example.scenario, krwGain: '' } }), { status: 'unavailable', reason: 'kr' })
})

test('subtracts the change in credit instead of subtracting the scenario credit from the gross delta', () => {
  const result = estimateCrossBorderSaleTax({
    ...example,
    credit: { authority: 'us', baseline: { eligibleTax: '800', limit: '500' }, scenario: { eligibleTax: '800', limit: '500' } },
  })
  if (result.status !== 'ready' || result.credit.status !== 'ready') return assert.fail('Expected after-credit estimate')
  assert.equal(result.credit.baseline.usCreditCents, 50_000n)
  assert.equal(result.credit.scenario.usCreditCents, 50_000n)
  assert.equal(result.credit.delta.combinedKrw, result.delta.grossKrw)
})
