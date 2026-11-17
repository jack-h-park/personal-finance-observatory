import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateFinancePreflight } from '../lib/domain/finance-preflight'
import { endpoint, scenario } from './fixtures/finance-preflight'

const codes = (input: unknown) => evaluateFinancePreflight(input).results.flatMap(x => x.reasons.map(r => r.code))
test('archive-only succeeds with unconfirmed unrequested FX roles; result is never live proof or authorization', () => {
  const x = scenario(), before = structuredClone(x), r = evaluateFinancePreflight(x)
  assert.equal(r.status, 'matched'); assert.equal(r.results.length, 1)
  assert.equal(r.evidenceBasis, 'provided_observations'); assert.equal(r.liveVerified, false)
  assert.equal(r.operationAuthorized, false); assert.equal(r.backupStatus, 'not_checked')
  assert.deepEqual(x, before); assert.deepEqual(evaluateFinancePreflight(x), r)
})
test('combined scopes preserve independent results and unanswered roles', () => {
  const x = scenario(); x.requestedContracts.push('curated_fx_authority')
  const r = evaluateFinancePreflight(x)
  assert.equal(r.status, 'unavailable'); assert.equal(r.results[0].status, 'matched')
  assert.equal(r.results[1].status, 'unavailable'); assert.ok(codes(x).includes('curator_unconfirmed'))
})
test('accepted curator and committer with all explicit inputs and distinct output match FX-only scope', () => {
  const x = scenario(); x.requestedContracts = ['curated_fx_authority']
  x.curatedFx!.curator = { state: 'accepted', role: 'finance_curator', actorId: 'synthetic-curator' }
  x.curatedFx!.committer = { state: 'accepted', role: 'application_operator', actorId: 'synthetic-operator' }
  assert.equal(evaluateFinancePreflight(x).status, 'matched')
})
test('same lexical path on different hosts mismatches', () => {
  const x = scenario(); x.archive!.consumer.hostId = 'another-host'
  assert.equal(evaluateFinancePreflight(x).status, 'mismatch'); assert.ok(codes(x).includes('host_mismatch'))
})
test('relative endpoint paths resolve against their own cwd', () => {
  const x = scenario(); x.archive!.consumer.cwd = '/different'; x.archive!.consumer.configuredPath = 'records/archive'
  assert.ok(codes(x).includes('observation_path_mismatch'))
})
test('different configured paths may have the same recorded canonical directory', () => {
  const x = scenario(); const e = x.archive!.consumer
  e.configuredPath = '/synthetic/alias'; if (e.observation.state === 'available') e.observation.resolvedPath = '/synthetic/alias'
  assert.equal(evaluateFinancePreflight(x).status, 'matched')
})
test('canonical destination mismatch and stage-specific mismatch are visible', () => {
  const x = scenario(); x.archive!.stages[0].endpoint = endpoint('/synthetic/records/other')
  assert.ok(codes(x).includes('canonical_path_mismatch'))
})
for (const state of ['missing', 'unavailable', 'conflict'] as const) test(`explicit ${state} observation stays unresolved`, () => {
  const x = scenario(); x.archive!.producer.observation = { state }
  assert.equal(evaluateFinancePreflight(x).status, state === 'conflict' ? 'conflict' : 'unavailable')
  assert.ok(codes(x).includes(`endpoint_${state}`))
})
for (const access of ['unreadable', 'unconfirmed'] as const) test(`read access ${access} cannot match`, () => {
  const x = scenario(); const o = x.archive!.producer.observation
  if (o.state === 'available') o.readAccess = access
  assert.equal(evaluateFinancePreflight(x).status, 'unavailable')
})
test('canonical root containment respects path boundaries', () => {
  const x = scenario(); const o = x.archive!.consumer.observation
  if (o.state === 'available') o.canonicalPath = '/synthetic/records-escape/archive'
  assert.ok(codes(x).includes('root_escape'))
})
test('archive endpoints must be directories', () => {
  const x = scenario(); x.archive!.producer = endpoint('/synthetic/records/archive', 'file')
  assert.ok(codes(x).includes('endpoint_kind_mismatch'))
})
for (const kind of ['missing', 'duplicate'] as const) test(`archive ${kind} stage cannot produce readiness`, () => {
  const x = scenario(); if (kind === 'missing') x.archive!.stages.pop(); else x.archive!.stages.push(x.archive!.stages[0])
  assert.ok(codes(x).includes(kind === 'missing' ? 'stage_missing' : 'stage_duplicate'))
})
test('requested but absent contract produces a valid unavailable report', () => {
  const x = scenario(); delete x.archive
  assert.equal(evaluateFinancePreflight(x).status, 'unavailable'); assert.ok(codes(x).includes('contract_missing'))
})
test('wrong accepted logical role is a conflict, not a default operator', () => {
  const x = scenario(); x.requestedContracts = ['curated_fx_authority']; x.curatedFx!.curator = { state: 'accepted', role: 'briefing_producer', actorId: 'synthetic' }
  assert.ok(codes(x).includes('curator_role_mismatch'))
})
for (const kind of ['missing', 'duplicate', 'collision', 'authority', 'input_alias'] as const) test(`FX ${kind} is detected independently`, () => {
  const x = scenario(); x.requestedContracts = ['curated_fx_authority']; const f = x.curatedFx!
  if (kind === 'missing') f.inputs.pop()
  if (kind === 'duplicate') f.inputs.push(f.inputs[0])
  if (kind === 'collision') f.outputs[0] = structuredClone(f.inputs[0].endpoint)
  if (kind === 'authority') f.inputs[0].authority.hostId = 'other-host'
  if (kind === 'input_alias') f.inputs[1].endpoint = structuredClone(f.inputs[0].endpoint)
  const code = ({ missing: 'input_missing', duplicate: 'input_duplicate', collision: 'input_output_collision', authority: 'host_mismatch', input_alias: 'input_alias' } as const)[kind]
  assert.ok(codes(x).includes(code))
})
test('FX requires explicit generated output observations', () => {
  const x = scenario(); x.requestedContracts = ['curated_fx_authority']; x.curatedFx!.outputs = []
  assert.ok(codes(x).includes('output_missing'))
})
for (const value of [null, {}, { ...scenario(), schemaVersion: 2 }, { ...scenario(), observedAt: '2025-02-30T12:00:00Z' }, { ...scenario(), requestedContracts: [] }, { ...scenario(), requestedContracts: ['archive_path', 'archive_path'] }, { ...scenario(), secret: 'must-not-echo' }]) test('malformed root contract is rejected without echoing contents', () => {
  assert.throws(() => evaluateFinancePreflight(value), { message: 'Invalid finance preflight input' })
})
test('malformed observations, accepted assignments and path strings are rejected', () => {
  for (const change of [
    (x: ReturnType<typeof scenario>) => { x.archive!.producer.cwd = 'relative' },
    (x: ReturnType<typeof scenario>) => { x.archive!.producer.configurationSha256 = 'invalid' },
    (x: ReturnType<typeof scenario>) => { x.archive!.producer.configuredPath = 'bad\0path' },
    (x: ReturnType<typeof scenario>) => { x.archive!.producer.configuredPath = 'C:\\private' },
    (x: ReturnType<typeof scenario>) => { x.curatedFx!.curator = { state: 'accepted', role: 'finance_curator' } },
  ]) { const x = scenario(); change(x); assert.throws(() => evaluateFinancePreflight(x), /Invalid finance preflight input/) }
})
test('enum fields reject objects without invoking coercion or leaking parser errors', () => {
  const x = scenario(); const malformed = JSON.parse(JSON.stringify(x))
  malformed.archive.producer.observation.readAccess = { toString: 'private-marker' }
  assert.throws(() => evaluateFinancePreflight(malformed), { message: 'Invalid finance preflight input' })
})
test('sparse arrays cannot create null scope results or hide missing stage facts', () => {
  for (const change of [
    (x: ReturnType<typeof scenario>) => { x.requestedContracts = new Array(1) },
    (x: ReturnType<typeof scenario>) => { x.archive!.stages = new Array(1) },
    (x: ReturnType<typeof scenario>) => { x.curatedFx!.inputs = new Array(1) },
    (x: ReturnType<typeof scenario>) => { x.curatedFx!.outputs = new Array(1) },
  ]) { const x = scenario(); change(x); assert.throws(() => evaluateFinancePreflight(x), { message: 'Invalid finance preflight input' }) }
})
test('array accessors and custom properties cannot hide non-JSON contract data', () => {
  const x = scenario()
  Object.defineProperty(x.requestedContracts, '0', { get: () => { throw Error('must-not-invoke') } })
  assert.throws(() => evaluateFinancePreflight(x), { message: 'Invalid finance preflight input' })
  const y = scenario(); Object.assign(y.requestedContracts, { privateToken: 'must-not-copy' })
  assert.throws(() => evaluateFinancePreflight(y), { message: 'Invalid finance preflight input' })
})
test('hidden serialization hooks are rejected before hashing a public API input', () => {
  const x = scenario()
  Object.defineProperty(x, 'toJSON', { value: () => { throw Error('must-not-invoke') } })
  assert.throws(() => evaluateFinancePreflight(x), { message: 'Invalid finance preflight input' })
})
