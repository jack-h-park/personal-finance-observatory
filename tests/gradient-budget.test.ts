import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { PageHeader } from '@/components/PageHeader'

;(globalThis as { React?: typeof React }).React = React

const ROOT = process.cwd()
const SKIP = new Set(['node_modules', '.next'])

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, ext, out)
    else if (ext.test(entry.name)) out.push(full)
  }
  return out
}

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const GRADIENT = /--gradient-full|--gradient-mini|--gradient-text|t-emph-gradient/

test('gradients are named only where the budget allows', () => {
  const files = [
    ...walk(join(ROOT, 'app'), /\.tsx$/),
    ...walk(join(ROOT, 'components'), /\.tsx$/),
    ...walk(join(ROOT, 'styles'), /\.css$/),
  ]
    .filter((f) => GRADIENT.test(readFileSync(f, 'utf8')))
    .map((f) => relative(ROOT, f))
    .sort()
  assert.deepEqual(files, [
    'components/PageHeader.tsx',
    'components/SidebarNav.tsx',
    'components/card.tsx',
    'styles/globals.css',
    'styles/jp-theme.css',
  ])
  const nav = read('components/SidebarNav.tsx')
  assert.match(nav, /--gradient-mini/)
  assert.doesNotMatch(nav, /t-emph-gradient/)
})

test('the title spends one gradient', () => {
  const withEmph = renderToStaticMarkup(React.createElement(PageHeader, { title: 'Pipeline Overview', emphasis: 'Overview', autoRefresh: false }))
  assert.match(withEmph, /t-emph-gradient/)
  assert.doesNotMatch(withEmph, /ai-page-header/)
  const without = renderToStaticMarkup(React.createElement(PageHeader, { title: 'Pipeline Overview', autoRefresh: false }))
  assert.match(without, /ai-page-header/)
  assert.doesNotMatch(without, /t-emph-gradient/)
})

test('the eyebrow is not clipped to a gradient', () => {
  const css = read('styles/jp-theme.css')
  const blocks = css.match(/[^{}]*\.t-eyebrow[^{}]*\{[^}]*\}/g) ?? []
  assert.ok(blocks.length > 0)
  for (const block of blocks) assert.doesNotMatch(block, /background-clip/)
})

test('the entrance fade runs on first load only', () => {
  const css = read('styles/jp-theme.css')
  assert.ok(css.includes(':not([data-entered]) .jp-stagger > *'))
  assert.doesNotMatch(css, /\[data-theme="jp"\] \.jp-stagger/)
})

test('EntranceMotion marks the document entered after the fade settles', async () => {
  const { EntranceMotion } = await import('@/components/EntranceMotion')
  const src = read('components/EntranceMotion.tsx')
  assert.match(src, /^'use client'/)
  assert.match(src, /dataset\.entered = 'true'/)
  assert.match(src, /setTimeout\([^]*600\)/)
  assert.match(src, /clearTimeout/)
  assert.equal(renderToStaticMarkup(React.createElement(EntranceMotion)), '')
})
