import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ChipGroup, LinkChip } from '@/components/LinkChips'

// tsx compiles JSX with the classic runtime, which reads a global React.
;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

test('ChipGroup names the group for assistive tech and hides the duplicate visible label', () => {
  const html = renderToStaticMarkup(
    h(ChipGroup, {
      label: 'Scope',
      children: [h(LinkChip, { key: 'a', href: '/x', active: true, children: 'All' }), h(LinkChip, { key: 'k', href: '/y', active: false, children: 'KR' })],
    })
  )
  assert.match(html, /^<div role="group" aria-label="Scope"/)
  assert.match(html, /<span aria-hidden="true"[^>]*>Scope<\/span>/)
  // The chips wrap in their own column, so a wrapped chip never lands under the label.
  assert.match(html, /<div class="flex min-w-0 flex-1 flex-wrap[^"]*"><a /)
})

test('a group label never shares its look with an unselected chip', () => {
  const html = renderToStaticMarkup(h(ChipGroup, { label: 'Scope', children: h(LinkChip, { href: '/y', active: false, children: 'KR' }) }))
  const labelClass = html.match(/<span aria-hidden="true" class="([^"]*)"/)?.[1] ?? ''
  const chipClass = html.match(/<a [^>]*class="([^"]*)"/)?.[1] ?? ''
  assert.match(labelClass, /\btext-micro\b/)
  assert.match(labelClass, /\btext-ink-3\b/)
  assert.doesNotMatch(labelClass, /\bfont-medium\b/)
  assert.match(chipClass, /\btext-label\b/)
  assert.match(chipClass, /\btext-ink-2\b/)
  assert.match(chipClass, /\bfont-medium\b/)
  assert.match(chipClass, /\bborder-line-control\b/)
})

// --- --border-control contrast (WCAG 1.4.11: 3:1 for a boundary that identifies a control) ---

function luminance(hex: string): number {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** Every value a custom property takes in a stylesheet, in source order. */
function values(css: string, name: string): string[] {
  return [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))].map((m) => m[1])
}

const kit = readFileSync('styles/jhp-app-theme.css', 'utf8')
const app = readFileSync('styles/globals.css', 'utf8')

test('--border-control passes 3:1 against the card, surface and page in both themes', () => {
  // Order in both files: light, dark (system), dark (forced).
  const control = values(app, '--border-control')
  assert.equal(control.length, 3)
  assert.equal(control[1], control[2], 'the two dark blocks must agree')
  const themes = [
    { name: 'light', control: control[0], index: 0 },
    { name: 'dark', control: control[1], index: 1 },
  ]
  for (const theme of themes) {
    for (const surface of ['--bg-card', '--bg-surface', '--bg-page']) {
      const bg = values(kit, surface)[theme.index]
      const ratio = contrast(theme.control, bg)
      assert.ok(ratio >= 3, `${theme.name} ${surface} ${bg}: ${ratio.toFixed(2)}:1`)
    }
  }
})
