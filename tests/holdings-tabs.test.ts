import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { HOLDINGS_VIEWS, holdingsViewHref, resolveHoldingsView } from '@/lib/holdings-tabs'
import { getPageCopy } from '@/lib/ui-copy'

test('resolveHoldingsView falls back to the holdings tab', () => {
  assert.equal(resolveHoldingsView(undefined), 'holdings')
  assert.equal(resolveHoldingsView('mix'), 'mix')
  assert.equal(resolveHoldingsView(['weights', 'mix']), 'weights')
  assert.equal(resolveHoldingsView('foo'), 'holdings')
  assert.equal(resolveHoldingsView(''), 'holdings')
})

test('holdingsViewHref keeps the other params and drops view for the holdings tab', () => {
  const back = new URL(holdingsViewHref({ market: 'US', sort: 'weight:desc', view: 'mix' }, 'holdings'), 'http://x')
  assert.equal(back.pathname, '/holdings')
  assert.equal(back.searchParams.has('view'), false)
  assert.equal(back.searchParams.get('market'), 'US')
  assert.equal(back.searchParams.get('sort'), 'weight:desc')

  const mix = new URL(holdingsViewHref({ trend: '1y' }, 'mix'), 'http://x')
  assert.equal(mix.searchParams.get('trend'), '1y')
  assert.equal(mix.searchParams.get('view'), 'mix')

  assert.equal(holdingsViewHref({}, 'holdings'), '/holdings')
})

test('every holdings view has a label and a description in both languages', () => {
  for (const language of ['en', 'ko'] as const) {
    const copy = getPageCopy('holdings', language)
    assert.deepEqual(Object.keys(copy.views), [...HOLDINGS_VIEWS])
    assert.deepEqual(Object.keys(copy.viewDescriptions), [...HOLDINGS_VIEWS])
  }
})
