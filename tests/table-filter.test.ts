import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { TickerFilterChip } from '@/components/TickerFilterChip'
import { applyTicker, withParam } from '@/lib/table-filter'

;(globalThis as { React?: typeof React }).React = React

const ROWS = [
  { ticker: 'A', market: 'US' },
  { ticker: 'AA', market: 'US' },
  { ticker: 'a', market: 'US' },
  { ticker: 'A', market: 'KR' },
]

test('applyTicker keeps only exact, case-sensitive matches', () => {
  assert.deepEqual(applyTicker(ROWS, 'A'), [ROWS[0], ROWS[3]])
})

test('applyTicker returns every row when no ticker is asked for', () => {
  assert.equal(applyTicker(ROWS, undefined), ROWS)
  assert.equal(applyTicker(ROWS, ''), ROWS)
})

test('applyTicker returns nothing for a ticker no row carries', () => {
  assert.deepEqual(applyTicker(ROWS, 'ZZZ'), [])
})

test("the ticker chip's clear link drops the ticker and keeps the other filters", () => {
  const clearHref = withParam('/lots', { ticker: 'A', market: 'US', q: 'x' }, 'ticker', null)
  const params = new URLSearchParams(clearHref.split('?')[1])
  assert.equal(params.get('ticker'), null)
  assert.equal(params.get('market'), 'US')
  assert.equal(params.get('q'), 'x')
  const html = renderToStaticMarkup(React.createElement(TickerFilterChip, { ticker: 'A', clearHref, label: 'Ticker: A' }))
  assert.match(html, /Ticker: A/)
  assert.match(html, new RegExp(`href="${clearHref.replace(/[?]/g, '\\?').replace(/&/g, '&amp;')}"`))
  assert.match(html, /×/)
})
