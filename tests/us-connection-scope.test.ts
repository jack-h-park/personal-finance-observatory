import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readUsConnectionScope } from '@/lib/adapters/us-connection-scope'

test('US connection scope reads reviewed product keys and leaves missing or invalid records unconfirmed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'connection-scope-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'us-connection-scope.json')
  const valid = { schemaVersion: 1, reviewedOn: '2026-01-01', snaptrade: ['fidelity'], simplefin: [] }

  assert.equal(readUsConnectionScope(dir), null)
  writeFileSync(file, JSON.stringify(valid))
  assert.deepEqual(readUsConnectionScope(dir), {
    reviewedOn: '2026-01-01', snaptrade: ['Fidelity Brokerage'], simplefin: [],
  })
  for (const invalid of [
    { ...valid, simplefin: ['fidelity'] },
    { ...valid, snaptrade: ['fidelity', 'fidelity'] },
    { ...valid, reviewedOn: '2026-02-30' },
    { ...valid, schemaVersion: 2 },
  ]) {
    writeFileSync(file, JSON.stringify(invalid))
    assert.equal(readUsConnectionScope(dir), null)
  }
  writeFileSync(file, '{')
  assert.equal(readUsConnectionScope(dir), null)
})
