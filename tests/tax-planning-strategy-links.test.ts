import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { MasterScenarioComparison } from '@/app/tax-planning/components'
import { createMoneyFormatter } from '@/lib/currency'
import type { MonthlySalePlanSet } from '@/lib/tax-planning'
import { getPageCopy } from '@/lib/ui-copy'

;(globalThis as { React?: typeof React }).React = React

function scenario(strategy: string, tax: number) {
  return {
    strategy,
    label: `Strategy ${strategy}`,
    description: 'A strategy.',
    summary: {
      estimatedTaxKrw: tax,
      incrementalKrTaxAfterCreditKrw: 0,
      longTermSalePct: 0.5,
      averageWaitDays: 10,
      startDate: '2026-01-05',
      endDate: '2026-06-05',
    },
  }
}

const first = scenario('EARLIEST_LT', 100)
const planSet = {
  executionMonths: 6,
  selectedPlan: first,
  scenarios: [first, scenario('LOWEST_TAX', 80)],
} as unknown as MonthlySalePlanSet

function render(annualTargetCashKrw: number): string {
  return renderToStaticMarkup(
    React.createElement(MasterScenarioComparison, {
      planSet,
      horizonYears: 3,
      annualTargetCashKrw,
      copy: getPageCopy('taxPlanning', 'en'),
      money: createMoneyFormatter({ displayCurrency: 'KRW', usdKrwRate: 1300 }),
      language: 'en',
    }),
  )
}

function strategyHrefs(html: string): string[] {
  return [...html.matchAll(/href="(\/tax-planning\?master=[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
}

test('every strategy link keeps the annual test amount', () => {
  const hrefs = strategyHrefs(render(12_000_000))
  assert.equal(hrefs.length, 2)
  for (const href of hrefs) assert.match(href, /[?&]annualTarget=12000000(&|$)/)
})

test('no strategy link carries annualTarget without an amount', () => {
  const hrefs = strategyHrefs(render(0))
  assert.equal(hrefs.length, 2)
  for (const href of hrefs) assert.doesNotMatch(href, /annualTarget/)
})
