import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..'), loader = path.join(root, 'node_modules/tsx/dist/loader.mjs'), entry = path.join(root, 'scripts/finance-preflight-observe.ts')
function fixture(t: TestContext) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'observer-cli-'))); t.after(() => rmSync(dir, { force: true, recursive: true })); mkdirSync(path.join(dir, 'archive'))
  const endpoint = { cwd: dir, allowedRoot: dir, source: { kind: 'environment', key: 'BRIEFING_ARCHIVE_DIR' } }
  const request = { schemaVersion: 1, requestedContracts: ['archive_path'], archive: { producer: endpoint, consumer: endpoint, stages: ['document_writer', 'benchmarks', 'archive_commit', 'renderer'].map(stage => ({ stage, endpoint })) } }
  const input = path.join(dir, 'request.json'); writeFileSync(input, JSON.stringify(request))
  const run = (args: string[], preload?: string, archive = 'archive') => spawnSync(process.execPath, [...(preload ? ['--import', preload] : []), '--import', loader, entry, ...args], { cwd: dir, encoding: 'utf8', timeout: 15000, env: { ...process.env, TSX_DISABLE_CACHE: '1', TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json'), BRIEFING_ARCHIVE_DIR: archive, PRIVATE_TOKEN: 'must-not-appear', FINANCE_STATE_WRITABLE: '1' } })
  return { dir, input, request, run }
}
test('collects fixture metadata from process environment; nonmatched exits 1 and never claims scheduled-job verification', t => {
  const f = fixture(t), r = f.run(['--input', f.input]); assert.equal(r.status, 0, r.stderr); const j = JSON.parse(r.stdout)
  assert.equal(j.collectionMode, 'local_read_only'); assert.equal(j.jobContextVerified, false); assert.equal(j.liveVerified, false); assert.equal(j.operationAuthorized, false); assert.equal(j.processContext.cwd, f.dir)
  assert.ok(!r.stdout.includes('must-not-appear')); assert.ok(!j.configurationKeys.includes('PRIVATE_TOKEN'))
  const missing = f.run(['--input', f.input], undefined, 'missing'); assert.equal(missing.status, 1, missing.stderr); assert.equal(JSON.parse(missing.stdout).assessment.status, 'unavailable')
})
test('no endpoint contents, dotenv, writes, network or child processes are needed', t => {
  const f = fixture(t); const protectedFile = path.join(f.dir, 'protected.json'); writeFileSync(protectedFile, 'private-financial-bytes'); writeFileSync(path.join(f.dir, '.env.local'), 'PRIVATE_TOKEN=must-not-load')
  const preload = path.join(f.dir, 'guard.mjs'); writeFileSync(preload, `
import fs from 'node:fs';import net from 'node:net';import http from 'node:http';import https from 'node:https';import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
const deny=()=>{throw Error('side-effect-or-content-read')};
for(const k of ['writeFileSync','appendFileSync','mkdirSync','renameSync','rmSync','unlinkSync','chmodSync'])fs[k]=deny;
for(const k of ['writeFile','appendFile','mkdir','rename','rm','unlink','chmod']){fs[k]=deny;fs.promises[k]=deny;}
const read=fs.readFileSync;fs.readFileSync=function(p,...a){if(String(p).endsWith('.env.local')||String(p).endsWith('protected.json'))deny();return read.call(this,p,...a)};
const open=fs.openSync;fs.openSync=function(p,f,...a){if((typeof f==='number'&&(f&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC)))||typeof f==='string'&&!f.startsWith('r'))deny();if(String(p).endsWith('protected.json'))deny();return open.call(this,p,f,...a)};
net.connect=deny;net.createConnection=deny;http.request=deny;https.request=deny;cp.spawnSync=deny;cp.execSync=deny;syncBuiltinESMExports();
`)
  const before = readdirSync(f.dir).sort(), original = readFileSync(f.input)
  const r = f.run(['--input', f.input], preload, 'protected.json'); assert.equal(r.status, 1, r.stderr)
  assert.ok(JSON.parse(r.stdout).assessment.results[0].reasons.some((v: { code: string }) => v.code === 'endpoint_kind_mismatch'))
  assert.deepEqual(readdirSync(f.dir).sort(), before); assert.deepEqual(readFileSync(f.input), original); assert.equal(readFileSync(protectedFile, 'utf8'), 'private-financial-bytes')
})
test('special endpoints such as FIFO cannot hang or match', t => {
  const f = fixture(t); const fifo = path.join(f.dir, 'special'); assert.equal(spawnSync('mkfifo', [fifo]).status, 0)
  const r = f.run(['--input', f.input], undefined, 'special'); assert.equal(r.status, 1, r.stderr); assert.equal(r.signal, null); assert.ok(JSON.parse(r.stdout).collectionIssues.some((x: { code: string }) => x.code === 'unsupported_kind'))
})
test('invalid flags/requests/files emit redacted diagnostics only', t => {
  const f = fixture(t)
  for (const args of [[], ['--input'], ['--input', f.input, '--apply'], ['--input', f.input, '--output', 'secret-output'], ['--input', f.input, '--input', f.input], ['--help', f.input]]) { const r = f.run(args); assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.ok(!r.stderr.includes(f.dir)) }
  assert.equal(f.run(['--help']).status, 0)
  let diagnostic: string | undefined
  for (const text of ['{"private-secret":', JSON.stringify({ ...f.request, extra: 'private-secret' }), ' '.repeat(1024 * 1024 + 1)]) { writeFileSync(f.input, text); const r = f.run(['--input', f.input]); assert.equal(r.status, 2); assert.equal(r.stdout, ''); diagnostic ??= r.stderr; assert.equal(r.stderr, diagnostic); assert.ok(!r.stderr.includes('private-secret')); assert.ok(!r.stderr.includes(f.dir)) }
  writeFileSync(f.input, Buffer.from([0xff, 0xfe])); assert.equal(f.run(['--input', f.input]).stderr, diagnostic)
  for (const name of [f.dir, path.join(f.dir, 'absent')]) assert.equal(f.run(['--input', name]).stderr, diagnostic)
  const link = path.join(f.dir, 'symlink'); symlinkSync(f.input, link); assert.equal(f.run(['--input', link]).status, 2)
})
