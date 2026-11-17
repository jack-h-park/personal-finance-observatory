import assert from 'node:assert/strict'
import test from 'node:test'
import type { PortfolioSnapshot } from '../lib/adapters/portfolio-db'
import { isSnapshotStale, snapshotPriceDates } from '../lib/overview-trend'

// Invented dates; the repository is public.

const snapshot = {
  kr_price_date_newest: '2026-11-14',
  kr_price_date_oldest: '2026-11-03',
  us_price_date_newest: '2026-11-13',
  us_price_date_oldest: '2026-11-13',
  crypto_price_date_newest: null,
  crypto_price_date_oldest: null,
} as PortfolioSnapshot

test('the global scope lists every market that has a price date, oldest only when it differs', () => {
  assert.deepEqual(snapshotPriceDates(snapshot, 'global'), [
    { market: 'KR', newest: '2026-11-14', oldest: '2026-11-03' },
    { market: 'US', newest: '2026-11-13', oldest: null },
  ])
})

test('a market scope lists only its own market, and gold or an old row lists none', () => {
  assert.deepEqual(snapshotPriceDates(snapshot, 'US'), [{ market: 'US', newest: '2026-11-13', oldest: null }])
  assert.deepEqual(snapshotPriceDates(snapshot, 'CRYPTO'), [])
  assert.deepEqual(snapshotPriceDates(snapshot, 'GOLD'), [])
  assert.deepEqual(snapshotPriceDates({} as PortfolioSnapshot, 'global'), [])
  assert.deepEqual(snapshotPriceDates(undefined, 'global'), [])
})

test('a snapshot is stale once it is more than 36 hours old', () => {
  const now = Date.parse('2026-11-16T12:00:00.000Z')
  assert.equal(isSnapshotStale('2026-11-15T01:00:00.000Z', now), false)
  assert.equal(isSnapshotStale('2026-11-14T23:00:00.000Z', now), true)
  assert.equal(isSnapshotStale(undefined, now), false)
})
