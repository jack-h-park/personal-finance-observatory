import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { summarizeAccountCoverage } from '../lib/application/account-coverage-summary'
import { AccountCoverageSummary } from '../components/AccountCoverageSummary'
import { AccountInventoryReview } from '../components/AccountInventoryReview'
import { buildAccountInventoryReview } from '../lib/application/account-inventory'
;(globalThis as { React?: typeof React }).React = React

const rows = () => ({
  investmentRows: [{ status: 'current' as const }, { status: 'current' as const }, { status: 'due_soon' as const }],
  supplementaryRows: [
    { kind: 'deposit' as const, status: 'action_needed' as const, label: 'PRIVATE_SYNTHETIC_LABEL_123456789' },
    { kind: 'cma' as const, status: 'unconfirmed' as const, latestDate: '2026-02-08' },
    { kind: 'deposit' as const, status: 'missing' as const },
    { kind: 'deposit' as const, status: 'action_needed' as const, historyGap: { from: '2024-03-01', to: '2024-03-12' } },
    { kind: 'pension' as const, status: 'current' as const },
    { kind: 'gold' as const, status: 'due_soon' as const },
  ],
})
const group = (summary: ReturnType<typeof summarizeAccountCoverage>, id: string) => summary.groups.find(g => g.id === id)!

test('current investments do not hide bank/CMA update, missing and interval-unknown states', () => {
  const value = summarizeAccountCoverage(rows())
  assert.deepEqual(group(value, 'investments'), { id: 'investments', rows: 3, statuses: { current: 2, due_soon: 1, action_needed: 0, missing: 0, unconfirmed: 0 }, historyGaps: 0 })
  assert.deepEqual(group(value, 'bankCma'), { id: 'bankCma', rows: 4, statuses: { current: 0, due_soon: 0, action_needed: 2, missing: 1, unconfirmed: 1 }, historyGaps: 1 })
  assert.deepEqual(group(value, 'other'), { id: 'other', rows: 2, statuses: { current: 1, due_soon: 1, action_needed: 0, missing: 0, unconfirmed: 0 }, historyGaps: 0 })
  assert.ok(!('totalAccounts' in value) && !('completeness' in value))
})

test('real adapter gap overrides retain action status without reconstructing pre-gap freshness', () => {
  const gapRows = [
    { kind: 'deposit' as const, status: 'action_needed' as const, latestDate: '2026-02-08', staleWithHistoryGap: false, historyGap: { from: '2024-04-01', to: '2024-04-09' } },
    { kind: 'cma' as const, status: 'action_needed' as const, latestDate: '2024-05-10', staleWithHistoryGap: true, historyGap: { from: '2024-04-01', to: '2024-04-09' } },
  ]
  const value = summarizeAccountCoverage({ investmentRows: [], supplementaryRows: gapRows })
  const bank = group(value, 'bankCma')
  assert.equal(bank.rows, 2); assert.equal(bank.historyGaps, 2)
  assert.equal(bank.statuses.current, 0); assert.equal(bank.statuses.action_needed, 2)
  assert.equal(bank.statuses.unconfirmed, 0) // Do not invent a replacement source status either.
})

test('empty groups and repeated source labels do not invent a complete or deduplicated account list', () => {
  const empty = summarizeAccountCoverage({ investmentRows: [], supplementaryRows: [] })
  assert.ok(empty.groups.every(g => g.rows === 0 && g.historyGaps === 0 && Object.values(g.statuses).every(n => n === 0)))
  const source = rows(); source.supplementaryRows.push({ ...source.supplementaryRows[0] })
  assert.equal(group(summarizeAccountCoverage(source), 'bankCma').rows, 5)
})

test('summary accepts deeply frozen adapter-shaped inputs and preserves status and history metadata', () => {
  const source = rows(), before = structuredClone(source)
  function freeze(value: object) { Object.values(value).forEach(v => { if (v && typeof v === 'object') freeze(v) }); Object.freeze(value) }
  freeze(source); summarizeAccountCoverage(source); assert.deepEqual(source, before)
})

test('bilingual summary exposes scoped navigation and separate signals without identifiers or write controls', () => {
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(AccountCoverageSummary, { summary: summarizeAccountCoverage(rows()), language }))
    for (const href of ['#account-coverage', '#supplementary-coverage', '/accounts#inventory-review']) assert.ok(html.includes(`href="${href}"`))
    assert.match(html, language === 'en' ? /Query period unknown/ : /조회기간 미확인/)
    assert.match(html, language === 'en' ? /History gaps/ : /과거 구간 누락/)
    assert.match(html, language === 'en' ? /may overlap/ : /겹칠 수/)
    assert.match(html, language === 'en' ? /Pre-gap freshness is not available/ : /누락 조치 이전의 최신성은 확인할 수 없습니다/)
    assert.match(html, language === 'en' ? /not unique accounts/ : /고유 계좌 수/)
    assert.doesNotMatch(html, /PRIVATE_SYNTHETIC_LABEL|123456789|2026-02-08|<form|<input|<button|\/api\/|All accounts are current|전체 계좌 최신/)
  }
})

test('empty summary says no configured source rows while inventory remains a separate review', () => {
  const html = renderToStaticMarkup(React.createElement(AccountCoverageSummary, { summary: summarizeAccountCoverage({ investmentRows: [], supplementaryRows: [] }), language: 'en' }))
  assert.match(html, /No configured source rows/); assert.match(html, /Review inventory scope/)
  assert.doesNotMatch(html, /0 accounts|100%|complete inventory confirmed/i)
})

test('supplementary navigation preserves unknown inventory and closed/non-loaded pension policy', () => {
  const review = buildAccountInventoryReview({ mapRead: { state: 'available', value: { pensionAccounts: [
    { institution: 'mirae', account: 'Closed invented pension', retiredOn: '2025-02-01', owner: 'other' },
    { institution: 'mirae', account: 'Unloaded invented pension', owner: 'other' },
  ] } }, facts: [], readIssues: [] }, '2026-02-10T12:00:00Z')
  const before = structuredClone(review)
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(AccountInventoryReview, { review, language }))
    for (const href of ['/data-map', '/data-ops#account-coverage', '/data-ops#supplementary-coverage']) assert.ok(html.includes(`href="${href}"`))
    assert.match(html, language === 'en' ? /Owner not confirmed/ : /소유자 미확인/)
    assert.match(html, language === 'en' ? /No new source request/ : /새 자료 요청 없음/)
    assert.doesNotMatch(html, /<form|<input|Download now|지금 다운로드/)
  }
  assert.deepEqual(review, before)
})
