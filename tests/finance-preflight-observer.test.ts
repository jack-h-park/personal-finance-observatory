import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { observeFinancePreflight } from '../lib/application/finance-preflight-observation'
import { localMetadata } from '../lib/adapters/finance-preflight-observer'
import type { ObservationRequest, EndpointRequest } from '../lib/domain/finance-preflight/observation-request'
import { financeFile } from '../scripts/finance-paths.mjs'

function fixture(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'finance-observer-')); t.after(() => rmSync(dir, { force: true, recursive: true }))
  mkdirSync(path.join(dir, 'archive'))
  const explicit = (value: string): EndpointRequest => ({ cwd: dir, allowedRoot: dir, source: { kind: 'explicit_path', path: value } })
  const producer: EndpointRequest = { cwd: dir, allowedRoot: dir, source: { kind: 'environment', key: 'BRIEFING_ARCHIVE_DIR' } }
  const consumer: EndpointRequest = { cwd: dir, allowedRoot: dir, source: { kind: 'finance_file', key: 'STOCK_BRIEFING_ARCHIVE_DIR' } }
  const request: ObservationRequest = { schemaVersion: 1, requestedContracts: ['archive_path'], archive: { producer, consumer, stages: ['document_writer', 'benchmarks', 'archive_commit', 'renderer'].map(stage => ({ stage: stage as 'document_writer' | 'benchmarks' | 'archive_commit' | 'renderer', endpoint: structuredClone(producer) })) } }
  const env = { NODE_ENV: 'test' as const, FINANCE_MODE: 'private', BRIEFING_ARCHIVE_DIR: 'archive', STOCK_BRIEFING_ARCHIVE_DIR: 'archive', UNRELATED_SECRET: 'never-return-this' }
  const context = { env, now: () => '2025-01-15T12:00:00Z', hostname: () => 'synthetic-host' }
  return { dir, request, env, context, explicit, run: () => observeFinancePreflight(request, context) }
}
const issueCodes = (r: ReturnType<typeof observeFinancePreflight>) => r.collectionIssues.map(x => x.code)
test('collects local canonical paths, actual selected settings and host provenance without appointment or live job claim', t => {
  const f = fixture(t), before = structuredClone(f.request), env = { ...f.env }, r = f.run()
  assert.equal(r.assessment.status, 'matched'); assert.equal(r.collectionMode, 'local_read_only')
  assert.equal(r.processContext.hostname, 'synthetic-host'); assert.equal(r.processContext.cwd, process.cwd())
  assert.equal(r.jobContextVerified, false); assert.equal(r.operationAuthorized, false); assert.equal(r.assessment.liveVerified, false)
  assert.deepEqual(f.request, before); assert.deepEqual(f.env, env); assert.ok(!JSON.stringify(r).includes('never-return-this'))
  const o = r.input.archive!.consumer.observation; assert.equal(o.state, 'available')
  if (o.state === 'available') assert.equal(o.canonicalPath, localMetadata.realpath(path.join(f.dir, 'archive')))
  assert.equal(r.input.archive!.producer.configurationSha256.length, 64)
})
test('separate explicit base cwd is recorded, not mislabelled as current process cwd', t => {
  const f = fixture(t); mkdirSync(path.join(f.dir, 'nested')); f.request.archive!.consumer.cwd = path.join(f.dir, 'nested'); f.env.STOCK_BRIEFING_ARCHIVE_DIR = '../archive'
  const r = f.run(); assert.equal(r.assessment.status, 'matched'); assert.equal(r.input.archive!.consumer.cwd, path.join(f.dir, 'nested'))
})
test('known finance settings use current/legacy override precedence and conflict detection', t => {
  const f = fixture(t); const env = { ...f.env, FINANCE_BRIEFING_ARCHIVE_DIR: 'archive' }
  const r = observeFinancePreflight(f.request, { ...f.context, env }); assert.equal(r.assessment.status, 'matched')
  assert.equal(r.input.archive!.consumer.configuredPath, financeFile('STOCK_BRIEFING_ARCHIVE_DIR', env, f.dir))
  const conflict = observeFinancePreflight(f.request, { ...f.context, env: { ...env, FINANCE_BRIEFING_ARCHIVE_DIR: 'other' } })
  assert.ok(issueCodes(conflict).includes('configuration_unavailable')); assert.notEqual(conflict.assessment.status, 'matched')
})
test('producer unset setting remains unavailable; no legacy directory is created or guessed', t => {
  const f = fixture(t); delete (f.env as Partial<typeof f.env>).BRIEFING_ARCHIVE_DIR
  const r = f.run(); assert.ok(issueCodes(r).includes('setting_missing')); assert.equal(r.assessment.status, 'unavailable')
})
test('observes existing alias without creating one', t => {
  const f = fixture(t); symlinkSync(path.join(f.dir, 'archive'), path.join(f.dir, 'alias')); f.env.BRIEFING_ARCHIVE_DIR = 'alias'
  assert.equal(f.run().assessment.status, 'matched')
})
test('missing endpoint and missing root remain unavailable', t => {
  const f = fixture(t); f.env.BRIEFING_ARCHIVE_DIR = 'absent'
  assert.equal(f.run().input.archive!.producer.observation.state, 'missing')
  f.request.archive!.producer.allowedRoot = path.join(f.dir, 'absent-root'); assert.ok(issueCodes(f.run()).includes('root_unavailable'))
})
test('explicit foreign host is not probed using local files or environment', t => {
  const f = fixture(t); f.request.archive!.producer.expectedHostname = 'other-host'; let calls = 0
  const metadata = { ...localMetadata, realpath: (name: string) => { calls++; return localMetadata.realpath(name) } }
  const r = observeFinancePreflight({ ...f.request, archive: { ...f.request.archive!, consumer: f.request.archive!.producer, stages: f.request.archive!.stages.map(x => ({ ...x, endpoint: f.request.archive!.producer })) } }, { ...f.context, metadata })
  assert.equal(calls, 0); assert.ok(issueCodes(r).includes('foreign_host')); assert.notEqual(r.assessment.status, 'matched')
})
test('root-escaping aliases and symlink loops cannot match', t => {
  const f = fixture(t); const outside = mkdtempSync(path.join(tmpdir(), 'observer-outside-')); t.after(() => rmSync(outside, { recursive: true, force: true }))
  symlinkSync(outside, path.join(f.dir, 'escape')); f.env.BRIEFING_ARCHIVE_DIR = 'escape'; assert.ok(issueCodes(f.run()).includes('root_escape'))
  symlinkSync('loop', path.join(f.dir, 'loop')); f.env.BRIEFING_ARCHIVE_DIR = 'loop'; assert.ok(issueCodes(f.run()).includes('path_loop'))
})
test('read access denial is an observation, not proof of write access or a parser error', t => {
  const f = fixture(t)
  const metadata = { ...localMetadata, readable: () => { throw Object.assign(new Error('private-path-secret'), { code: 'EACCES' }) } }
  const r = observeFinancePreflight(f.request, { ...f.context, metadata }); assert.notEqual(r.assessment.status, 'matched'); assert.ok(issueCodes(r).includes('read_access_denied')); assert.ok(!JSON.stringify(r).includes('private-path-secret'))
})
test('metadata identity change is reported conservatively', t => {
  const f = fixture(t); let seq = 0
  const metadata = { ...localMetadata, stat: (name: string) => ({ ...localMetadata.stat(name), identity: String(++seq) }) }
  assert.ok(issueCodes(observeFinancePreflight(f.request, { ...f.context, metadata })).includes('path_changed'))
})
test('wrong-kind regular endpoint reaches the pure kind check; FIFOs are not opened', t => {
  const f = fixture(t); writeFileSync(path.join(f.dir, 'file'), 'must-not-read'); f.env.BRIEFING_ARCHIVE_DIR = 'file'
  assert.ok(f.run().assessment.results[0].reasons.some(x => x.code === 'endpoint_kind_mismatch'))
})
test('FX authority stays pending and unrequested endpoint metadata is never inspected', t => {
  const f = fixture(t)
  f.request.curatedFx = { curator: { state: 'unconfirmed', role: 'finance_curator' }, committer: { state: 'unconfirmed', role: 'application_operator' }, inputs: ['rate_observations', 'screenshot_annotations', 'transfer_overrides'].map(resource => ({ resource: resource as 'rate_observations' | 'screenshot_annotations' | 'transfer_overrides', endpoint: f.explicit('do-not-access'), authority: f.explicit('do-not-access') })), outputs: [f.explicit('do-not-access')] }
  const metadata = { ...localMetadata, realpath: (name: string) => { assert.ok(!name.includes('do-not-access')); return localMetadata.realpath(name) } }
  assert.equal(observeFinancePreflight(f.request, { ...f.context, metadata }).assessment.status, 'matched')
  f.request.requestedContracts.push('curated_fx_authority'); const r = f.run(); assert.equal(r.assessment.results[0].status, 'matched'); assert.equal(r.input.curatedFx!.curator.state, 'unconfirmed')
})
test('hard-linked generated output conflicts with curated input without reading content', t => {
  const f = fixture(t); const keys = ['rate_observations', 'screenshot_annotations', 'transfer_overrides'] as const
  for (const k of keys) writeFileSync(path.join(f.dir, k), 'original-financial-bytes')
  linkSync(path.join(f.dir, keys[0]), path.join(f.dir, 'output'))
  f.request.requestedContracts = ['curated_fx_authority']; f.request.curatedFx = { curator: { state: 'unconfirmed', role: 'finance_curator' }, committer: { state: 'unconfirmed', role: 'application_operator' }, inputs: keys.map(resource => ({ resource, endpoint: f.explicit(resource), authority: f.explicit(resource) })), outputs: [f.explicit('output')] }
  const r = f.run(); assert.ok(issueCodes(r).includes('physical_input_output_collision')); assert.equal(r.assessment.status, 'conflict'); assert.equal(readFileSync(path.join(f.dir, keys[0]), 'utf8'), 'original-financial-bytes')
})
test('legacy transfer setting uses its explicit extractor rule, not generic finance key aliases', t => {
  const f = fixture(t); mkdirSync(path.join(f.dir, 'data')); writeFileSync(path.join(f.dir, 'data/fx-transfer-overrides.json'), '{}')
  f.request.archive!.producer = { cwd: f.dir, allowedRoot: f.dir, source: { kind: 'legacy_transfer_override' } }
  const r = f.run(); assert.equal(r.input.archive!.producer.configuredPath, path.join(f.dir, 'data/fx-transfer-overrides.json'))
})
for (const mutate of [
  (x: ObservationRequest) => { x.archive!.producer.allowedRoot = '/' },
  (x: ObservationRequest) => { x.archive!.producer.cwd = 'relative' },
  (x: ObservationRequest) => { x.requestedContracts = new Array(1) },
]) test('malformed collection request fails before metadata access', t => {
  const f = fixture(t); mutate(f.request); const metadata = { ...localMetadata, realpath: () => { throw Error('must-not-probe') } }
  assert.throws(() => observeFinancePreflight(f.request, { ...f.context, metadata }), { message: 'Invalid finance observation request' })
})
test('arbitrary secret setting keys and caller-supplied host observations are rejected', t => {
  const f = fixture(t); const x = JSON.parse(JSON.stringify(f.request)); x.archive.producer.source.key = 'PRIVATE_TOKEN'
  assert.throws(() => observeFinancePreflight(x, f.context), /Invalid finance observation request/)
  const y = { ...f.request, hostId: 'caller-claimed-live-host' }; assert.throws(() => observeFinancePreflight(y, f.context), /Invalid finance observation request/)
})
test('allowlisted settings changing during metadata collection cannot yield readiness', t => {
  const f = fixture(t); let changed = false
  const metadata = { ...localMetadata, stat: (name: string) => { if (!changed) { f.env.BRIEFING_ARCHIVE_DIR = 'changed-after-capture'; changed = true } return localMetadata.stat(name) } }
  const r = observeFinancePreflight(f.request, { ...f.context, metadata })
  assert.ok(issueCodes(r).includes('configuration_changed')); assert.equal(r.assessment.status, 'conflict')
})
test('unrelated supported finance path keys preserve private-mode inference parity', t => {
  const f = fixture(t); mkdirSync(path.join(f.dir, 'private-data/briefing-archive'), { recursive: true })
  const env = { BRIEFING_ARCHIVE_DIR: 'private-data/briefing-archive', STOCK_TAX_PLANS_PATH: path.join(f.dir, 'plans.json') }
  const r = observeFinancePreflight(f.request, { ...f.context, env })
  assert.equal(r.assessment.status, 'matched')
  assert.equal(r.input.archive!.consumer.configuredPath, financeFile('STOCK_BRIEFING_ARCHIVE_DIR', { NODE_ENV: 'test', ...env }, f.dir))
})
test('URI-shaped path settings are unavailable without copying credentials into receipts', t => {
  const f = fixture(t); f.env.BRIEFING_ARCHIVE_DIR = 'https://synthetic-user:private-credential@example.invalid/archive'
  const r = f.run(); assert.ok(issueCodes(r).includes('configuration_unavailable')); assert.ok(!JSON.stringify(r).includes('private-credential'))
  f.request.archive!.producer.source = { kind: 'explicit_path', path: 'https://synthetic-user:private-credential@example.invalid/archive' }
  assert.throws(() => f.run(), { message: 'Invalid finance observation request' })
})
