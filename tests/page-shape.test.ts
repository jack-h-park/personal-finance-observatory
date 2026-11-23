import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Card, MetricHeroCard } from '@/components/ui'
import { CARD_SELECTOR, SHAPE_ROUTES, shapeVerdict } from '../scripts/page-shape.mjs'

;(globalThis as { React?: typeof React }).React = React

test('a page at both limits passes', () => {
  assert.deepEqual(shapeVerdict({ cards: 10, leadTop: 840 }), [])
})

test('too many cards fails once and names the count', () => {
  const messages = shapeVerdict({ cards: 11, leadTop: 100 })
  assert.equal(messages.length, 1)
  assert.match(messages[0], /11/)
})

test('a lead below the fold fails once', () => {
  assert.equal(shapeVerdict({ cards: 3, leadTop: 900 }).length, 1)
})

test('a missing lead fails once', () => {
  assert.equal(shapeVerdict({ cards: 3, leadTop: null }).length, 1)
})

test('both failures are reported separately', () => {
  assert.equal(shapeVerdict({ cards: 12, leadTop: null }).length, 2)
})

test('the checked routes are the five R5 pages and /spending', () => {
  assert.deepEqual(
    SHAPE_ROUTES.map((r: { path: string }) => r.path),
    ['/tax-planning', '/rebalance', '/positions/KR/005930', '/cash-inflow', '/review', '/spending']
  )
})

// The card budget counts what this selector finds; when the card markup changed
// in #358 (no shadow on data cards) the old selector matched nothing and every
// page read as 0 cards. The selector and the card component must agree.
test('the card selector matches what Card and MetricHeroCard render', () => {
  assert.equal(CARD_SELECTOR, 'main section[data-card]')
  for (const html of [
    renderToStaticMarkup(React.createElement(Card, { title: 'T', children: 'x' })),
    renderToStaticMarkup(React.createElement(MetricHeroCard, { title: 'T', value: '1' } as never)),
  ]) assert.match(html, /^<section[^>]* data-card=""/)
})
