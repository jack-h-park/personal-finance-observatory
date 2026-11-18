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

test('the sidebar carries one gradient wordmark and puts the switchers after the nav', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/Sidebar.tsx'), 'utf8')
  assert.equal(source.split('{BRAND.wordmark}').length - 1, 1)
  const nav = source.indexOf('<SidebarNav')
  assert.ok(nav > 0)
  for (const switcher of ['<LanguageSwitcher', '<CurrencySwitcher', '<AssetViewSwitcher']) {
    assert.ok(source.indexOf(switcher) > nav, `${switcher} renders after the nav`)
  }
  assert.ok(source.indexOf('{copy.readOnly}') > source.indexOf('<AssetViewSwitcher'))
})
