import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import test, { type TestContext } from 'node:test'
import example from '../examples/annual-tax-estimate.synthetic.json'
import historyExample from '../examples/tax-history.synthetic.json'
import { annualInputDigest, validateAnnualEstimateInput } from '../lib/domain/taxes/annual/contracts'
import { annualJsonDigest, getAnnualRulePack } from '../lib/domain/taxes/annual/rules'
import { assessUsFederalComposition } from '../lib/domain/taxes/annual/us-composition-contract'
import { composeUsFederalAnnualEstimate } from '../lib/domain/taxes/annual/us-composition'
import { validateTaxHistory } from '../lib/domain/taxes/history'

const root=path.resolve(import.meta.dirname,'..'),entry=path.join(root,'scripts/annual-tax-compare.ts'),loader=path.join(root,'node_modules/tsx/dist/loader.mjs')
const sha=(bytes:string)=>createHash('sha256').update(bytes).digest('hex')
const fact=(sourceRefs=['public-example'])=>({state:'reviewed',reason:'Synthetic CLI review',sourceRefs,reviewedAt:'2026-11-17'})
function fixture(t:TestContext){
  const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'annual-compare-cli-')))
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}))
  const records=path.join(dir,'records root'),tax=path.join(dir,'tax root');fs.mkdirSync(records);fs.mkdirSync(path.join(tax,'synthetic'),{recursive:true})
  fs.writeFileSync(path.join(tax,'synthetic/return.pdf'),'invented CLI evidence bytes')
  const store:any=structuredClone(historyExample);store.evidence[0].sha256=sha('invented CLI evidence bytes')
  const input:any=structuredClone(example);input.taxUnit={id:'self-2025',kind:'individual',ownerIds:['synthetic-owner']};input.filingStatus='single';input.requestedComponents=['us.regular.ordinary','us.niit']
  input.amounts.niitMagi={...input.amounts.taxableIncome,minor:'30000000'};input.amounts.netInvestmentIncome={...input.amounts.taxableIncome,minor:'2000000'}
  const bridge=()=>({...fact(),state:'not-applicable',amountMinor:'0'})
  const compositionReview={schemaVersion:1,boundary:'US:federal:1040-line24',inputSha256:annualInputDigest(validateAnnualEstimateInput(input)),rulePackSha256:getAnnualRulePack(2025).contentSha256,coverage:fact(),line17:bridge(),line21:bridge(),otherLine23:bridge(),niit:{...fact(),placement:'excluded-from-other-line23'}}
  const storeSha256=annualJsonDigest(validateTaxHistory(store))
  const recorded={schemaVersion:1,taxUnitId:'self-2025',taxYear:2025,authority:'US:federal',currency:'USD',taxType:'income',boundary:'US:federal:1040-line24',calculationScope:'annual-total',filingStatus:'single',residency:'reviewed-full-year',storeRevision:0,storeSha256,obligationId:'us-2025',basisId:'assessment-1',basisRevision:1,current:true,evidenceIds:['doc-1'],liabilityMinor:'11000'}
  const bundle:any={schemaVersion:1,id:'synthetic-cli-review',revision:1,selectionReview:{...fact(['doc-1']),obligationId:'us-2025',basisKind:'assessment',basisId:'assessment-1',basisRevision:1,taxUnitRevision:1,obligationRevision:1,storeRevision:0,storeSha256,boundary:'US:federal:1040-line24',filingStatus:'single',residency:'reviewed-full-year'},compositionReview,comparisonApproval:{schemaVersion:1,calculationSha256:composeUsFederalAnnualEstimate(input,compositionReview).calculationSha256,mappingReview:{...fact(['doc-1']),compositionSha256:assessUsFederalComposition(input,compositionReview).contractSha256,historySha256:annualJsonDigest(recorded)}}}
  const files={input:path.join(dir,'input 시나리오.json'),history:path.join(dir,'selected history.json'),review:path.join(dir,'selected review.json')}
  const save=()=>{fs.writeFileSync(files.input,JSON.stringify(input));fs.writeFileSync(files.history,JSON.stringify(store));fs.writeFileSync(files.review,JSON.stringify(bundle))};save()
  const args=()=>['--input',files.input,'--history',files.history,'--review',files.review,'--records-root',records,'--tax-root',tax,'--review-id',bundle.id,'--review-revision',String(bundle.revision),'--review-sha256',annualJsonDigest(bundle)]
  const env={NODE_ENV:process.env.NODE_ENV ?? 'test',HOME:process.env.HOME,PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,LANG:process.env.LANG,TSX_TSCONFIG_PATH:path.join(root,'tsconfig.json'),FINANCE_MODE:'private',FINANCE_STATE_WRITABLE:'1',FINANCE_STATE_DIR:path.join(dir,'ambient-state'),STOCK_DATA_DIR:path.join(dir,'ambient-records')}
  const run=(argv=args(),preload?:string)=>spawnSync(process.execPath,[...(preload?['--import',preload]:[]),'--import',loader,entry,...argv],{cwd:dir,env,encoding:'utf8',timeout:15000})
  const inventory=()=>fs.readdirSync(dir,{recursive:true}).map(String).sort().map(rel=>{const p=path.join(dir,rel),s=fs.lstatSync(p);return [rel,s.mode,s.mtimeMs,s.isFile()?sha(fs.readFileSync(p,'utf8')):'directory']})
  return {dir,records,tax,store,input,bundle,files,args,run,save,inventory,env}
}
function replace(args:string[],flag:string,value:string){const copy=[...args];copy[copy.indexOf(flag)+1]=value;return copy}
function without(args:string[],flag:string){const copy=[...args];copy.splice(copy.indexOf(flag),2);return copy}

test('actual CLI returns deterministic compared JSON with explicit files/pins, without changing them',t=>{
  const f=fixture(t),before=f.inventory(),result=f.run()
  assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'')
  const parsed=JSON.parse(result.stdout)
  assert.equal(parsed.status,'compared');assert.equal(parsed.differenceMinor,'2229700');assert.equal(parsed.comparisonEligible,true)
  assert.equal(parsed.comparison.differenceDirection,'estimate-minus-recorded-liability')
  assert.equal(parsed.verification,'selected-history-evidence-and-review-pins-checked');assert.equal(parsed.review.revision,1)
  assert.equal(result.stdout,f.run().stdout);assert.ok(result.stdout.endsWith('\n'));assert.ok(!result.stdout.includes(f.dir))
  assert.deepEqual(f.inventory(),before)
})

test('stale pins, input/history versions and changed evidence return blocked JSON with exit 1',t=>{
  const f=fixture(t),args=f.args()
  for(const [flag,value]of [['--review-id','not-the-selected-review'],['--review-revision','2'],['--review-sha256','0'.repeat(64)]]){
    const r=f.run(replace(args,flag,value));assert.equal(r.status,1,r.stderr);assert.equal(r.stderr,'');assert.equal(JSON.parse(r.stdout).differenceMinor,null)
  }
  f.input.revision++;f.save();let r=f.run(args);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).comparisonEligible,false)
  f.input.revision--;f.store.revision++;f.save();r=f.run(args);assert.equal(r.status,1);assert.ok(JSON.parse(r.stdout).blockers.includes('history-review-stale'))
  f.store.revision--;f.save();fs.writeFileSync(path.join(f.tax,'synthetic/return.pdf'),'changed document');r=f.run(args)
  assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).comparison,null)
})

test('explicit absent tax root is supported without guessing a fallback',t=>{
  const f=fixture(t),args=without(f.args(),'--tax-root');args.push('--no-tax-root')
  const r=f.run(args);assert.equal(r.status,1,r.stderr);assert.equal(r.stderr,'');assert.ok(JSON.parse(r.stdout).blockers.includes('evidence-unavailable'))
})

test('all paths and external review identity/version/hash are mandatory',t=>{
  const f=fixture(t),args=f.args()
  for(const flag of ['--input','--history','--review','--records-root','--tax-root','--review-id','--review-revision','--review-sha256']){
    const r=f.run(without(args,flag));assert.equal(r.status,2,flag);assert.equal(r.stdout,'');assert.match(r.stderr,/Usage:/)
  }
})

test('ambiguous, unknown, positional, write and mixed-help arguments are rejected without echoing values',t=>{
  const f=fixture(t),args=f.args()
  for(const bad of [[],['--input'],[...args,'--history',f.files.history],[...args,'--no-tax-root'],[...args,'--output','PRIVATE_ARG_SENTINEL'],[...args,'--apply'],[...args,'--force'],[...args,'--latest'],[...args,'--help'],[...args,'PRIVATE_ARG_SENTINEL'],['--'],['--input='+f.files.input]]){
    const r=f.run(bad);assert.equal(r.status,2,JSON.stringify(bad));assert.equal(r.stdout,'');assert.ok(!r.stderr.includes(f.dir));assert.ok(!r.stderr.includes('PRIVATE_ARG_SENTINEL'))
  }
})

test('noncanonical revision/hash/path arguments fail before observation',t=>{
  const f=fixture(t),args=f.args()
  for(const value of ['0','-1','01','1.0','1e0','9007199254740992','']){
    const r=f.run(replace(args,'--review-revision',value));assert.equal(r.status,2,value);assert.equal(r.stdout,'')
  }
  for(const value of ['bad','A'.repeat(64),'f'.repeat(63)])assert.equal(f.run(replace(args,'--review-sha256',value)).status,2)
  for(const value of ['relative.json',path.join(f.dir,'nested')+'/../input scenario.json'])assert.equal(f.run(replace(args,'--input',value)).status,2)
})

test('missing/malformed/symlinked sources return blocked data without private error text',t=>{
  const f=fixture(t)
  for(const text of ['{"PRIVATE_VALUE_SENTINEL":',' '.repeat(2*1024*1024+1)]){
    fs.writeFileSync(f.files.input,text);const r=f.run();assert.equal(r.status,1);assert.equal(r.stderr,'');assert.ok(!r.stdout.includes('PRIVATE_VALUE_SENTINEL'));assert.equal(JSON.parse(r.stdout).differenceMinor,null)
  }
  f.save();fs.renameSync(f.files.review,f.files.review+'.target');fs.symlinkSync(f.files.review+'.target',f.files.review)
  let r=f.run();assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).comparison,null)
  fs.unlinkSync(f.files.review);r=f.run();assert.equal(r.status,1);assert.equal(r.stderr,'')
})

function observer(f:ReturnType<typeof fixture>,protectExplicit=false){
  const file=path.join(f.dir,'observer.mjs'),protectedPaths=[path.join(f.dir,'.env.local'),path.join(f.dir,'tax-history.json'),path.join(f.dir,'ambient-state/tax-history.json'),...(protectExplicit?[...Object.values(f.files),f.records,f.tax]:[])]
  fs.writeFileSync(file,`
    import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {syncBuiltinESMExports} from 'node:module';
    const protectedPaths=new Set(${JSON.stringify(protectedPaths)}),root=${JSON.stringify(f.dir)};
    const asPath=v=>{if(v instanceof URL)v=fileURLToPath(v);if(Buffer.isBuffer(v))v=v.toString();return typeof v==='string'?path.resolve(v):null};
    const inspect=v=>{const p=asPath(v);if(p&&protectedPaths.has(p))process.stderr.write('UNEXPECTED_DATA_READ\\n')};
    const write=v=>{const p=asPath(v);if(p&&(p===root||p.startsWith(root+path.sep)))process.stderr.write('UNEXPECTED_DATA_WRITE\\n')};
    for(const target of [fs,fs.promises]){
      for(const name of ['readFileSync','readFile','openSync','open','statSync','stat','lstatSync','lstat','accessSync','access','existsSync','readdirSync','readdir','createReadStream']){
        if(typeof target[name]!=='function')continue;const original=target[name];
        target[name]=function(first,...rest){inspect(first);if(name==='openSync'||name==='open'){const flags=rest[0];if(typeof flags==='number'?(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND)):typeof flags==='string'&&/[wa+]/.test(flags))write(first)}return Reflect.apply(original,this,[first,...rest])};
      }
      for(const name of ['writeFileSync','writeFile','appendFileSync','appendFile','mkdirSync','mkdir','renameSync','rename','unlinkSync','unlink','rmSync','rm','chmodSync','chmod','truncateSync','truncate','createWriteStream']){
        if(typeof target[name]!=='function')continue;const original=target[name];target[name]=function(first,...rest){write(first);return Reflect.apply(original,this,[first,...rest])};
      }
    }
    syncBuiltinESMExports();
  `)
  return file
}

test('proven read/write observer confirms no ambient/default reads or financial writes despite writable env',t=>{
  const f=fixture(t)
  fs.writeFileSync(path.join(f.dir,'.env.local'),'INVALID_ENV_SENTINEL\nFINANCE_STATE_WRITABLE=1\n');fs.writeFileSync(path.join(f.dir,'tax-history.json'),'DEFAULT_STATE_SENTINEL')
  const guard=observer(f)
  const probe=spawnSync(process.execPath,['--import',guard,'--input-type=module','--eval',`import fs from 'node:fs';fs.readFileSync(${JSON.stringify(path.join(f.dir,'.env.local'))});try{fs.readFileSync(${JSON.stringify(path.join(f.dir,'ambient-state/tax-history.json'))})}catch{}fs.writeFileSync(${JSON.stringify(path.join(f.dir,'write-probe'))},'synthetic');`],{cwd:f.dir,env:f.env,encoding:'utf8',timeout:15000})
  assert.equal(probe.status,0,probe.stderr);assert.match(probe.stderr,/UNEXPECTED_DATA_READ/);assert.match(probe.stderr,/UNEXPECTED_DATA_WRITE/)
  const before=f.inventory(),r=f.run(f.args(),guard)
  assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');assert.deepEqual(f.inventory(),before)
})

test('help and invalid invocation touch no explicit sources',t=>{
  const f=fixture(t),guard=observer(f,true)
  for(const args of [['--help'],without(f.args(),'--review-id'),[...f.args(),'--output',f.files.input]]){
    const r=f.run(args,guard);assert.equal(r.status,args[0]==='--help'?0:2,r.stderr)
    assert.ok(!r.stderr.includes('UNEXPECTED_DATA_READ'));assert.ok(!r.stderr.includes('UNEXPECTED_DATA_WRITE'))
    if(args[0]==='--help'){assert.match(r.stdout,/review-revision/);assert.match(r.stdout,/Exit 0/);assert.equal(r.stderr,'')}
    else assert.equal(r.stdout,'')
  }
})
