import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RangeBreakdownPanel } from '../components/RangeBreakdownPanel'
import { ASSET_CLASS_COLOR } from '../lib/palette'
import { topDrivers, type SecurityDriver } from '../lib/range-breakdown'
import { getPageCopy } from '../lib/ui-copy'
import type { TotalAssetsChange } from '../lib/total-assets-change'
;(globalThis as { React?: typeof React }).React = React

const driver = (ticker: string, moneyIn: number, marketEffect: number, market = 'KR'): SecurityDriver => ({
  market,
  ticker,
  name: `Name ${ticker}`,
  valueChange: moneyIn + marketEffect,
  moneyIn,
  marketEffect,
  realized: 0,
})

const change: TotalAssetsChange = {
  baseDate: '2026-01-31',
  change: 900,
  pct: 9,
  addedClasses: [],
  byClass: [
    { key: 'stocks', change: 700 },
    { key: 'cash', change: -300 },
    { key: 'crypto', change: 100 },
  ],
}

function render(props: Partial<Parameters<typeof RangeBreakdownPanel>[0]> = {}, language: 'en' | 'ko' = 'en') {
  const copy = getPageCopy('netWorth', language)
  const overview = getPageCopy('overview', language)
  const drivers = Array.from({ length: 10 }, (_, i) => driver(`T${i}`, (i % 3) * 10 - 10, 50 - i * 7))
  return renderToStaticMarkup(
    React.createElement(RangeBreakdownPanel, {
      from: '2026-01-31',
      to: '2026-03-31',
      change,
      investment: { unrealized: 60, realized: 40, total: 100 },
      gap: null,
      byClass: change.byClass,
      stocks: topDrivers(drivers, 8),
      crypto: topDrivers([], 8),
      unpriced: [],
      copy: { breakdown: copy.breakdown, classes: copy.classes, field: overview },
      money: (krw: number) => `₩${krw}`,
      language,
      classColors: ASSET_CLASS_COLOR,
      ...props,
    }),
  )
}

const section = (html: string, id: string) => {
  const start = html.indexOf(`id="${id}"`)
  assert.ok(start >= 0, `section ${id} rendered`)
  const end = html.indexOf('</section>', start)
  return html.slice(start, end)
}

test('renders class bars and a row per shown security with both segments', () => {
  const html = render()
  const copy = getPageCopy('netWorth', 'en').breakdown
  const classes = section(html, 'breakdown-classes')
  assert.equal(classes.match(/data-row="class"/g)?.length, 3)
  // Largest move first.
  assert.ok(classes.indexOf('Stocks') < classes.indexOf('Cash') && classes.indexOf('Cash') < classes.indexOf('Crypto'))
  const stocks = section(html, 'breakdown-stocks')
  assert.equal(stocks.match(/data-row="security"/g)?.length, 9, 'eight shown plus other')
  assert.ok(stocks.includes(copy.moneyIn) && stocks.includes(copy.marketEffect), 'legend names both segments')
  assert.ok(stocks.includes('data-segment="moneyIn"') && stocks.includes('data-segment="marketEffect"'))
  assert.ok(stocks.includes('href="/positions/KR/T0"'), 'rows link to the position page')
  assert.ok(stocks.includes(copy.other(2)), 'the remainder is grouped')
  assert.ok(!stocks.includes('>Other<'), 'the lib placeholder name is not rendered')
  // Crypto with no rows is not shown.
  assert.ok(!html.includes('id="breakdown-crypto"'))
})

test('shows the cost basis gap line only when gap is non-null', () => {
  const copy = getPageCopy('netWorth', 'en').breakdown
  assert.ok(!render().includes(copy.costBasisGap('+₩25')))
  assert.ok(render({ gap: 25 }).includes(copy.costBasisGap('+₩25')))
})

test('shows the unpriced note with names', () => {
  const html = render({ unpriced: [{ market: 'US', ticker: 'ZZZ', name: 'Zeta', costKrw: 400, missingOn: ['2026-03-31'] }] })
  assert.ok(html.includes('Zeta'))
  assert.ok(html.includes('₩400'))
})

test('renders the noData note when snapshots are missing', () => {
  const copy = getPageCopy('netWorth', 'ko').breakdown
  const html = render({ stocks: null, crypto: null }, 'ko')
  assert.ok(html.includes(copy.noData))
  assert.ok(!html.includes('id="breakdown-stocks"'))
  // The class view still renders.
  assert.ok(html.includes('id="breakdown-classes"'))
})
