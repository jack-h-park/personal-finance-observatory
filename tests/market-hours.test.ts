// The price-only refresh runs only while a tracked market is open. The clock is read in each
// exchange's own zone, so daylight saving moves the US session on the scheduler's clock and
// nothing has to be edited. Every instant below is a fixed UTC moment.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { anyMarketOpen, marketsOpen } from '../scripts/market-hours.mjs'
import { PRICE_ONLY_STEPS, keepPerKind } from '../scripts/refresh-history.mjs'

const at = (iso: string) => marketsOpen(new Date(iso))

test('the Korean session is open 09:00-15:30 KST on weekdays, with a grace period after the close', () => {
  assert.equal(at('2030-11-04T00:00:00Z').KR, true) // Mon 09:00 KST
  assert.equal(at('2030-11-03T23:59:00Z').KR, false) // Mon 08:59 KST
  assert.equal(at('2030-11-04T06:30:00Z').KR, true) // Mon 15:30 KST, the closing auction just ended
  assert.equal(at('2030-11-04T06:49:00Z').KR, true) // inside the grace period
  assert.equal(at('2030-11-04T06:50:00Z').KR, false) // after it
  assert.equal(at('2030-11-02T01:00:00Z').KR, false) // Saturday 10:00 KST
})

test('the US session follows daylight saving: 09:30 ET is 14:30 UTC in winter and 13:30 UTC in summer', () => {
  assert.equal(at('2030-01-15T14:29:00Z').US, false)
  assert.equal(at('2030-01-15T14:30:00Z').US, true)
  assert.equal(at('2030-07-16T13:29:00Z').US, false)
  assert.equal(at('2030-07-16T13:30:00Z').US, true)
  assert.equal(at('2030-07-16T20:19:00Z').US, true) // 16:19 EDT, inside the grace period
  assert.equal(at('2030-07-16T20:20:00Z').US, false)
})

test('a Sunday evening in the US is Monday morning in Korea', () => {
  const sundayNight = new Date('2030-11-03T17:00:00Z') // Sun 12:00 ET, Mon 02:00 KST
  assert.deepEqual(marketsOpen(sundayNight), { KR: false, US: false })
  const mondayKorea = new Date('2030-11-04T01:00:00Z') // Mon 10:00 KST, Sun 20:00 ET
  assert.deepEqual(marketsOpen(mondayKorea), { KR: true, US: false })
  assert.equal(anyMarketOpen(mondayKorea), true)
  assert.equal(anyMarketOpen(sundayNight), false)
})

test('run history keeps the last runs of each kind, and a record without a kind is a full run', () => {
  const runs = [
    { id: 'p3', kind: 'prices' },
    { id: 'p2', kind: 'prices' },
    { id: 'f2', kind: 'full' },
    { id: 'p1', kind: 'prices' },
    { id: 'f1' },
    { id: 'f0', kind: 'full' },
  ]
  assert.deepEqual(keepPerKind(runs, 2).map((r: { id: string }) => r.id), ['p3', 'p2', 'f2', 'f1'])
  assert.deepEqual(keepPerKind(runs, 10).map((r: { id: string }) => r.id), runs.map((r) => r.id))
})

test('a price-only run fetches prices and ingests, and leaves out the slow extractors and the publishes', () => {
  for (const name of ['fetch:fx', 'fetch:kr-prices', 'fetch:us-prices', 'fetch:crypto-prices', 'fetch:historical-prices', 'ingest']) assert.ok(PRICE_ONLY_STEPS.has(name), name)
  for (const name of PRICE_ONLY_STEPS) assert.ok(/^(fetch|ingest|backfill)/.test(name), name)
  for (const name of ['extract:kr-statements', 'extract:bank-statements', 'fetch:toss', 'publish:kr-sheet', 'publish:us-sheet']) assert.ok(!PRICE_ONLY_STEPS.has(name), name)
})

test('the price-only run marks the historical-prices fetch optional, so a provider miss cannot stop its ingest', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../scripts/refresh.mjs'), 'utf8')
  const priceBlock = source.slice(source.indexOf('if (pricesOnly)'), source.indexOf('const optionalSteps'))
  assert.match(priceBlock, /'fetch:historical-prices'/)
  assert.match(priceBlock, /optional: true/)
})

test('every step a price-only run keeps is a step the full refresh declares', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../scripts/refresh.mjs'), 'utf8')
  const declared = new Set([...source.matchAll(/\{ name: '([a-z:-]+)', args:/g)].map((m) => m[1]))
  for (const name of PRICE_ONLY_STEPS) assert.ok(declared.has(name), `${name} is not a step in scripts/refresh.mjs`)
})
