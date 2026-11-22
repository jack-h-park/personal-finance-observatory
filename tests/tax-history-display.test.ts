import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import example from '@/examples/tax-history-annual-review.synthetic.json'
import { AnnualTaxSummary } from '@/components/AnnualTaxSummary'
import { EmptyCashHistory, RecordedSettlementPrincipal, TaxEvidenceLink } from '@/components/TaxHistoryDisplay'
import { getAnnualTaxSummary } from '@/lib/application/annual-tax-summary'
import { getTaxHistoryView } from '@/lib/application/tax-history-query'
import { validateTaxHistory } from '@/lib/domain/taxes/history'

;(globalThis as { React?: typeof React }).React = React
const h = React.createElement
const store = validateTaxHistory(example)

test('a zero recorded allocation sum is visible alongside the existing unknown payment result', () => {
  const filter = { taxUnitId: 'self-2025', taxYear: 2025, authority: 'US:CA' }
  const [row] = getTaxHistoryView(store, { ...filter, view: 'tax-year' }).obligations
  const summary = getAnnualTaxSummary(store)
  const selected = { ...summary, years: [{ year: 2025, rows: summary.years[0].rows.filter(item => item.id === row.id) }] }
  assert.equal(row.principalSettledMinor, '0')
  assert.equal(selected.years[0].rows[0].payments, null)

  const html = renderToStaticMarkup(h(React.Fragment, null,
    h(RecordedSettlementPrincipal, { language: 'en', currency: row.currency, minor: row.principalSettledMinor }),
    h(AnnualTaxSummary, { language: 'en', summary: selected }),
  ))
  assert.match(html, /USD 0\.00/)
  assert.match(html, /This is the sum of recorded allocations\. Actual payment requires separate confirmation/)
  assert.match(html, /Unconfirmed \/ no qualifying record/)
})

test('the zero explanation does not appear beside a nonzero recorded sum', () => {
  const row = getTaxHistoryView(store, { taxUnitId: 'self-2025', taxYear: 2025, view: 'tax-year' })
    .obligations.find(item => item.id === 'us-2025')!
  assert.notEqual(row.principalSettledMinor, '0')
  const html = renderToStaticMarkup(h(RecordedSettlementPrincipal, {
    language: 'en', currency: row.currency, minor: row.principalSettledMinor,
  }))
  assert.doesNotMatch(html, /Actual payment requires separate confirmation/)
})

test('empty filtered cash history explains the missing matches and returns to the same tax scope', () => {
  const filter = { taxUnitId: 'self-2025', taxYear: 2025, authority: 'US:federal' }
  const view = getTaxHistoryView(store, { ...filter, view: 'cash-date', cashDateFrom: '2026-06-01' })
  assert.equal(view.cashEvents.length, 0)
  const html = renderToStaticMarkup(h(EmptyCashHistory, {
    language: 'en', unitId: filter.taxUnitId, year: String(filter.taxYear), authority: filter.authority,
  }))
  assert.match(html, /No allocated payment or refund records match these filters/)
  assert.match(html, /Actual payment or refund remains unconfirmed by this view/)
  assert.match(html, /href="\/taxes\?unit=self-2025&amp;year=2025&amp;authority=US%3Afederal"/)
})

test('evidence links are distinguishable by recorded ID', () => {
  const html = renderToStaticMarkup(h(React.Fragment, null,
    h(TaxEvidenceLink, { language: 'ko', evidenceId: 'doc-first' }),
    h(TaxEvidenceLink, { language: 'ko', evidenceId: 'doc-second' }),
  ))
  assert.match(html, /href="\/taxes\/evidence\/doc-first"[^>]*>증빙 열기 · doc-first<\/a>/)
  assert.match(html, /href="\/taxes\/evidence\/doc-second"[^>]*>증빙 열기 · doc-second<\/a>/)
})
