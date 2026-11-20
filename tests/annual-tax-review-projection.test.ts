import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import example from '../examples/tax-history.synthetic.json'
import { validateTaxHistory } from '../lib/domain/taxes/history'
import { getReturnReportedAmounts } from '../lib/application/return-reported-amounts'
import { getAnnualTaxSummary } from '../lib/application/annual-tax-summary'
import { getTaxRecordDetail } from '../lib/application/tax-record-detail'
import { AnnualTaxSummary } from '../components/AnnualTaxSummary'
;(globalThis as { React?: typeof React }).React = React
const fixture = () => {
  const s = structuredClone(example)
  Object.assign(s.returns[0], { reportedAmounts: { prepayments: { currency: 'USD', minor: '0' }, refundRequested: { currency: 'USD', minor: '23000' }, evidenceIds: ['doc-2'] } })
  Object.assign(s.returns[1], { reportedAmounts: { prepayments: { currency: 'USD', minor: '9007199254740993000' }, evidenceIds: ['doc-1'] } })
  return validateTaxHistory(s)
}

test('return figures stay versioned, exact and independent of assessment basis and actual refunds', () => {
  const s=fixture(), before=JSON.stringify(s)
  const values=getReturnReportedAmounts(s,'us-2025')
  assert.equal(values.length,2)
  assert.equal(values[0].id,'return-original');assert.equal(values[0].prepaymentsMinor,'0');assert.equal(values[0].refundRequestedMinor,'23000')
  assert.equal(values[1].status,'submitted');assert.equal(values[1].prepaymentsMinor,'9007199254740993000');assert.equal(values[1].refundRequestedMinor,null)
  const annual=getAnnualTaxSummary(s).years[0].rows.find(x=>x.id==='us-2025')!
  assert.deepEqual(annual.reportedReturns,values);assert.equal(annual.liabilityMinor,'11000');assert.equal(annual.refunds?.principal,'1000');assert.equal(annual.outstandingMinor,'1500')
  assert.ok(getTaxRecordDetail(s,'us-2025')!.evidenceIds.includes('doc-2'))
  assert.equal(JSON.stringify(s),before)
})

test('legacy and deleted evidence stay unavailable; no auto-selection, inferred zero or hidden input mutation', () => {
  const legacy=getReturnReportedAmounts(validateTaxHistory(example),'us-2025')
  assert.ok(legacy.every(x=>x.prepaymentsMinor===null&&x.refundRequestedMinor===null&&x.evidenceState==='not-recorded'))
  const s=fixture();s.evidence.find(x=>x.id==='doc-2')!.deleted=true
  assert.equal(getReturnReportedAmounts(s,'us-2025')[0].refundRequestedMinor,null)
  assert.equal(getReturnReportedAmounts(s,'us-2025')[0].evidenceState,'unavailable')
  s.returns[1].deleted=true
  assert.equal(getReturnReportedAmounts(s,'us-2025').length,1)
  const archived=getReturnReportedAmounts(s,'us-2025',true).find(x=>x.id==='return-amended')!
  assert.equal(archived.archived,true);assert.equal(archived.prepaymentsMinor,'9007199254740993000')
})

test('bilingual annual review exposes reported facts, exact record/evidence links and blocked comparison without writes', () => {
  for(const language of ['en','ko'] as const){
    const html=renderToStaticMarkup(React.createElement(AnnualTaxSummary,{summary:getAnnualTaxSummary(fixture()),language}))
    assert.match(html,/USD 230\.00/);assert.match(html,/USD 0\.00/)
    assert.match(html,language==='en'?/Return-reported prepayments/:/신고서상 선납액/)
    assert.match(html,language==='en'?/Refund requested on return/:/신고서상 환급 요청액/)
    assert.match(html,/\/taxes\/records\/us-2025#version-return-original/)
    assert.match(html,/\/taxes\/records\/us-2025#evidence-doc-2/)
    assert.match(html,language==='en'?/comparison is blocked/:/비교는 차단/)
    assert.doesNotMatch(html,/<form|<input|<button|\/tax:annual:compare|\/api\/annual/)
  }
})

test('requested refund without settlement evidence remains unknown actual cash in the integrated journey', () => {
  const s=fixture();s.events=[];s.allocations=[];s.obligations.forEach(o=>o.coverageConfirmed=false)
  const result=getAnnualTaxSummary(s).years[0].rows.find(x=>x.id==='us-2025')!
  assert.equal(result.reportedReturns[0].refundRequestedMinor,'23000')
  assert.equal(result.refunds,null);assert.equal(result.payments,null);assert.equal(result.outstandingMinor,null)
  s.obligations[0].effectiveBasis!.recordRevision=99
  const stale=getAnnualTaxSummary(s).years[0].rows.find(x=>x.id==='us-2025')!
  assert.equal(stale.liabilityMinor,null);assert.equal(stale.reportedReturns[0].refundRequestedMinor,'23000')
})
