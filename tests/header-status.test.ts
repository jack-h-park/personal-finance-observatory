import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { cashInflowHeaderStatus, incomeHeaderStatus } from '@/lib/header-status'
import { getPageCopy } from '@/lib/ui-copy'

;(globalThis as { React?: typeof React }).React = React

/** The label as text, whether it is a string or an element. */
function text(label: React.ReactNode): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, label))
    .replace(/<[^>]*>/g, '')
    .replace(/&#x27;/g, "'")
}

// One header, one status: the linkable issue wins and carries the link; a
// count of rows at today's rate joins it, or stands alone without a link.
for (const language of ['en', 'ko'] as const) {
  const income = getPageCopy('income', language)
  const cash = getPageCopy('cashInflow', language)
  const CASES = [
    { issue: 0, undated: 0 },
    { issue: 3, undated: 0 },
    { issue: 0, undated: 2 },
    { issue: 3, undated: 2 },
  ]

  for (const { issue, undated } of CASES) {
    test(`income (${language}) header status, tickerless ${issue}, undated ${undated}`, () => {
      const status = incomeHeaderStatus(income, issue, undated)
      const expected =
        issue && undated
          ? { severity: 'attention', label: income.tickerlessAndUndated('3', '2'), href: '#income-tickerless' }
          : issue
            ? { severity: 'attention', label: income.tickerlessRows('3'), href: '#income-tickerless' }
            : undated
              ? { severity: 'attention', label: income.undatedRows('2'), href: undefined }
              : { severity: 'ok', label: income.tickerMapped, href: undefined }
      assert.deepEqual({ severity: status.severity, label: text(status.label), href: status.href }, expected)
    })

    test(`cash-inflow (${language}) header status, unclassified ${issue}, undated ${undated}`, () => {
      const status = cashInflowHeaderStatus(cash, issue, undated, '/cash-inflow?category=unclassified')
      const href = '/cash-inflow?category=unclassified#cash-inflow-unclassified'
      const expected =
        issue && undated
          ? { severity: 'attention', label: cash.unclassifiedAndUndated('3', '2'), href }
          : issue
            ? { severity: 'attention', label: cash.unclassified('3'), href }
            : undated
              ? { severity: 'attention', label: cash.undated('2'), href: undefined }
              : undefined
      assert.deepEqual(status && { severity: status.severity, label: text(status.label), href: status.href }, expected)
      // The unclassified pill keeps its hint on hover.
      if (issue) assert.ok(renderToStaticMarkup(React.createElement(React.Fragment, null, status!.label)).includes('title='))
    })
  }
}
