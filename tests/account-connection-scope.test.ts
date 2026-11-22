import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readAccountConnectionScope } from '@/lib/adapters/account-connection-scope'

test('account scope keeps same-account overlap and regional observations separate', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'account-connections-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const current = join(dir, 'account-connection-scope.json')

  assert.equal(readAccountConnectionScope(dir), null)
  writeFileSync(join(dir, 'us-connection-scope.json'), JSON.stringify({
    schemaVersion: 1, reviewedOn: '2026-01-01', snaptrade: ['fidelity'], simplefin: [],
  }))
  const legacy = readAccountConnectionScope(dir)?.accounts[0]
  assert.equal(legacy?.label.en, 'Fidelity Brokerage')
  assert.equal(legacy?.sources.snaptrade?.status, 'discovered')

  const us = {
    key: 'example-us', market: 'us', label: { en: 'Example US account', ko: '미국 예시 계좌' },
    sources: { snaptrade: { status: 'pilot' }, simplefin: { status: 'discovered' }, files: { status: 'required' } },
  }
  const kr = {
    key: 'example-kr', market: 'kr', label: { en: 'Example Korean account', ko: '한국 예시 계좌' },
    sources: { other: { status: 'pilot' }, files: { status: 'keep' } },
  }
  const scope = { schemaVersion: 2, reviewedOn: '2026-01-02', accounts: [us, kr] }
  writeFileSync(current, JSON.stringify(scope))
  assert.deepEqual(readAccountConnectionScope(dir), { reviewedOn: scope.reviewedOn, accounts: [us, kr] })

  for (const accounts of [
    [us, us],
    [{ ...kr, sources: us.sources }],
    [{ ...us, label: { en: 'Account 1234', ko: '예시 계좌' } }],
    [{ ...us, sources: { files: { status: 'pilot' } } }],
  ]) {
    writeFileSync(current, JSON.stringify({ ...scope, accounts }))
    assert.equal(readAccountConnectionScope(dir), null)
  }
})
