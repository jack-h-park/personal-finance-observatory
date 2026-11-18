import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { activeHref, navItems } from '@/lib/nav'
import { ROUTE_HREFS, routeSection } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'

const LANGUAGES = ['en', 'ko'] as const

// One active sidebar item for any path, including nested pages reached by a
// pasted URL. The paths are invented.
const ACTIVE: [string, string | null][] = [
  ['/', '/'],
  ['/taxes', '/taxes'],
  ['/taxes/history', '/taxes/history'],
  ['/taxes/records/us-2025', '/taxes/history'],
  ['/positions/KR/005930', '/holdings'],
  ['/rebalance/settings', '/rebalance/settings'],
  ['/rebalance/proposals/abc', '/rebalance'],
  ['/tax-planning/plans/x', '/tax-planning'],
  ['/nope', null],
]

test('activeHref picks the longest sidebar href that prefixes the path, or an alias', () => {
  for (const [pathname, expected] of ACTIVE) {
    assert.equal(activeHref(pathname, ROUTE_HREFS), expected, pathname)
  }
})

test('the root href is active only on the root', () => {
  assert.equal(activeHref('/holdings', ['/']), null)
  assert.equal(activeHref('/', ['/', '/holdings']), '/')
})

test('a prefix only matches at a path segment boundary', () => {
  assert.equal(activeHref('/taxes-old', ['/taxes']), null)
})

test('without supplementary data, Total Assets and Pension drop and Holdings stays', () => {
  for (const language of LANGUAGES) {
    const hrefs = navItems(getPageCopy('sidebar', language).sections, { supplementary: false }).map((item) => item.href)
    assert.ok(!hrefs.includes('/net-worth'), `${language}: /net-worth shown without supplementary data`)
    assert.ok(!hrefs.includes('/pension'), `${language}: /pension shown without supplementary data`)
    assert.ok(hrefs.includes('/holdings'), `${language}: /holdings missing`)
    const all = navItems(getPageCopy('sidebar', language).sections, { supplementary: true }).map((item) => item.href)
    assert.ok(all.includes('/net-worth') && all.includes('/pension'), `${language}: supplementary items missing`)
  }
})

test('no section is empty, with or without supplementary data', () => {
  for (const language of LANGUAGES) {
    const sections = getPageCopy('sidebar', language).sections
    for (const supplementary of [true, false]) {
      const items = navItems(sections, { supplementary })
      for (const section of sections) {
        assert.ok(
          items.some((item) => item.section === section.label),
          `${language}: "${section.label}" is empty with supplementary=${supplementary}`
        )
      }
    }
  }
})

test('a route inside a group resolves to its top-level section, not the group', () => {
  assert.equal(routeSection('/fx', 'ko'), '자산 · 현금 흐름')
  assert.equal(routeSection('/rebalance/settings', 'en'), 'Settings')
  const fx = navItems(getPageCopy('sidebar', 'en').sections, { supplementary: true }).find((item) => item.href === '/fx')
  assert.equal(fx?.group, 'Detailed Records')
})

test('the sections follow the product areas plus Settings', () => {
  assert.deepEqual(
    getPageCopy('sidebar', 'en').sections.map((section) => section.label),
    ['Overview', 'Assets & Cash Flow', 'Taxes', 'Review & Data', 'Settings']
  )
  assert.deepEqual(
    getPageCopy('sidebar', 'ko').sections.map((section) => section.label),
    ['개요', '자산 · 현금 흐름', '세금', '검토 · 데이터', '설정']
  )
})
