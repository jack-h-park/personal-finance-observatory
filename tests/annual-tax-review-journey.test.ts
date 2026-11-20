import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import example from '../examples/tax-history-annual-review.synthetic.json'
import { emptyTaxHistory, validateTaxHistory } from '../lib/domain/taxes/history'
import { getAnnualTaxSummary } from '../lib/application/annual-tax-summary'
import { getTaxHistoryView } from '../lib/application/tax-history-query'
import { getTaxRecordDetail } from '../lib/application/tax-record-detail'
import { previewTaxHistoryImport, applyTaxHistoryImport } from '../lib/application/import-tax-history'
import { resolveTaxEvidence } from '../lib/application/evidence-index'
import { createHash } from 'node:crypto'

test('synthetic year review follows exact return/evidence and distinguishes cash year, reversal and undated/unallocated events', () => {
  const s=validateTaxHistory(example), before=JSON.stringify(s)
  const summary=getAnnualTaxSummary(s), refund=summary.years[0].rows.find(x=>x.id==='refund-request-2025')!
  assert.equal(refund.reportedReturns[0].refundRequestedMinor,'20000');assert.equal(refund.refunds,null);assert.equal(refund.outstandingMinor,null)
  assert.equal(getTaxRecordDetail(s,refund.id)!.versions[0].id,'refund-return')
  const cash=getTaxHistoryView(s,{taxUnitId:'self-2025',taxYear:2025,view:'cash-date',cashDateFrom:'2026-01-01',cashDateTo:'2026-12-31'})
  assert.equal(cash.cashEvents.find(x=>x.id==='payment')?.date,'2026-04-10')
  assert.equal(cash.cashEvents.find(x=>x.id==='payment')?.postingDate,'2026-04-12')
  assert.equal(cash.cashEvents.find(x=>x.id==='reversal')?.principal,'-500')
  assert.ok(cash.missingOccurrenceDates.includes('undated-demo'));assert.ok(cash.unallocated.some(x=>x.eventId==='unallocated-demo'))
  assert.equal(JSON.stringify(s),before)
})

test('new return facts use existing reviewed import revisions and repeat-import no-op without replacing audit history', t => {
  const root=fs.mkdtempSync(path.join(tmpdir(),'tax-review-import-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'history.json')
  const incoming=validateTaxHistory(example), options={expectedRevision:0,incoming,reason:'Synthetic annual review',reviewedMatchDecisions:[],reviewedRecordChanges:[],stateWritable:true}
  const first=applyTaxHistoryImport(file,options)
  assert.deepEqual(applyTaxHistoryImport(file,{...options,expectedRevision:first.revision}),first)
  const changed=structuredClone(first);changed.returns.find(x=>x.id==='refund-return')!.reportedAmounts!.refundRequested!.minor='21000'
  const preview=previewTaxHistoryImport(first,changed);assert.equal(preview.changes.length,1)
  assert.throws(()=>applyTaxHistoryImport(file,{...options,incoming:changed,expectedRevision:first.revision}),/review/i)
  assert.equal(preview.basisInvalidations.length,1)
  const reviewed=structuredClone(changed)
  reviewed.returns.find(x=>x.id==='refund-return')!.recordRevision=2
  reviewed.obligations.find(x=>x.id==='refund-request-2025')!.effectiveBasis!.recordRevision=2
  const reviewedPreview=previewTaxHistoryImport(first,reviewed)
  assert.equal(reviewedPreview.basisInvalidations.length,0)
  const next=applyTaxHistoryImport(file,{...options,incoming:reviewed,expectedRevision:first.revision,reviewedRecordChanges:reviewedPreview.changes})
  assert.equal(next.returns.find(x=>x.id==='refund-return')!.recordRevision,2)
  assert.deepEqual(next.changes[0],first.changes[0])
  assert.equal(fs.existsSync(path.join(root,'unrequested.json')),false)
  assert.equal(previewTaxHistoryImport(emptyTaxHistory(),incoming).basisInvalidations.length,0)
  assert.throws(()=>applyTaxHistoryImport(file,{...options,expectedRevision:next.revision,stateWritable:false}),{name:'TaxHistoryReadOnlyError'})
})

test('synthetic evidence resolution distinguishes missing and hash-mismatched bytes without inventing a replacement', t => {
  const root=fs.mkdtempSync(path.join(tmpdir(),'tax-review-evidence-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const bytes=Buffer.from('Synthetic annual review evidence'),file=path.join(root,'return.txt');fs.writeFileSync(file,bytes)
  const evidence={id:'review-doc',recordRevision:1,root:'tax' as const,relativePath:'return.txt',sha256:createHash('sha256').update(bytes).digest('hex')}
  assert.deepEqual(resolveTaxEvidence(evidence,{tax:root,records:root}).bytes,bytes)
  fs.writeFileSync(file,'Different synthetic bytes');assert.throws(()=>resolveTaxEvidence(evidence,{tax:root,records:root}),/changed|hash/i)
  fs.unlinkSync(file);assert.throws(()=>resolveTaxEvidence(evidence,{tax:root,records:root}),/missing|unavailable/i)
})
