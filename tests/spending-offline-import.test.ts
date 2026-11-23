import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import Database from 'better-sqlite3'
import { PYTHON_BIN } from '../scripts/python-bin.mjs'

type Item = [string, string, number, string, string?]
const card = '0000-****-****-1234'
const label = 'Example Samsung Card'
const original: Item = ['2026-06-28', 'Store A', 10000, '1001']
const partial: Item = ['2026-06-28', 'Store A', -2000, '1001', '부분취소']
const other1: Item = ['2026-06-28', 'Store B', 5000, '1002']
const other2: Item = ['2026-06-28', 'Store B', 5000, '1003']

function testWorkspace(t: TestContext) {
  const root = fs.mkdtempSync(path.resolve(process.env.SPENDING_TEST_ROOT ?? os.tmpdir(), 'spending-xlsx-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, 'ledger')
  fs.mkdirSync(workspace)
  const accounts = path.join(root, 'accounts.json')
  fs.writeFileSync(accounts, JSON.stringify({ accounts: { 'Example Samsung Card': { institution: 'samsung', inventory: {
    role: 'primary', accountId: 'sample-card', providerId: 'samsung', owner: { state: 'confirmed', ownerId: 'self' },
    dimensions: { wrappers: [], assetClasses: [] }, lifecycle: { state: 'active' }, requirements: [],
  } } } }))
  const binding = path.join(root, 'binding.json')
  fs.writeFileSync(binding, JSON.stringify({ accountId: 'sample-card', samsungCardNumber: card, bankSaladPaymentMethod: label }))

  function files(name: string, issuer: Item[], salad: [string, string, number][], from='2026-06-01', to='2026-07-31') {
    const samsung = path.join(root, name + '-samsung.xlsx')
    const bankSalad = path.join(root, name + '-banksalad.xlsx')
    const generated = spawnSync(PYTHON_BIN, ['-c', String.raw`
import json, sys
from datetime import datetime, time
from openpyxl import Workbook
x=json.load(sys.stdin)
w=Workbook()
w.active.title='■ 카드이용내역'
w.active.append(['조회기간','이용지역','이용구분','금액합계(원)','건수합계(건)'])
w.active.append([x['start'].replace('-','.')+' ~ '+x['end'].replace('-','.'),'국내','일시불+할부',sum(r[2] for r in x['issuer']),len(x['issuer'])])
s=w.create_sheet('■ 국내이용내역')
s.append(['카드번호','본인가족구분','승인일자','승인시각','가맹점명','승인금액(원)','일시불할부구분','할부개월','승인번호','취소여부','사용포인트','결제일'])
for day, merchant, amount, approval, *status in x['issuer']:
 s.append([x['card'],'본인',day.replace('-','.'),'12:00:00',merchant,amount,'일시불','0',approval,status[0] if status else '-',0,' '])
w.save(x['samsung'])
w=Workbook()
w.active.title='가계부 내역'
w.active.append(['날짜','시간','타입','대분류','소분류','내용','금액','화폐','결제수단','메모'])
for day, merchant, amount in x['salad']:
 w.active.append([datetime.fromisoformat(day),time(12), '지출','분류','소분류',merchant,amount,'KRW',x['label'],None])
w.save(x['bankSalad'])
`], { input: JSON.stringify({ issuer, salad, card, label, samsung, bankSalad, start: from, end: to }), encoding:'utf8' })
    assert.equal(generated.status, 0, generated.stderr)
    const argv = ['--workspace', workspace, '--accounts', accounts, '--input', samsung,
      '--banksalad', bankSalad, '--binding', binding, '--from', from, '--to', to]
    function run(...extra: string[]) {
      return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-spending.ts', ...argv, ...extra], { encoding: 'utf8' })
    }
    return {
      run,
      preview: () => output(run()),
      apply: (token: string) => output(run('--apply','--review-token',token)),
    }
  }
  const state = path.join(workspace, 'private-data/personal-finance-offline/state/spending.sqlite')
  return { workspace, state, files }
}

function output(result: ReturnType<typeof spawnSync>) {
  assert.equal(result.status, 0, result.stderr.toString())
  return JSON.parse(result.stdout.toString())
}

test('Korean workbook preview and review preserve legitimate repeat purchases and hold doubtful observations on replay and overlap', (t) => {
  const p=testWorkspace(t)
  const evidence: [string,string,number][] = [
    ['2026-06-28','Store A',-10000], ['2026-06-28','Store B',-5000],
    ['2026-07-01','Store A',2000], ['2026-07-03','Unmatched',-700],
  ]
  const first=p.files('full',[original,partial,other1,other2],evidence)
  const preview=first.preview()
  assert.deepEqual(fs.readdirSync(p.workspace),[])
  assert.equal(preview.inserted,4)
  assert.equal(preview.evidenceLinked,1)
  assert.equal(preview.held.length,3)
  assert.deepEqual(preview.totals,[{month:'2026-06',currency:'KRW',purchaseMinor:'20000',refundMinor:'2000',netMinor:'18000'}])
  const applied=first.apply(preview.reviewToken)
  assert.equal(applied.status,'applied')
  assert.equal(first.apply(preview.reviewToken).status,'already_applied')
  const overlap=p.files('overlap',[other2,partial,other1,original],evidence.slice(0,3),'2026-06-25','2026-07-12')
  const overlapping=overlap.preview()
  assert.equal(overlapping.inserted,0)
  assert.equal(overlapping.matched,4)
  assert.deepEqual(overlap.apply(overlapping.reviewToken).totals,applied.totals)
  const db=new Database(p.state,{readonly:true})
  t.after(()=>db.close())
  assert.equal(db.prepare('select count(*) from spending_refund_link where purchase_id is not null').pluck().get(),1)
  assert.equal(db.prepare("select count(*) from spending_workbook_review where workbook='banksalad' and transaction_id is not null").pluck().get(),2)
  assert.equal(db.prepare("select count(*) from spending_workbook_review where reason is not null").pluck().get(),5)
  assert.equal(db.prepare('select count(*) from spending_transaction').pluck().get(),4)
})

test('offline import holds conflicting and unresolved cancellations without changing accepted spending', (t) => {
  const p=testWorkspace(t)
  const first=p.files('first',[original,['2026-06-28','Store A',-6000,'1001','부분취소']],[])
  const initial=first.apply(first.preview().reviewToken)
  const second=p.files('second',[original,['2026-06-28','Store A',-7000,'1001','부분취소'],
    ['2026-07-02','Store C',-500,'5000','전체취소']],[])
  const preview=second.preview()
  assert.equal(preview.inserted,0)
  assert.deepEqual(preview.held.map((r: {reason:string})=>r.reason).sort(),['refund_exceeds_purchase','unlinked_cancellation'])
  assert.deepEqual(second.apply(preview.reviewToken).totals, initial.totals)
  const smaller: Item = ['2026-06-28','Store A',-3000,'1001','부분취소']
  const conflicting=p.files('conflicting',[original,smaller],[])
  const disputed=conflicting.preview()
  assert.equal(disputed.inserted,0)
  assert.equal(disputed.held[0].reason,'conflicting_cancellation_history')
  const combined=p.files('combined',[original,['2026-06-28','Store A',-6000,'1001','부분취소'],smaller],[])
  assert.equal(combined.preview().inserted,1)
})

test('later workbook evidence cannot attach to a second approval with an identical retained match key', (t) => {
  const p=testWorkspace(t)
  const salad: [string,string,number][] = [['2026-06-28','Store B',-5000]]
  const first=p.files('first',[other1],salad)
  assert.equal(first.apply(first.preview().reviewToken).evidenceLinked,1)
  const second=p.files('later',[other2],salad)
  const preview=second.preview()
  assert.equal(preview.inserted,1)
  assert.equal(preview.evidenceLinked,0)
  assert.deepEqual(preview.held,[{workbook:'banksalad',row:2,reason:'ambiguous_match'}])
})

test('BankSalad links a legal name marker only when both economic keys have a single candidate', (t) => {
  const p = testWorkspace(t)
  const issuer: Item[] = [
    ['2026-06-28', '주식회사 예시상점', 10000, '2001'],
    ['2026-06-28', '주식회사 같은상점', 5000, '2002'],
    ['2026-06-28', '다른상점', 5000, '2003'],
  ]
  const evidence: [string, string, number][] = [
    ['2026-06-28', '(주)예시상점', -10000],
    ['2026-06-28', '(주)같은상점', -5000],
  ]
  const first = p.files('legal-marker', issuer, evidence)
  const preview = first.preview()
  assert.equal(preview.evidenceLinked, 1)
  assert.deepEqual(preview.held, [{ workbook: 'banksalad', row: 3, reason: 'ambiguous_match' }])
  const applied = first.apply(preview.reviewToken)
  assert.deepEqual(applied.totals, preview.totals)
  const repeated = p.files('legal-overlap', [issuer[1]], evidence.slice(1))
  const overlap = repeated.preview()
  assert.equal(overlap.evidenceLinked, 0)
  assert.equal(overlap.held[0].reason, 'ambiguous_match')
})
