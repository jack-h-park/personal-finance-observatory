import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { scenario } from './fixtures/finance-preflight'
import { evaluateFinancePreflight } from '../lib/domain/finance-preflight'

const root = path.resolve(import.meta.dirname, '..'), entry = path.join(root, 'scripts/finance-preflight.ts')
const loader = path.join(root, 'node_modules/tsx/dist/loader.mjs')
function fixture(t: TestContext) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'finance-preflight-')))
  t.after(() => rmSync(dir, { force: true, recursive: true }))
  const input = path.join(dir, 'scenario.json')
  return {
    dir, input, write(v: unknown) { writeFileSync(input, JSON.stringify(v)) },
    run(args: string[], preload?: string) { return spawnSync(process.execPath, [...(preload ? ['--import', preload] : []), '--import', loader, entry, ...args], { cwd: dir, encoding: 'utf8', timeout: 15000, env: { ...process.env, TSX_DISABLE_CACHE: '1', TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json'), FINANCE_MODE: 'private', FINANCE_STATE_WRITABLE: '1', STOCK_DATA_DIR: '/nonexistent-private-data' } }) },
  }
}
test('CLI matches deterministic pure receipt, reads only explicit scenario and grants no live authority', t => {
  const f = fixture(t); const x = scenario(); f.write(x)
  const r = f.run(['--input', f.input]); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, '')
  assert.deepEqual(JSON.parse(r.stdout), evaluateFinancePreflight(x)); assert.equal(r.stdout, f.run(['--input', f.input]).stdout)
  assert.equal(JSON.parse(r.stdout).liveVerified, false)
})
test('valid nonmatched scopes exit 1 with a complete private receipt', t => {
  const f = fixture(t); const x = scenario(); x.requestedContracts.push('curated_fx_authority'); f.write(x)
  const r = f.run(['--input', f.input]); assert.equal(r.status, 1, r.stderr); assert.equal(r.stderr, '')
  assert.deepEqual(JSON.parse(r.stdout).results.map((v: { status: string }) => v.status), ['matched', 'unavailable'])
})
test('CLI rejects unknown, duplicate and write flags without echoing private arguments', t => {
  const f = fixture(t); f.write(scenario())
  for (const args of [[], ['--input'], [f.input], ['--input', f.input, '--apply'], ['--input', f.input, '--output', 'private-output'], ['--help', '--input', f.input], ['--input', f.input, '--input', f.input]]) {
    const r = f.run(args); assert.equal(r.status, 2, JSON.stringify(args)); assert.equal(r.stdout, ''); assert.ok(r.stderr); assert.ok(!r.stderr.includes(f.dir)); assert.ok(!r.stderr.includes('private-output'))
  }
  const r = f.run(['--help']); assert.equal(r.status, 0); assert.match(r.stdout, /provided observations/i); assert.match(r.stdout, /not.*live/i)
})
test('CLI invalid files and contracts have fixed redacted errors and no result', t => {
  const f = fixture(t)
  const values = ['{"private-secret":', JSON.stringify({ ...scenario(), privateSecret: 'private-secret' }), ' '.repeat(1024 * 1024 + 1), JSON.stringify({ ...scenario(), requestedContracts: ['unknown'] })]
  let diagnostic: string | undefined
  for (const text of values) {
    writeFileSync(f.input, text); const r = f.run(['--input', f.input]); assert.equal(r.status, 2); assert.equal(r.stdout, '')
    diagnostic ??= r.stderr; assert.equal(r.stderr, diagnostic); assert.ok(!r.stderr.includes('private-secret')); assert.ok(!r.stderr.includes(f.dir))
  }
  writeFileSync(f.input, Buffer.from([0xff, 0xfe, 0xfd])); assert.equal(f.run(['--input', f.input]).stderr, diagnostic)
  for (const name of [f.dir, path.join(f.dir, 'absent')]) { const r = f.run(['--input', name]); assert.equal(r.status, 2); assert.equal(r.stdout, ''); assert.equal(r.stderr, diagnostic) }
  f.write(scenario()); const link = path.join(f.dir, 'symlink.json'); symlinkSync(f.input, link)
  assert.equal(f.run(['--input', link]).status, 2)
  if (process.platform !== 'win32') { const fifo = path.join(f.dir, 'input.pipe'); assert.equal(spawnSync('mkfifo', [fifo]).status, 0); const r = f.run(['--input', fifo]); assert.equal(r.status, 2); assert.equal(r.signal, null) }
})
test('input, environment and files stay unchanged even with private write flag enabled', t => {
  const f = fixture(t); f.write(scenario()); const envFile = path.join(f.dir, '.env.local'); writeFileSync(envFile, 'PRIVATE_TOKEN=must-not-load\n')
  const original = readFileSync(f.input), stamp = statSync(f.input).mtimeMs
  const preload = path.join(f.dir, 'deny-side-effects.mjs')
  writeFileSync(preload, `
import fs from 'node:fs'; import net from 'node:net'; import http from 'node:http'; import https from 'node:https'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
const deny=()=>{throw Error('forbidden-side-effect')};
for(const key of ['writeFileSync','appendFileSync','mkdirSync','renameSync','rmSync','unlinkSync','chmodSync'])fs[key]=deny;
for(const key of ['writeFile','appendFile','mkdir','rename','rm','unlink','chmod'])fs[key]=deny;
for(const key of ['writeFile','appendFile','mkdir','rename','rm','unlink','chmod'])fs.promises[key]=deny;
const read=fs.readFileSync;fs.readFileSync=function(p,...args){if(String(p).endsWith('.env.local')||String(p).startsWith('/synthetic/records'))deny();return read.call(this,p,...args)};
net.connect=deny;net.createConnection=deny;http.request=deny;https.request=deny;cp.spawnSync=deny;cp.execSync=deny;
syncBuiltinESMExports();
`)
  const names = readdirSync(f.dir).sort(); const r = f.run(['--input', f.input], preload)
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); assert.deepEqual(readFileSync(f.input), original)
  assert.equal(statSync(f.input).mtimeMs, stamp); assert.equal(readFileSync(envFile, 'utf8'), 'PRIVATE_TOKEN=must-not-load\n'); assert.deepEqual(readdirSync(f.dir).sort(), names)
})
