import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getPageCopy } from '../lib/ui-copy'

// Every transaction type the ingest can write must have a label, or the
// position detail page shows the raw code (INTERNAL_TRANSFER did, in both languages).
test('position detail labels every transaction type the ingest writes', () => {
  const ingest = readFileSync(new URL('../scripts/ingest-stock-data.mjs', import.meta.url), 'utf8')
  const types = new Set([...ingest.matchAll(/return '([A-Z][A-Z_]{2,})'/g)].map((m) => m[1]))
  assert.ok(types.has('INTERNAL_TRANSFER'))
  for (const language of ['en', 'ko'] as const) {
    const labels = getPageCopy('positionDetail', language).transactionTypes
    const missing = [...types].filter((type) => !Object.hasOwn(labels, type))
    assert.deepEqual(missing, [], `${language} is missing labels`)
  }
})

test('source usages read in the page language', () => {
  const ko = getPageCopy('positionDetail', 'ko').sourceUsages
  for (const usage of ['snapshot', 'tax lots', 'transactions', 'dividends']) assert.match(ko[usage], /[가-힣]/)
})
