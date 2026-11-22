import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SidebarNav } from '../components/SidebarNav'
import { getPageCopy } from '../lib/ui-copy'
// Match the existing standalone JSX render harness for shared UI components.
;(globalThis as { React?: typeof React }).React = React

const copy = getPageCopy('sidebar', 'en')
const sections = copy.sections
const render = (pathname: string, opts: { showAllAssets?: boolean; openGroups?: Record<string, boolean> } = {}) =>
  renderToStaticMarkup(
    React.createElement(SidebarNav, {
      sections,
      pathname,
      showAllAssets: opts.showAllAssets ?? true,
      openGroups: opts.openGroups ?? {},
      onToggle: () => {},
      label: copy.navLabel,
    })
  )
const detailsTag = (html: string) => html.match(/<details[^>]*>/)?.[0] ?? ''

test('a nested route lights exactly one item, its sidebar parent', () => {
  const html = render('/positions/KR/005930')
  const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? []
  assert.equal(current.length, 1)
  assert.match(current[0], /href="\/holdings"/)
})

test('Data Connections remains in the sidebar without supplementary account data', () => {
  const html = render('/data-connections', { showAllAssets: false })
  const current = html.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? []
  assert.equal(current.length, 1)
  assert.match(current[0], /href="\/data-connections"/)
})

test('Detailed Records is open by default and keeps the state the reader left it in', () => {
  assert.match(detailsTag(render('/holdings')), /\sopen=""/)
  assert.doesNotMatch(detailsTag(render('/holdings', { openGroups: { 'Detailed Records': false } })), /\sopen=""/)
})

test('a closed group is forced open when the active item sits inside it', () => {
  assert.match(detailsTag(render('/fx', { openGroups: { 'Detailed Records': false } })), /\sopen=""/)
})

test('supplementary items hide without supplementary data, and the rest of the section stays', () => {
  const html = render('/', { showAllAssets: false })
  assert.doesNotMatch(html, /href="\/net-worth"/)
  assert.doesNotMatch(html, /href="\/pension"/)
  assert.match(html, /href="\/income"/)
  assert.match(render('/'), /href="\/net-worth"/)
})

// The Studio app bar is the one place for the JHP mark and the app name, and its
// display settings row owns the language (workspace-governance guidelines D14, D16).
test('the sidebar leaves identity and language to the app bar and puts the switchers after the nav', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/Sidebar.tsx'), 'utf8')
  assert.doesNotMatch(source, /jhp-mark|BRAND\.|<LanguageSwitcher/)
  const nav = source.indexOf('<SidebarNav')
  assert.ok(nav > 0)
  for (const switcher of ['<CurrencySwitcher', '<AssetViewSwitcher']) {
    assert.ok(source.indexOf(switcher) > nav, `${switcher} renders after the nav`)
  }
  assert.ok(source.indexOf('{copy.readOnly}') > source.indexOf('<AssetViewSwitcher'))
})

// The Detailed Records summary sits inside Assets & Cash Flow, so it reads as
// an item (item indent, body text), not as a sixth section label.
test('the group summary is styled as an item, not as a section label', () => {
  const html = render('/fx')
  const summary = html.match(/<summary[^>]*class="([^"]*)"/)?.[1] ?? ''
  const sectionLabel = html.match(/<div class="([^"]*)">Assets &amp; Cash Flow<\/div>/)?.[1] ?? ''
  assert.ok(summary && sectionLabel, 'found the summary and the section label')
  const classes = summary.split(/\s+/)
  for (const cls of ['pl-3', 'text-body', 'text-ink-2']) assert.ok(classes.includes(cls), `summary has ${cls}`)
  for (const cls of sectionLabel.split(/\s+/)) {
    if (cls.startsWith('text-') || cls === 'font-medium') assert.ok(!classes.includes(cls), `summary does not use the section label's ${cls}`)
  }
})
