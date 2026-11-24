// The link form of the segmented control, and chips that carry a colour swatch or a checkbox
// (components/LinkChips.tsx), as the /net-worth trend toolbar uses them.
import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChipGroup, LinkChip, LinkSegmentedControl } from '../components/LinkChips'

// next/link reads a global React under the classic JSX runtime; Next supplies it in the app.
;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

test('a link segmented control is a labelled group of links; only the current one carries aria-current', () => {
  const html = renderToStaticMarkup(
    h(LinkSegmentedControl, {
      label: 'Period',
      current: 'b',
      items: [
        { key: 'a', href: '/x?p=a', label: 'A' },
        { key: 'b', href: '/x?p=b', label: 'B' },
      ],
    })
  )
  assert.match(html, /^<div role="group" aria-label="Period"/)
  const links = html.match(/<a [^>]*>/g) ?? []
  assert.equal(links.length, 2)
  assert.ok(!links[0].includes('aria-current'))
  assert.ok(links[1].includes('aria-current="true"'))
  // Same 32px target as the button form.
  for (const link of links) assert.ok(link.includes('min-h-8'), link)
  assert.doesNotMatch(html, /grid/)
})

test('a chip with a swatch shows the colour filled when active and as a ring when not', () => {
  const on = renderToStaticMarkup(h(LinkChip, { href: '/x', active: true, ariaCurrent: 'none', swatch: 'var(--asset-stocks)', children: 'Stocks' }))
  assert.match(on, /background-color:var\(--asset-stocks\)/)
  const off = renderToStaticMarkup(h(LinkChip, { href: '/x', active: false, ariaCurrent: 'none', swatch: 'var(--asset-stocks)', children: 'Stocks' }))
  assert.match(off, /border-color:var\(--asset-stocks\)/)
  assert.doesNotMatch(off, /background-color/)
})

test('a checkbox chip draws a box, ticked when active, hidden from screen readers', () => {
  const on = renderToStaticMarkup(h(LinkChip, { href: '/x', active: true, ariaCurrent: 'none', checkbox: true, 'aria-label': 'Include children: included', children: 'Include children' }))
  assert.match(on, /<span aria-hidden="true"[^>]*>✓<\/span>/)
  const off = renderToStaticMarkup(h(LinkChip, { href: '/x', active: false, ariaCurrent: 'none', checkbox: true, children: 'Include children' }))
  assert.doesNotMatch(off, /✓/)
})

test('inside a ChipGroup the segmented control names no group of its own, and its options are not group-label ink', () => {
  const html = renderToStaticMarkup(
    h(ChipGroup, { label: 'Period', children: h(LinkSegmentedControl, { current: 'a', items: [{ key: 'a', href: '/x', label: 'A' }, { key: 'b', href: '/y', label: 'B' }] }) })
  )
  // One named group: the ChipGroup's.
  assert.equal(html.match(/role="group"/g)?.length, 1)
  assert.match(html, /aria-label="Period"/)
  // The track has a visible boundary and an unselected option is ink-2, not the label's ink-3.
  assert.match(html, /border-line-control/)
  const unselected = (html.match(/<a [^>]*href="\/y"[^>]*>/) ?? [''])[0]
  assert.match(unselected, /text-ink-2/)
})
