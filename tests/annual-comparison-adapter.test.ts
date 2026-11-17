import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolveTaxEvidence } from '../lib/application/evidence-index'
import test from 'node:test'
import example from '../examples/annual-tax-estimate.synthetic.json'
import { emptyTaxHistory, validateTaxHistory } from '../lib/domain/taxes/history'
import { annualInputDigest, validateAnnualEstimateInput } from '../lib/domain/taxes/annual/contracts'
import { annualJsonDigest, getAnnualRulePack } from '../lib/domain/taxes/annual/rules'
import { assessUsFederalComposition } from '../lib/domain/taxes/annual/us-composition-contract'
import { composeUsFederalAnnualEstimate } from '../lib/domain/taxes/annual/us-composition'
import { selectAnnualFederalHistory } from '../lib/application/annual-tax-history-selection'
import { readAnnualFederalComparison } from '../lib/adapters/annual-tax-comparison'

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const note = (sourceRefs = ['public-example']) => ({ state:'reviewed',reason:'Synthetic reviewed boundary only',sourceRefs,reviewedAt:'2026-11-17' })
function fixture(t: any, kind: 'return' | 'assessment' = 'return') {
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'annual-comparison-')))
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const roots={records:path.join(dir,'records'),tax:path.join(dir,'tax')};fs.mkdirSync(roots.records);fs.mkdirSync(roots.tax)
  fs.writeFileSync(path.join(roots.tax,'proof with spaces.txt'),'synthetic return bytes')
  fs.writeFileSync(path.join(roots.records,'basis.txt'),'synthetic basis review bytes')
  const store:any=emptyTaxHistory();store.revision=3
  store.taxUnits=[{id:'example-unit',recordRevision:1,year:2025,kind:'joint',ownerIds:['example-a','example-b']}]
  store.obligations=[{id:'synthetic-obligation',recordRevision:1,taxUnitId:'example-unit',taxYear:2025,authority:'US:federal',taxType:'income',currency:'USD',coverageConfirmed:false,effectiveBasis:{kind,id:'synthetic-basis',recordRevision:2,reviewedAt:'2026-11-17',evidenceIds:['doc-b']}}]
  const basis={id:'synthetic-basis',recordRevision:2,obligationId:'synthetic-obligation',liability:{currency:'USD',minor:'1000000'},evidenceIds:['doc-a']}
  if(kind==='return')store.returns=[{...basis,status:'accepted'}];else store.assessments=[{...basis,date:'2026-11-16'}]
  store.evidence=[{id:'doc-a',recordRevision:1,root:'tax',relativePath:'proof with spaces.txt',sha256:sha('synthetic return bytes')},{id:'doc-b',recordRevision:1,root:'records',relativePath:'basis.txt',sha256:sha('synthetic basis review bytes')}]
  const input:any=structuredClone(example);input.requestedComponents=['us.regular.ordinary','us.niit']
  input.amounts.niitMagi={...input.amounts.taxableIncome,minor:'30000000'};input.amounts.netInvestmentIncome={...input.amounts.taxableIncome,minor:'2000000'}
  const bridge=()=>({...note(),state:'not-applicable',amountMinor:'0'})
  const compositionReview={schemaVersion:1,boundary:'US:federal:1040-line24',inputSha256:annualInputDigest(validateAnnualEstimateInput(input)),rulePackSha256:getAnnualRulePack(2025).contentSha256,coverage:note(),line17:bridge(),line21:bridge(),otherLine23:bridge(),niit:{...note(),placement:'excluded-from-other-line23'}}
  const recorded={schemaVersion:1,taxUnitId:'example-unit',taxYear:2025,authority:'US:federal',currency:'USD',taxType:'income',boundary:'US:federal:1040-line24',calculationScope:'annual-total',filingStatus:'mfj',residency:'reviewed-full-year',storeRevision:3,storeSha256:annualJsonDigest(validateTaxHistory(store)),obligationId:'synthetic-obligation',basisId:'synthetic-basis',basisRevision:2,current:true,evidenceIds:['doc-a','doc-b'],liabilityMinor:'1000000'}
  const selectionReview={...note(['doc-a']),obligationId:'synthetic-obligation',basisKind:kind,basisId:'synthetic-basis',basisRevision:2,taxUnitRevision:1,obligationRevision:1,storeRevision:3,storeSha256:recorded.storeSha256,boundary:'US:federal:1040-line24',filingStatus:'mfj',residency:'reviewed-full-year'}
  const bundle:any={schemaVersion:1,id:'synthetic-review',revision:1,selectionReview,compositionReview,comparisonApproval:{schemaVersion:1,calculationSha256:composeUsFederalAnnualEstimate(input,compositionReview).calculationSha256,mappingReview:{...note(['doc-a']),compositionSha256:assessUsFederalComposition(input,compositionReview).contractSha256,historySha256:annualJsonDigest(recorded)}}}
  const request:any={historyFile:path.join(dir,'history.json'),inputFile:path.join(dir,'input.json'),reviewFile:path.join(dir,'review.json'),evidenceRoots:roots,expectedReview:{id:bundle.id,revision:bundle.revision,sha256:annualJsonDigest(bundle)}}
  const save=(repin=true)=>{fs.writeFileSync(request.historyFile,JSON.stringify(store));fs.writeFileSync(request.inputFile,JSON.stringify(input));fs.writeFileSync(request.reviewFile,JSON.stringify(bundle));if(repin)request.expectedReview={id:bundle.id,revision:bundle.revision,sha256:annualJsonDigest(bundle)}}
  const repinStore=()=>{bundle.selectionReview.storeRevision=store.revision;bundle.selectionReview.storeSha256=annualJsonDigest(validateTaxHistory(store))}
  save();return {dir,roots,store,input,bundle,recorded,request,save,repinStore}
}
function blocked(result: ReturnType<typeof readAnnualFederalComparison>, code?: string) {
  assert.equal(result.status,'blocked');assert.equal(result.differenceMinor,null);assert.equal(result.comparisonEligible,false)
  if(code)assert.ok(result.blockers.includes(code),JSON.stringify(result))
}
function inventory(dir:string):unknown {
  return fs.readdirSync(dir,{recursive:true}).map(String).sort().map(rel=>{const p=path.join(dir,rel),s=fs.lstatSync(p);return [rel,s.isSymbolicLink()?fs.readlinkSync(p):s.isFile()?sha(fs.readFileSync(p)):'dir',s.mode,s.mtimeMs]})
}

test('pure selector derives exact current basis and combined evidence without requiring settlement coverage',t=>{
  const f=fixture(t),before=structuredClone({store:f.store,input:f.input,review:f.bundle.selectionReview})
  const selected=selectAnnualFederalHistory(f.store,f.input,f.bundle.selectionReview)
  assert.equal(selected.status,'selected');assert.deepEqual(selected.recorded,f.recorded)
  assert.deepEqual(selected.evidence.map((e:any)=>e.id),['doc-a','doc-b'])
  assert.deepEqual({store:f.store,input:f.input,review:f.bundle.selectionReview},before)
})
for(const kind of ['return','assessment'] as const)test(`adapter verifies explicit current ${kind}, file bytes and review pins before numerical comparison`,t=>{
  const f=fixture(t,kind),before=inventory(f.dir),result=readAnnualFederalComparison(f.request)
  assert.equal(result.status,'compared');assert.equal(result.differenceMinor,'698800');assert.equal(result.comparisonEligible,true)
  assert.equal(result.verification,'selected-history-evidence-and-review-pins-checked')
  assert.deepEqual(result.evidence.map(e=>[e.id,e.recordRevision,e.status]),[['doc-a',1,'verified'],['doc-b',1,'verified']])
  assert.equal(result.review?.revision,1);assert.equal(result.history?.revision,3)
  assert.deepEqual(inventory(f.dir),before)
})

test('adapter imports no writer/config default and calls no file/directory mutation',t=>{
  const f=fixture(t)
  const forbid=()=>{throw Error('unexpected writer call')}
  for(const method of ['writeFileSync','mkdirSync','renameSync','unlinkSync','rmSync','chmodSync'] as const)t.mock.method(fs,method,forbid)
  assert.equal(readAnnualFederalComparison(f.request).status,'compared')
  t.mock.restoreAll()
})

for(const field of ['historyFile','inputFile','reviewFile'])test(`missing ${field} is blocked; never fabricated as empty state`,t=>{
  const f=fixture(t);fs.unlinkSync(f.request[field]);blocked(readAnnualFederalComparison(f.request))
})
for(const field of ['historyFile','inputFile','reviewFile'])test(`symlinked ${field} is refused without following its target`,t=>{
  const f=fixture(t),p=f.request[field];fs.renameSync(p,p+'.target');fs.symlinkSync(p+'.target',p);blocked(readAnnualFederalComparison(f.request))
})

test('review ID/revision and same-revision content digest all require explicit caller pins',t=>{
  const f=fixture(t)
  for(const key of ['id','revision','sha256']){
    const r=structuredClone(f.request);r.expectedReview[key]=key==='revision'?2:key==='id'?'other-review':'0'.repeat(64)
    blocked(readAnnualFederalComparison(r),'review-pin-mismatch')
  }
  f.bundle.selectionReview.reason='Changed without a version bump';f.save(false)
  blocked(readAnnualFederalComparison(f.request),'review-pin-mismatch')
})

for(const mutate of [
  (f:any)=>{f.store.revision++},(f:any)=>{f.store.returns[0].liability.minor='1100000'},
  (f:any)=>{f.store.evidence[0].recordRevision++},(f:any)=>{f.store.evidence[0].relativePath='moved.txt'},
])test('history/evidence metadata content changes cannot reuse an old selected-store review',t=>{
  const f=fixture(t);mutate(f);f.save();blocked(readAnnualFederalComparison(f.request),'history-review-stale')
})

for(const [field,value,code] of [['basisRevision',1,'basis-review-stale'],['taxUnitRevision',2,'tax-unit-review-stale'],['obligationRevision',2,'obligation-review-stale']] as const)test(`reviewed ${field} must match current record`,t=>{
  const f=fixture(t);f.bundle.selectionReview[field]=value;f.save();blocked(readAnnualFederalComparison(f.request),code)
})

for(const state of ['draft','submitted','rejected'])test(`selected ${state} return cannot become effective liability by claiming current`,t=>{
  const f=fixture(t);f.store.returns[0].status=state;f.repinStore();f.save();blocked(readAnnualFederalComparison(f.request),'basis-unusable')
})

test('accepted superseding return blocks an obsolete selected return without automatic replacement',t=>{
  const f=fixture(t);f.store.returns.push({...f.store.returns[0],id:'accepted-amendment',recordRevision:1,supersedesId:'synthetic-basis'});f.repinStore();f.save()
  blocked(readAnnualFederalComparison(f.request),'basis-superseded')
  assert.equal(f.store.obligations[0].effectiveBasis.id,'synthetic-basis')
})

test('unaccepted amendment does not silently replace the explicit current accepted basis',t=>{
  const f=fixture(t);f.store.returns.push({...f.store.returns[0],id:'draft-amendment',recordRevision:1,status:'draft',supersedesId:'synthetic-basis'});f.repinStore();f.save()
  const selection=selectAnnualFederalHistory(f.store,f.input,f.bundle.selectionReview)
  assert.equal(selection.status,'selected');assert.equal(selection.recorded?.basisId,'synthetic-basis')
})

for(const mutate of [
  (f:any)=>{f.store.obligations[0].deleted=true},(f:any)=>{f.store.taxUnits[0].deleted=true},
  (f:any)=>{f.store.returns[0].deleted=true},(f:any)=>{delete f.store.obligations[0].effectiveBasis},
  (f:any)=>{f.store.obligations[0].effectiveBasis.recordRevision=1},
])test('missing/tombstoned/stale selected records never fall back to another candidate',t=>{
  const f=fixture(t);mutate(f);f.repinStore();f.save();blocked(readAnnualFederalComparison(f.request))
})

test('same tax-unit ID with different members and wrong obligation scope block before evidence access',t=>{
  const f=fixture(t);f.store.taxUnits[0].ownerIds=['different-a','different-b'];f.repinStore();f.save()
  blocked(readAnnualFederalComparison(f.request),'tax-unit-membership-mismatch')
  f.store.taxUnits[0].ownerIds=['example-a','example-b'];f.store.obligations[0].authority='US:CA';f.repinStore();f.save()
  blocked(readAnnualFederalComparison(f.request),'history-scope-mismatch')
})

for(const mutate of [
  (f:any)=>{fs.unlinkSync(path.join(f.roots.tax,'proof with spaces.txt'))},
  (f:any)=>{fs.writeFileSync(path.join(f.roots.tax,'proof with spaces.txt'),'changed document')},
  (f:any)=>{const p=path.join(f.roots.tax,'proof with spaces.txt');fs.unlinkSync(p);fs.symlinkSync(path.join(f.roots.records,'basis.txt'),p)},
])test('missing/changed/linked evidence blocks even if all metadata/mapping claims are current',t=>{
  const f=fixture(t);mutate(f);const result=readAnnualFederalComparison(f.request)
  blocked(result,'evidence-unavailable');assert.equal(result.comparison,null)
})

test('deleted/empty/unrelated review evidence is rejected',t=>{
  const f=fixture(t);f.store.evidence[0].deleted=true;f.repinStore();f.save();blocked(readAnnualFederalComparison(f.request),'evidence-record-unavailable')
  f.store.evidence[0].deleted=false;f.bundle.selectionReview.sourceRefs=['not-related'];f.repinStore();f.save();blocked(readAnnualFederalComparison(f.request),'selection-review-evidence-unavailable')
})

test('unknown boundary/profile review remains unknown rather than inferred from liability amount',t=>{
  const f=fixture(t);f.bundle.selectionReview.boundary=null;f.save();blocked(readAnnualFederalComparison(f.request),'selection-review-unresolved')
  f.bundle.selectionReview.boundary='US:federal:1040-line24';f.bundle.selectionReview.state='unknown';f.save();blocked(readAnnualFederalComparison(f.request),'selection-review-unresolved')
})

test('changed calculation/input or mapping requires current versions even when history evidence verifies',t=>{
  const f=fixture(t);f.input.revision++;f.save();blocked(readAnnualFederalComparison(f.request));
  const g=fixture(t);g.bundle.comparisonApproval.calculationSha256='0'.repeat(64);g.save()
  const result=readAnnualFederalComparison(g.request);blocked(result,'stale-calculation-review');assert.equal(result.comparison?.differenceMinor,null)
})

test('source changes during evidence verification discard even a nested numeric comparison',t=>{
  const f=fixture(t),original=fs.readSync;let changed=false
  t.mock.method(fs,'readSync',function(...args:any[]){
    const bytes=(original as any)(...args)
    const fd=args[0] as number
    if(!changed && fs.fstatSync(fd).size===Buffer.byteLength('synthetic return bytes')){
      changed=true;f.input.revision++;fs.writeFileSync(f.request.inputFile,JSON.stringify(f.input))
    }
    return bytes
  })
  const result=readAnnualFederalComparison(f.request);assert.equal(changed,true)
  blocked(result,'source-changed-during-read');assert.equal(result.comparison,null)
  assert.ok(result.evidence.every(e=>e.status!=='verified'),'unstable observation must not retain final verified receipts')
})

test('malformed JSON/review schemas and absent explicit paths fail closed without output files',t=>{
  const f=fixture(t);fs.writeFileSync(f.request.historyFile,'{not json');blocked(readAnnualFederalComparison(f.request))
  f.save();f.bundle.extra='not allowed';f.save();blocked(readAnnualFederalComparison(f.request))
  blocked(readAnnualFederalComparison({} as any),'invalid-request')
})

test('JSON size limits reject oversized reviews without reading an unbounded document',t=>{
  const f=fixture(t);fs.writeFileSync(f.request.reviewFile,' '.repeat(2*1024*1024+1));blocked(readAnnualFederalComparison(f.request))
})

test('JSON parent links are refused even when they point to the same file bytes',t=>{
  const f=fixture(t),link=path.join(f.dir,'linked-json-parent');fs.symlinkSync(f.dir,link)
  const request={...f.request,historyFile:path.join(link,'history.json')}
  blocked(readAnnualFederalComparison(request),'json-source-unavailable')
})

for(const target of ['parent-link','escape'])test(`evidence ${target} cannot pass using matching bytes outside the named real reference`,t=>{
  const f=fixture(t)
  if(target==='parent-link'){
    const sub=path.join(f.roots.tax,'actual');fs.mkdirSync(sub);fs.writeFileSync(path.join(sub,'proof.txt'),'synthetic return bytes');fs.symlinkSync(sub,path.join(f.roots.tax,'alias'))
    f.store.evidence[0].relativePath='alias/proof.txt'
  }else{
    fs.writeFileSync(path.join(f.dir,'outside.txt'),'synthetic return bytes');f.store.evidence[0].relativePath='../outside.txt'
  }
  f.repinStore();f.save();blocked(readAnnualFederalComparison(f.request),'evidence-unavailable')
})

test('effective-basis-only evidence is verified, not just candidate evidence',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.roots.records,'basis.txt'),'tampered basis-review bytes')
  blocked(readAnnualFederalComparison(f.request),'evidence-unavailable')
})
for(const where of ['candidate','effective-basis'])test(`empty ${where} evidence cannot be rescued by the other evidence set`,t=>{
  const f=fixture(t)
  if(where==='candidate')f.store.returns[0].evidenceIds=[];else f.store.obligations[0].effectiveBasis.evidenceIds=[]
  f.repinStore();f.save();blocked(readAnnualFederalComparison(f.request),'evidence-record-unavailable')
})

test('invalid UTF-8 review bytes are not silently replaced to match a reviewed canonical digest',t=>{
  const f=fixture(t);f.bundle.selectionReview.reason='Synthetic review \uFFFD marker';f.save()
  const bytes=fs.readFileSync(f.request.reviewFile),marker=Buffer.from('\uFFFD'),at=bytes.indexOf(marker)
  assert.ok(at>=0)
  fs.writeFileSync(f.request.reviewFile,Buffer.concat([bytes.subarray(0,at),Buffer.from([0xff]),bytes.subarray(at+marker.length)]))
  blocked(readAnnualFederalComparison(f.request),'json-source-unavailable')
})


test('FIFO evidence returns blocked without waiting for a writer', {skip:process.platform==='win32'}, t=>{
  const f=fixture(t),file=path.join(f.roots.tax,'proof with spaces.txt');fs.unlinkSync(file)
  const made=spawnSync('mkfifo',[file],{encoding:'utf8'});assert.equal(made.status,0,made.stderr)
  const probe=path.join(f.dir,'fifo-probe.mjs'),moduleUrl=pathToFileURL(path.resolve('lib/adapters/annual-tax-comparison.ts')).href
  fs.writeFileSync(probe,`import {readAnnualFederalComparison} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(readAnnualFederalComparison(${JSON.stringify(f.request)})));`)
  const child=spawnSync(process.execPath,['--import','tsx',probe],{cwd:process.cwd(),encoding:'utf8',timeout:8000})
  assert.equal(child.error,undefined,'read must not hang: '+String(child.error));assert.equal(child.status,0,child.stderr)
  blocked(JSON.parse(child.stdout),'evidence-unavailable')
})

test('evidence byte budget is enforced inside the resolver before reading a larger document',t=>{
  const f=fixture(t)
  assert.throws(()=>resolveTaxEvidence(f.store.evidence[0],f.roots,{maxBytes:8}))
  assert.equal(resolveTaxEvidence(f.store.evidence[0],f.roots).bytes.toString(),'synthetic return bytes')
})

test('evidence growing after fstat is bounded to the caller limit plus one detection byte',t=>{
  const f=fixture(t),file=path.join(f.roots.tax,'proof with spaces.txt'),ino=fs.statSync(file).ino
  const stat=fs.fstatSync,read=fs.readSync;let grew=false,readBytes=0
  t.mock.method(fs,'fstatSync',function(...args:any[]){
    const s=(stat as any)(...args)
    if(!grew&&s.ino===ino){grew=true;fs.appendFileSync(file,'x'.repeat(256))}
    return s
  })
  t.mock.method(fs,'readSync',function(...args:any[]){
    const n=(read as any)(...args)
    if((stat as any)(args[0]).ino===ino)readBytes+=n
    return n
  })
  assert.throws(()=>resolveTaxEvidence(f.store.evidence[0],f.roots,{maxBytes:32}))
  assert.equal(grew,true);assert.ok(readBytes>0&&readBytes<=33,`bounded read bytes: ${readBytes}`)
})
