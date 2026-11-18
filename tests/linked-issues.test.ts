import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  dataMapLinkedIssues,
  dataOpsLinkedIssues,
  healthLinkedIssues,
  incomeLinkedIssues,
  rebalanceLinkedIssues,
  reconciliationLinkedIssues,
  reviewLinkedIssues,
  type LinkedIssues,
} from '@/lib/header-status'
import { getPageCopy } from '@/lib/ui-copy'

;(globalThis as { React?: typeof React }).React = React

function text(label: React.ReactNode): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, label)).replace(/<[^>]*>/g, '')
}

/**
 * A header pill that links to a card and that card's count badge report the
 * same issue, so they must agree: the pill's count is the badge's count and
 * the pill's colour is the badge's colour. Each case is one page's linked pair
 * built from the inputs the page reads; the counts are picked so that every
 * term the pill and the card could each sum on their own is distinct.
 */
type Case = { page: string; href: string; build: () => LinkedIssues; count: number; severity: 'attention' | 'problem' }

for (const language of ['en', 'ko'] as const) {
  const queue = [{ count: 3 }, { count: 4 }]
  const CASES: Case[] = [
    {
      page: 'health, warnings only',
      href: '#health-operational-status',
      build: () => healthLinkedIssues(getPageCopy('health', language), { failed: 2, errors: 0, stale: 5, missing: 0 }),
      count: 7,
      severity: 'attention',
    },
    {
      page: 'health, a failed error check',
      href: '#health-operational-status',
      build: () => healthLinkedIssues(getPageCopy('health', language), { failed: 2, errors: 1, stale: 5, missing: 0 }),
      count: 7,
      severity: 'problem',
    },
    {
      page: 'health, a missing source',
      href: '#health-operational-status',
      build: () => healthLinkedIssues(getPageCopy('health', language), { failed: 0, errors: 0, stale: 5, missing: 1 }),
      count: 5,
      severity: 'problem',
    },
    {
      page: 'data-map, drift only',
      href: '#data-map-review-queue',
      build: () => dataMapLinkedIssues(getPageCopy('dataMap', language), { missing: 0, drift: 6 }),
      count: 6,
      severity: 'attention',
    },
    {
      page: 'data-map, a missing file',
      href: '#data-map-review-queue',
      build: () => dataMapLinkedIssues(getPageCopy('dataMap', language), { missing: 2, drift: 6 }),
      count: 8,
      severity: 'problem',
    },
    {
      page: 'data-ops',
      href: '#data-ops-priority-work',
      build: () => dataOpsLinkedIssues(getPageCopy('dataOps', language), queue),
      count: 7,
      severity: 'attention',
    },
    {
      page: 'reconciliation',
      href: '#reconciliation-breaks',
      build: () => reconciliationLinkedIssues(getPageCopy('reconciliation', language), 3),
      count: 3,
      severity: 'problem',
    },
    {
      page: 'rebalance',
      href: '#rebalance-hold-watch',
      build: () => rebalanceLinkedIssues(getPageCopy('rebalance', language), { watch: 3, freshness: 5 }),
      count: 8,
      severity: 'attention',
    },
    {
      page: 'income',
      href: '#income-tickerless',
      build: () => incomeLinkedIssues(getPageCopy('income', language), 9, 0),
      count: 9,
      severity: 'attention',
    },
  ]

  for (const c of CASES) {
    test(`${c.page} (${language}): the header pill and its card report one count in one colour`, () => {
      const { status, issues } = c.build()
      assert.deepEqual(issues, { count: c.count, severity: c.severity })
      assert.ok(status, 'a page with issues shows a pill')
      assert.equal(status.severity, issues.severity)
      assert.equal(status.href, c.href)
      assert.match(text(status.label), new RegExp(`(^|\\D)${issues.count}(\\D|$)`))
    })
  }

  // /review no longer has a card that lists stale inputs (freshness lives on
  // /health), so its pill still reports them but links nowhere and no card
  // carries a matching badge.
  test(`review (${language}): the pill reports stale inputs without a link or a card badge`, () => {
    const copy = getPageCopy('review', language)
    const stale = reviewLinkedIssues(copy, 5)
    assert.ok(stale.status, 'a page with stale inputs shows a pill')
    assert.equal(stale.status.severity, 'attention')
    assert.equal(stale.status.href, undefined)
    assert.match(text(stale.status.label), /(^|\D)5(\D|$)/)
    assert.equal('issues' in stale, false)
    const clear = reviewLinkedIssues(copy, 0)
    assert.deepEqual(clear.status, { severity: 'ok', label: copy.ready })
    assert.equal('issues' in clear, false)
  })
}
