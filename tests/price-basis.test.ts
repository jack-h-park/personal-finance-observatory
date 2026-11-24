// The provider names behind a set of price files, once each.
import assert from 'node:assert/strict'
import test from 'node:test'
import { priceSourceNames } from '../lib/price-basis'

test('provider names are listed once, with venue qualifiers dropped', () => {
  assert.deepEqual(
    priceSourceNames(['Yahoo Finance chart API', 'Yahoo Finance chart API', 'Bithumb public ticker API (KRW venues), Yahoo Finance chart API (USD venues)']),
    ['Yahoo Finance chart API', 'Bithumb public ticker API']
  )
  assert.deepEqual(priceSourceNames([null, undefined, '']), [])
})
