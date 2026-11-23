// A stock price may be 36 hours old outside a session, so a weekend passes; once a market has
// been open for 90 minutes it may be two hours old, because the half-hourly price job should
// have refreshed it. Every instant below is a fixed UTC moment.
import assert from 'node:assert/strict'
import test from 'node:test'
import { isSnapshotStale } from '../lib/overview-trend'
import { PRICE_STALE_BASE_MS, PRICE_STALE_SESSION_MS, anyPriceStaleAfterMs, priceStaleAfterMs } from '../lib/price-staleness'

const HOUR = 60 * 60 * 1000

test('outside a session the limit is 36 hours', () => {
  assert.equal(priceStaleAfterMs('KR', new Date('2030-11-02T01:00:00Z')), PRICE_STALE_BASE_MS) // Saturday
  assert.equal(priceStaleAfterMs('US', new Date('2030-11-04T12:00:00Z')), PRICE_STALE_BASE_MS) // Mon 07:00 ET, before the open
  assert.equal(priceStaleAfterMs('KR', new Date('2030-11-04T08:00:00Z')), PRICE_STALE_BASE_MS) // Mon 17:00 KST, after the close
})

test('a session gets the two-hour limit only after it has been open for 90 minutes', () => {
  assert.equal(priceStaleAfterMs('KR', new Date('2030-11-04T00:00:00Z')), PRICE_STALE_BASE_MS) // 09:00 KST, just opened
  assert.equal(priceStaleAfterMs('KR', new Date('2030-11-04T01:29:00Z')), PRICE_STALE_BASE_MS) // 10:29, 89 minutes in
  assert.equal(priceStaleAfterMs('KR', new Date('2030-11-04T01:30:00Z')), PRICE_STALE_SESSION_MS) // 10:30, 90 minutes in
  assert.equal(priceStaleAfterMs('KR', new Date('2030-11-04T06:40:00Z')), PRICE_STALE_SESSION_MS) // 15:40, grace period after the close
})

test('the US session follows daylight saving', () => {
  // 11:00 ET: 16:00 UTC in winter, 15:00 UTC in summer.
  assert.equal(priceStaleAfterMs('US', new Date('2030-01-15T16:00:00Z')), PRICE_STALE_SESSION_MS)
  assert.equal(priceStaleAfterMs('US', new Date('2030-01-15T15:00:00Z')), PRICE_STALE_BASE_MS)
  assert.equal(priceStaleAfterMs('US', new Date('2030-07-16T15:00:00Z')), PRICE_STALE_SESSION_MS)
})

test('a figure that mixes the markets uses the tighter limit', () => {
  // Mon 11:00 KST (KR open for two hours), the US closed.
  assert.equal(anyPriceStaleAfterMs(new Date('2030-11-04T02:00:00Z')), PRICE_STALE_SESSION_MS)
  assert.equal(anyPriceStaleAfterMs(new Date('2030-11-02T02:00:00Z')), PRICE_STALE_BASE_MS)
})

test('a snapshot written three hours ago is stale in a settled session and fine at a weekend', () => {
  const session = Date.parse('2030-11-04T02:00:00Z') // Mon 11:00 KST
  assert.equal(isSnapshotStale(new Date(session - 3 * HOUR).toISOString(), session), true)
  assert.equal(isSnapshotStale(new Date(session - 1 * HOUR).toISOString(), session), false)
  const weekend = Date.parse('2030-11-02T02:00:00Z') // Saturday
  assert.equal(isSnapshotStale(new Date(weekend - 30 * HOUR).toISOString(), weekend), false)
  assert.equal(isSnapshotStale(new Date(weekend - 37 * HOUR).toISOString(), weekend), true)
})
