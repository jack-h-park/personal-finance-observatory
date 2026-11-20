import test from 'node:test'
import assert from 'node:assert/strict'
import { getHypotheticalTaxPreview, HYPOTHETICAL_EXAMPLES } from '../lib/application/hypothetical-tax-planning'

test('hypothetical ordinary and NIIT components are pinned, reproducible and never an annual bill', () => {
  const a = getHypotheticalTaxPreview('us-ordinary')
  assert.equal(a.status, 'ready')
  if (a.status !== 'ready') return
  assert.equal(a.result.annualTotal, null); assert.equal(a.result.comparisonEligible, false)
  assert.equal(a.input.amounts.taxableIncome?.minor, '12000000')
  assert.equal(a.result.components.find(x => x.id === 'us.regular.ordinary')?.amountMinor, '1622800')
  assert.equal(a.result.components.find(x => x.id === 'us.niit')?.amountMinor, '76000')
  assert.deepEqual(getHypotheticalTaxPreview('us-ordinary'), a)
  a.input.amounts.taxableIncome!.minor = '1'
  assert.equal(getHypotheticalTaxPreview('us-ordinary').status, 'ready')
  const fresh = getHypotheticalTaxPreview('us-ordinary')
  if (fresh.status === 'ready') assert.equal(fresh.input.amounts.taxableIncome?.minor, '12000000')
})

test('both supported preferential branches and explicit zero remain separate from missing', () => {
  for (const id of ['us-qdcg-distributions', 'us-qdcg-schedule']) {
    const p = getHypotheticalTaxPreview(id)
    assert.equal(p.status, 'ready')
    if (p.status === 'ready') { assert.equal(p.result.components[0].mode, 'computed'); assert.equal(p.result.components[0].amountMinor, '1406100') }
  }
  const zero = getHypotheticalTaxPreview('us-zero'), missing = getHypotheticalTaxPreview('missing-input')
  assert.equal(zero.status, 'ready'); assert.equal(missing.status, 'ready')
  if (zero.status === 'ready' && missing.status === 'ready') {
    assert.ok(zero.result.components.every(c => c.amountMinor === '0'))
    assert.equal(missing.result.components[0].amountMinor, null)
    assert.equal(missing.result.components[0].mode, 'unknown')
  }
})

test('Korean rational references never unlock reported or annual amounts', () => {
  for (const [id, numerator] of [['kr-national', '32400000000'], ['kr-local', '3240000000'], ['kr-fractional', '600']]) {
    const p = getHypotheticalTaxPreview(id)
    assert.equal(p.status, 'ready')
    if (p.status !== 'ready') continue
    assert.equal(p.reference?.exactTaxKrw?.numerator, numerator)
    assert.equal(p.reference?.exactTaxKrw?.denominator, '10000')
    assert.equal(p.reference?.reportedAmountMinor, null)
    assert.equal(p.result.annualTotal, null); assert.equal(p.result.comparisonEligible, false)
    assert.ok(p.result.components.every(c => c.amountMinor === null && c.mode === 'unsupported'))
  }
})

test('unsupported, cross-currency, wrong year and ambiguous selection cannot silently fall back', () => {
  const unsupported = getHypotheticalTaxPreview('unsupported-method')
  assert.equal(unsupported.status, 'ready')
  if (unsupported.status === 'ready') assert.ok(unsupported.result.components.every(c => c.mode === 'unsupported' && c.amountMinor === null))
  for (const id of ['currency-mismatch', 'unsupported-year', 'not-an-example', ['us-ordinary'], undefined]) {
    assert.equal(getHypotheticalTaxPreview(id).status, 'unavailable')
  }
  assert.equal(new Set(HYPOTHETICAL_EXAMPLES).size, HYPOTHETICAL_EXAMPLES.length)
})

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { React?: typeof React }).React = React
import { HypotheticalTaxPlanning } from '../components/HypotheticalTaxPlanning'

test('bilingual integrated preview explains scope before results, preserves native units and only navigates to context', () => {
  for (const language of ['en', 'ko'] as const) {
    const html = renderToStaticMarkup(React.createElement(HypotheticalTaxPlanning, { selection: 'us-ordinary', language }))
    assert.ok(html.includes('USD 16228.00'))
    assert.ok(html.includes('USD 760.00'))
    assert.ok(html.includes('/taxes?year=2025&amp;authority=US%3Afederal'))
    assert.ok(html.includes('annual-2025-foundation-v1'))
    assert.ok(html.indexOf('id="hypothetical-scope"') < html.indexOf('id="hypothetical-results"'))
    assert.ok(!html.includes('method="post"')); assert.ok(!html.includes('formAction='))
    const kr = renderToStaticMarkup(React.createElement(HypotheticalTaxPlanning, { selection: 'kr-fractional', language }))
    assert.ok(kr.includes('600 / 10000 KRW'))
    assert.ok(kr.includes('/taxes?year=2025&amp;authority=KR%3Anational'))
    assert.ok(!kr.includes('USD 16228.00'))
    const bad = renderToStaticMarkup(React.createElement(HypotheticalTaxPlanning, { selection: ['us-ordinary'], language }))
    assert.ok(!bad.includes('USD 16228.00'))
  }
})

test('single profile and readable input bases accompany the bounded result', () => {
  const p = getHypotheticalTaxPreview('us-single')
  assert.equal(p.status, 'ready')
  if (p.status === 'ready') { assert.equal(p.input.filingStatus, 'single'); assert.equal(p.input.taxUnit.ownerIds.length, 1) }
  const html = renderToStaticMarkup(React.createElement(HypotheticalTaxPlanning, { selection: 'us-ordinary', language: 'en' }))
  assert.ok(html.indexOf('USD 120000.00') < html.indexOf('id="hypothetical-results"'))
})

test('blocked components explain the specific reason outside technical disclosures in both languages', () => {
  for (const [language, reason] of [['en', 'The example requests an unsupported special method. Both federal components remain blocked.'], ['ko', '지원하지 않는 특별 계산 방식을 선택한 예시이므로 미국 연방 구성요소 둘 다 차단합니다.']] as const) {
    const html = renderToStaticMarkup(React.createElement(HypotheticalTaxPlanning, { selection: 'unsupported-method', language }))
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, '')
    assert.ok(visible.includes(reason))
  }
})
