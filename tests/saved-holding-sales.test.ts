import assert from 'node:assert/strict'
import test from 'node:test'
import { compareHoldingSale, readSavedHoldingSale } from '@/lib/application/saved-holding-sales'
import type { HoldingsForSale } from '@/lib/domain/taxes/holding-sale'

const book: HoldingsForSale = {
  date: '2026-11-26', fx: { date: '2026-11-25', rate: 1400 }, unreconciled: 0,
  positions: [
    { id: 'position-a', ticker: 'AAA', accountLabel: 'Account A', holdingQuantity: 2, quote: { date: '2026-11-25', usd: 120 },
      lots: [{ quantity: 2, costUsd: 160, costKrw: 200000, term: 'long' }] },
    { id: 'position-b', ticker: 'BBB', accountLabel: 'Account B', holdingQuantity: 1, quote: { date: '2026-11-24', usd: 120 },
      lots: [{ quantity: 1, costUsd: 140, costKrw: 188000, term: 'short' }] },
  ],
}
const ledger = { us: { shortUsd: 500, longUsd: 1500, lots: 2, skipped: 0 }, kr: { gainKrw: 4000000, lots: 2, skipped: 0 } }
const assumptions = {
  us: { profile: 'supported', filing: 'single', baseline: { taxable: '60000', preferential: '0', magi: '72000', nii: '1000' }, adjustments: { short: '', long: '' } },
  kr: { confirmed: true, adjustment: '' },
}
const sale = {
  id: 'plan', name: 'Sample plan', lines: [
    { positionId: 'position-a', quantity: '2', label: 'AAA · Account A' },
    { positionId: 'position-b', quantity: '1', label: 'BBB · Account B' },
  ],
}

test('revalues saved lines together and subtracts each jurisdiction’s incremental tax from gross proceeds', () => {
  const result = compareHoldingSale(sale.lines, book, ledger, assumptions, 2026)
  assert.equal(result.grossUsd, 360)
  assert.equal(result.grossKrw, 504000)
  assert.deepEqual(result.us, { delta: 7.6, after: 352.4 })
  assert.deepEqual(result.kr, { delta: 25520, after: 478480 })
})

test('keeps estimable proceeds and US tax when Korean basis or exchange rate is missing', () => {
  const bookWithoutFx = { ...book, fx: null }
  const missingFx = compareHoldingSale(sale.lines, bookWithoutFx, ledger, assumptions, 2026)
  assert.equal(missingFx.grossKrw, null)
  assert.equal(missingFx.kr, null)
  assert.deepEqual(missingFx.us, { delta: 7.6, after: 352.4 })
  const obsolete = compareHoldingSale(sale.lines, { ...book, positions: book.positions.slice(1) }, ledger, assumptions, 2026)
  assert.equal(obsolete.grossUsd, null)
  assert.equal(obsolete.us, null)
  assert.equal(obsolete.kr, null)
  assert.equal(obsolete.invalidLines, true)
})

test('shows the effect of a tax decrease without assuming a negative sale price', () => {
  const result = compareHoldingSale(sale.lines.slice(1), book, ledger, assumptions, 2026)
  assert.deepEqual(result.us, { delta: -4.4, after: 124.4 })
  assert.deepEqual(result.kr, { delta: -4400, after: 172400 })
})

test('accepts only versioned draft quantities and labels from browser storage', () => {
  assert.deepEqual(readSavedHoldingSale(JSON.stringify({ version: 1, ...sale })), sale)
  assert.equal(readSavedHoldingSale(JSON.stringify({ version: 2, ...sale })), null)
  assert.equal(readSavedHoldingSale(JSON.stringify({ version: 1, ...sale, lines: [{ id: 'position-a', quantity: '1e3' }] })), null)
  assert.equal(readSavedHoldingSale('{'), null)
})

test('applies confirmed credit separately before and after the proposed sale', () => {
  const result = compareHoldingSale(sale.lines, book, ledger, assumptions, 2026, {
    authority: 'us', baseline: { eligibleTax: '20', limit: '15' }, scenario: { eligibleTax: '32', limit: '25' },
  })
  assert.deepEqual(result.combined, { grossDeltaKrw: 36160, creditEffectKrw: 14000, afterKrw: 481840, reason: null })
})

test('retains gross comparison and withholds net when authority or annual limit is missing', () => {
  const unknown = compareHoldingSale(sale.lines, book, ledger, assumptions, 2026)
  assert.deepEqual(unknown.combined, { grossDeltaKrw: 36160, creditEffectKrw: null, afterKrw: null, reason: 'unknown' })
  const missingLimit = compareHoldingSale(sale.lines, book, ledger, assumptions, 2026, {
    authority: 'kr', baseline: { eligibleTax: '2000', limit: '2000' }, scenario: { eligibleTax: '5000', limit: '' },
  })
  assert.equal(missingLimit.combined?.reason, 'creditAmount')
  assert.equal(missingLimit.combined?.afterKrw, null)
  const confirmedNone = compareHoldingSale(sale.lines, book, ledger, assumptions, 2026, { authority: 'none' })
  assert.deepEqual(confirmedNone.combined, { grossDeltaKrw: 36160, creditEffectKrw: 0, afterKrw: 467840, reason: null })
})

test('uses Korean national tax limits and handles a lower post-sale credit', () => {
  const result = compareHoldingSale(sale.lines, book, ledger, assumptions, 2026, {
    authority: 'kr', baseline: { eligibleTax: '6000', limit: '6000' }, scenario: { eligibleTax: '1000', limit: '9000' },
  })
  assert.deepEqual(result.combined, { grossDeltaKrw: 36160, creditEffectKrw: -5000, afterKrw: 462840, reason: null })
})
