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
  const html = renderToStaticMarkup(React.createElement(TickerFilterChip, { clearHref, label: 'Ticker: A', removeLabel: 'Remove ticker filter: A' }))
  assert.match(html, /Ticker: A/)
  assert.match(html, new RegExp(`href="${clearHref.replace(/[?]/g, '\\?').replace(/&/g, '&amp;')}"`))
  assert.match(html, /×/)
})

// A screen reader hears the link's name, not the × beside the label, so the
// name says what following the link does.
test('the ticker chip is named for removing the filter, in both languages', async () => {
  const { getUiCopy } = await import('@/lib/ui-copy')
  for (const [language, name] of [['en', 'Remove ticker filter: A'], ['ko', '종목 필터 해제: A']] as const) {
    const common = getUiCopy(language).common
    const html = renderToStaticMarkup(
      React.createElement(TickerFilterChip, { clearHref: '/lots', label: common.tickerFilter('A'), removeLabel: common.removeTickerFilter('A') }),
    )
    assert.match(html, new RegExp(`<a[^>]*aria-label="${name}"`))
    assert.doesNotMatch(html, /data-ticker/)
  }
})

// "n of m" under a ticker filter: m is the ticker's own rows, as /realized
// counts it, not every row the page read.
for (const page of ['app/lots/page.tsx', 'app/transactions/page.tsx']) {
  test(`${page} counts the filtered rows out of the ticker-scoped rows`, async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(page, 'utf8')
    assert.ok(source.includes('fmtNumber(scoped.length)'), 'the denominator is the ticker-scoped count')
    assert.ok(!source.includes('fmtNumber(rows.length)'), 'the denominator is not every row read')
  })
}
