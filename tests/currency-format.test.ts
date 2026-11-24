import assert from 'node:assert/strict'
import test from 'node:test'
import { createMoneyFormatter, formatMoneyIn, needsDisplayLine, type CurrencyPreferences } from '../lib/currency'

const krwWithRate: CurrencyPreferences = { displayCurrency: 'KRW', usdKrwRate: 1400 }
const usdWithRate: CurrencyPreferences = { displayCurrency: 'USD', usdKrwRate: 1400 }
const krwNoRate: CurrencyPreferences = { displayCurrency: 'KRW', usdKrwRate: null }
const usdNoRate: CurrencyPreferences = { displayCurrency: 'USD', usdKrwRate: null }

test('formatMoneyIn keeps the amount in its own currency', () => {
  assert.equal(formatMoneyIn(1234.5, 'USD'), '$1,234.50')
  assert.equal(formatMoneyIn(1234.5, 'usd'), '$1,234.50')
  assert.equal(formatMoneyIn(1234567, 'KRW'), '₩1,234,567')
  assert.equal(formatMoneyIn(-15, 'KRW'), '-₩15')
  assert.equal(formatMoneyIn(10, null), '₩10')
})

// The bug: with a KRW preference and a known rate, the display formatter turns
// a USD amount into won, so a native-over-base cell showed won on both lines.
test('the display formatter converts USD into the KRW preference, which a native column must not use', () => {
  const money = createMoneyFormatter(krwWithRate)
  assert.equal(money(100, 'USD'), '₩140,000')
  assert.equal(formatMoneyIn(100, 'USD'), '$100.00')
})

test('the display formatter leaves amounts alone when no rate is known', () => {
  const money = createMoneyFormatter(krwNoRate)
  assert.equal(money(100, 'USD'), '$100.00')
})

test('the display formatter converts KRW into a USD preference', () => {
  const money = createMoneyFormatter(usdWithRate)
  assert.equal(money(140000, 'KRW'), '$100.00')
  assert.equal(money(100, 'USD'), '$100.00')
})

test('needsDisplayLine shows the base line only when it lands in a different currency', () => {
  // KRW preference: a USD row gets a won line under it, a KRW row stays single.
  assert.equal(needsDisplayLine('USD', krwWithRate), true)
  assert.equal(needsDisplayLine('KRW', krwWithRate), false)
  // USD preference: the base line would be dollars, repeating a USD row's
  // currency, but it adds a dollar line under a KRW row.
  assert.equal(needsDisplayLine('USD', usdWithRate), false)
  assert.equal(needsDisplayLine('KRW', usdWithRate), true)
  // Without a rate the base line stays in won whatever the preference.
  assert.equal(needsDisplayLine('USD', usdNoRate), true)
  assert.equal(needsDisplayLine('KRW', usdNoRate), false)
  assert.equal(needsDisplayLine('usd', krwNoRate), true)
})
