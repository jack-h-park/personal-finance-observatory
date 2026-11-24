// The price-refresh wrapper speaks when two runs in a row failed, once, and once when it recovers;
// a run that did nothing (no market open, or a full refresh holding the lock) changes nothing.
// A throwaway repo supplies a `refresh:prices` script whose output and exit code the test sets.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const WRAPPER = path.resolve(import.meta.dirname, '../deploy/hermes/observatory-price-refresh-cron.sh')

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-cron-'))
  const repo = path.join(dir, 'repo')
  fs.mkdirSync(repo)
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ name: 'x', scripts: { 'refresh:prices': `sh -c 'cat "${dir}/out"; exit $(cat "${dir}/rc")' --` } })
  )
  const run = (output: string, rc: number) => {
    fs.writeFileSync(path.join(dir, 'out'), `${output}\n`)
    fs.writeFileSync(path.join(dir, 'rc'), String(rc))
    // HOME stays the real one: a developer's `pnpm` can be a shim that finds node through $HOME,
    // and pointing HOME at the temp dir makes every `pnpm refresh:prices` exit 126. The repo and
    // state paths are pinned below, so the wrapper writes nothing under the real HOME.
    const result = spawnSync('bash', [WRAPPER], {
      encoding: 'utf8',
      env: { ...process.env, OBSERVATORY_REPO: repo, OBSERVATORY_PRICE_REFRESH_STATE: path.join(dir, 'state') },
    })
    return { stdout: result.stdout.trim(), status: result.status }
  }
  return { dir, repo, run, state: () => (fs.existsSync(path.join(dir, 'state')) ? fs.readFileSync(path.join(dir, 'state'), 'utf8').trim() : null) }
}

test('a success is silent, one failure is silent, the second in a row speaks once, and recovery speaks once', () => {
  const h = harness()
  try {
    assert.deepEqual(h.run('== fetch:fx ==\nok', 0), { stdout: '', status: 0 })
    assert.equal(h.state(), 'ok')
    assert.equal(h.run('== fetch:kr-prices ==\nerror: HTTP 429', 1).stdout, '')
    assert.equal(h.state(), 'fail:1:0')
    const second = h.run('== fetch:kr-prices ==\nerror: HTTP 429', 1).stdout
    assert.match(second, /failed twice in a row at fetch:kr-prices/)
    assert.equal(h.state(), 'fail:2:1')
    assert.equal(h.run('== fetch:kr-prices ==\nerror: HTTP 429', 1).stdout, '')
    assert.equal(h.state(), 'fail:3:1')
    assert.match(h.run('== ingest ==\nok', 0).stdout, /recovered/)
    assert.equal(h.state(), 'ok')
    assert.equal(h.run('== ingest ==\nok', 0).stdout, '')
  } finally {
    fs.rmSync(h.dir, { recursive: true, force: true })
  }
})

test('a run that did nothing leaves the state and the log alone', () => {
  const h = harness()
  try {
    h.run('error: boom', 1)
    assert.equal(h.state(), 'fail:1:0')
    const log = path.join(h.repo, 'logs', 'refresh-prices-cron.log')
    const before = fs.readFileSync(log, 'utf8')
    h.run('[refresh] no tracked market is open (KR closed, US closed); skipping this price run', 0)
    h.run('[refresh] another refresh is already running (pid 1); skipping this run', 0)
    assert.equal(h.state(), 'fail:1:0')
    assert.equal(fs.readFileSync(log, 'utf8'), before)
  } finally {
    fs.rmSync(h.dir, { recursive: true, force: true })
  }
})
