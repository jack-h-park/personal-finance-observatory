import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const curated = [
  'data/fx-rate-observations.json',
  'data/fx-hana-screenshot-evidence.json',
  'data/fx-transfer-overrides.json',
]
const backupExamples = [
  'data/backups/synthetic-run/fx-ledger.json',
  'data/robinhood-snapshot.json.prev',
  'data/robinhood-snapshot.json.prev.1',
  'data/tax-policy.backup-20000101.json',
  'data/fx-ledger.json.bak',
  'data/fx-ledger.json.bak-20000101',
]

test('private FX inputs and finance backup names stay ignored without hiding examples', () => {
  for (const name of [...curated, ...backupExamples]) {
    assert.equal(spawnSync('git', ['check-ignore', '--no-index', '-q', '--', name], { cwd: root }).status, 0, name)
  }
  for (const name of ['data/fx-rates.example.json', 'data/accounts.local.example.json']) {
    assert.equal(spawnSync('git', ['check-ignore', '--no-index', '-q', '--', name], { cwd: root }).status, 1, name)
  }
})

test('the public index rejects a force-added private FX input or backup', () => {
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'data/'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean)
  const backup = /^data\/(?:backups\/|[^/]+\.(?:prev(?:\.|$)|backup|bak(?:-|$)))/
  const count = tracked.filter(name => curated.includes(name) || backup.test(name)).length
  assert.equal(count, 0, 'The public index contains a protected path. Check the staged paths locally.')
})
