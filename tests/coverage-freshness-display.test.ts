import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { summarizeSupplementaryFreshness } from '../lib/application/coverage-freshness-summary'
import { summarizeAccountCoverage } from '../lib/application/account-coverage-summary'
import { AccountCoverageSummary } from '../components/AccountCoverageSummary'
import { SupplementaryCoverageTable } from '../components/SupplementaryCoverageTable'
import type { SupplementaryCoverageRow } from '../lib/adapters/portfolio-db'
;(globalThis as { React?: typeof React }).React = React

const gap = { from: '2024-04-01', to: '2024-04-09' }
const fixture = (freshnessStatus?: SupplementaryCoverageRow['freshnessStatus'], extra = {}): SupplementaryCoverageRow => ({
  kind: 'deposit', label: 'Contract Bank invented', status: 'action_needed', action: 'existing synthetic action',
  latestDate: '2026-02-08', maxLagDays: 30, lagDays: 1, historyGap: gap,
  ...(freshnessStatus ? { freshnessStatus } : {}), ...extra,
})

test('supplementary freshness summary counts explicit states separately from combined actions and gaps', () => {
  const rows = [fixture('current'), fixture('action_needed'), fixture('due_soon'), fixture('unconfirmed'), fixture('missing'),
    fixture(), fixture(undefined, { freshnessStatus: 'invalid', staleWithHistoryGap: false }),
    fixture('current', { kind: 'pension', historyGap: undefined })]
  const before = structuredClone(rows)
  rows.forEach(row => Object.freeze(row)); Object.freeze(rows)
  const result = summarizeSupplementaryFreshness(rows)
  assert.deepEqual(result, [
    { id: 'bankCma', rows: 7, statuses: { current: 1, due_soon: 1, action_needed: 1, missing: 1, unconfirmed: 1 }, unavailable: 2, historyGaps: 7 },
    { id: 'other', rows: 1, statuses: { current: 1, due_soon: 0, action_needed: 0, missing: 0, unconfirmed: 0 }, unavailable: 0, historyGaps: 0 },
  ])
  assert.deepEqual(rows, before)
  assert.equal(summarizeAccountCoverage({ investmentRows: [], supplementaryRows: rows }).groups[1].statuses.action_needed, 7)
})

test('empty freshness groups remain configured source counts without an inventory conclusion', () => {
  assert.deepEqual(summarizeSupplementaryFreshness([]), ['bankCma', 'other'].map(id => ({ id, rows: 0,
    statuses: { current: 0, due_soon: 0, action_needed: 0, missing: 0, unconfirmed: 0 }, unavailable: 0, historyGaps: 0 })))
})

test('both-language summary renders independent freshness alongside unchanged combined review states', () => {
  const source = [fixture('current'), fixture(), fixture('unconfirmed')]
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(AccountCoverageSummary, {
      language, summary: summarizeAccountCoverage({ investmentRows: [], supplementaryRows: source }),
      freshness: summarizeSupplementaryFreshness(source),
    }))
    assert.match(html, language === 'en' ? /Source freshness · supplementary/ : /자료 최신성 · 은행·추가 자료/)
    assert.match(html, language === 'en' ? /Freshness metadata unavailable/ : /최신성 정보 없음/)
    assert.match(html, language === 'en' ? /History gaps/ : /과거 구간 누락/)
    assert.match(html, language === 'en' ? /may overlap/ : /겹칠 수/)
    assert.ok(html.includes('href="#supplementary-coverage"'))
    assert.doesNotMatch(html, /Contract Bank|existing synthetic action|<form|<input|<button|All accounts are current|100%/)
  }
})

const cells = (html: string) => [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]*>/g, ''))
test('detail table keeps legacy status and action while showing current freshness and the exact recorded gap', () => {
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(SupplementaryCoverageTable, { rows: [fixture('current')], language }))
    const values = cells(html)
    assert.match(html, language === 'en' ? /Source freshness/ : /자료 최신성/)
    assert.match(html, language === 'en' ? /Recorded history gap/ : /기록된 과거 구간 누락/)
    assert.ok(values.some(v => v === (language === 'en' ? 'Current' : '현재 기준')))
    assert.ok(values.some(v => v === (language === 'en' ? 'Update needed' : '업데이트 필요')))
    assert.ok(values.some(v => /2024-04-01/.test(v) && /2024-04-09/.test(v)))
    assert.match(html, language === 'en' ? /Download account transaction history/ : /누락된 계좌 거래내역/)
    assert.doesNotMatch(html, /<form|<input|<button/)
  }
})

test('old or invalid detail metadata stays unavailable while explicit unknown remains a distinct state', () => {
  for (const language of ['en', 'ko'] as const) {
    for (const row of [fixture(), fixture(undefined, { freshnessStatus: 'invalid', staleWithHistoryGap: false })]) {
      const html = renderToStaticMarkup(React.createElement(SupplementaryCoverageTable, { rows: [row], language }))
      assert.match(html, language === 'en' ? /Freshness metadata unavailable/ : /최신성 정보 없음/)
      assert.match(html, language === 'en' ? /Update needed/ : /업데이트 필요/)
    }
    const html = renderToStaticMarkup(React.createElement(SupplementaryCoverageTable, { rows: [fixture('unconfirmed')], language }))
    assert.match(html, language === 'en' ? /Confirm query period/ : /조회기간 확인 필요/)
    assert.doesNotMatch(html, language === 'en' ? /Freshness metadata unavailable/ : /최신성 정보 없음/)
  }
})

test('no recorded gap is labelled as limited evidence rather than complete history', () => {
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(SupplementaryCoverageTable, {
      rows: [fixture('due_soon', { status: 'due_soon', historyGap: undefined })], language,
    }))
    assert.match(html, language === 'en' ? /No recorded gap/ : /기록된 누락 없음/)
    assert.match(html, language === 'en' ? /renewal due soon/ : /곧 갱신 예정/)
    assert.doesNotMatch(html, /complete history|전체 기간 확인/)
  }
})

test('each explicit detail freshness state uses source metadata without replacing the legacy action', () => {
  for (const [state, en, ko] of [
    ['current', 'Current', '현재 기준'], ['due_soon', 'Due soon', '곧 필요'],
    ['action_needed', 'Update needed', '업데이트 필요'], ['missing', 'No data', '자료 없음'],
    ['unconfirmed', 'Confirm query period', '조회기간 확인 필요'],
  ] as const) {
    for (const language of ['en', 'ko'] as const) {
      const html = renderToStaticMarkup(React.createElement(SupplementaryCoverageTable, { rows: [fixture(state)], language }))
      const values = cells(html)
      assert.equal(values[2], language === 'en' ? en : ko)
      assert.equal(values[4], language === 'en' ? 'Update needed' : '업데이트 필요')
      assert.match(values[5], language === 'en' ? /Download account transaction history/ : /누락된 계좌 거래내역/)
    }
  }
})

test('historical-only table row retains closure policy without freshness or complete-history claims', () => {
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(SupplementaryCoverageTable, { rows: [], language, accounts: [{
      id: 'invented', market: 'CASH', brokerage: 'Contract Bank', name: 'Historical', aliases: [], accountType: null,
      assetType: 'cash', ranges: { balances: { start: '2024-01-01', end: '2024-04-01', count: 2 } }, firstDate: '2024-01-01', lastDate: '2024-04-01',
    }] }))
    const values = cells(html)
    assert.equal(values[3], '—'); assert.equal(values[4], '—')
    assert.match(html, language === 'en' ? /No further downloads · history retained/ : /추가 다운로드 불필요 · 과거 기록 보존/)
    assert.doesNotMatch(html, /Freshness metadata unavailable|최신성 정보 없음|No recorded gap|기록된 누락 없음/)
  }
})
