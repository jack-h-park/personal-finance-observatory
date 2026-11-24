// What each input to the total is valued as of, and from where (lib/valuation-basis.ts).
// Every date, price and count below is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildValuationBasis, quoteSession, quoteWindow, securityValuationBasis, sourceText } from '../lib/valuation-basis'
import { quoteSessionAt } from '../scripts/market-hours.mjs'

const HOUR = 60 * 60 * 1000
// Saturday 2030-01-05 03:00 UTC: both stock markets closed, so the 36-hour limit applies.
const SATURDAY = new Date('2030-01-05T03:00:00Z')
// Monday 2030-01-07 04:00 UTC = 13:00 KST: the Korean session has been open four hours.
const KR_MIDDAY = new Date('2030-01-07T04:00:00Z')

const epoch = (iso: string) => Date.parse(iso) / 1000

const krFile = {
  generatedAt: '2030-01-04T07:00:00.000Z',
  source: 'Example quotes API',
  sourceUrl: 'https://quotes.example/{symbol}',
  prices: [
    // 15:30:05 KST on Friday: after the bell, a close.
    { ticker: 'A', exchangeName: 'KSC', asOfDate: '2030-01-04', regularMarketTime: epoch('2030-01-04T06:30:05Z') },
    { ticker: 'B', exchangeName: 'KOE', asOfDate: '2030-01-03', regularMarketTime: epoch('2030-01-03T06:30:01Z'), price: 51000, currency: 'KRW' },
    { ticker: 'C', exchangeName: 'KSC', asOfDate: '2030-01-04', regularMarketTime: epoch('2030-01-04T06:30:02Z') },
  ],
  missing: ['D'],
}

test('quote window is the newest and oldest quote time, from epoch seconds or ISO quotedAt', () => {
  assert.deepEqual(quoteWindow(krFile.prices), { quotedNewest: '2030-01-04T06:30:05.000Z', quotedOldest: '2030-01-03T06:30:01.000Z' })
  assert.deepEqual(quoteWindow([{ quotedAt: '2030-01-05T01:00:00.000Z' }, { quotedAt: 'not a date' }]), {
    quotedNewest: '2030-01-05T01:00:00.000Z',
    quotedOldest: '2030-01-05T01:00:00.000Z',
  })
  assert.deepEqual(quoteWindow(undefined), { quotedNewest: null, quotedOldest: null })
})

test('source text is trimmed, and blank or non-string sources are null', () => {
  assert.equal(sourceText('  Example  '), 'Example')
  assert.equal(sourceText('   '), null)
  assert.equal(sourceText(42), null)
})

test('a quote struck inside the regular session is intraday; at or after the bell it is a close', () => {
  // 12:47 KST on a weekday.
  assert.equal(quoteSessionAt('KR', new Date('2030-01-07T03:47:00Z')), 'open')
  // 15:30 KST exactly is the bell.
  assert.equal(quoteSessionAt('KR', new Date('2030-01-07T06:30:00Z')), 'closed')
  // 16:00 ET exactly, on a weekday in January (EST, UTC-5).
  assert.equal(quoteSessionAt('US', new Date('2030-01-07T21:00:00Z')), 'closed')
  assert.equal(quoteSessionAt('US', new Date('2030-01-07T20:59:00Z')), 'open')
  // A Saturday is never a session.
  assert.equal(quoteSessionAt('US', new Date('2030-01-05T16:00:00Z')), 'closed')
  assert.equal(quoteSession('KR', '2030-01-07T03:47:00.000Z'), 'intraday')
  assert.equal(quoteSession('KR', '2030-01-04T06:30:05.000Z'), 'close')
  assert.equal(quoteSession('KR', null), null)
})

test('a stock market item carries its quote window, session, provider, exchanges and counts', () => {
  const [kr] = buildValuationBasis({ kr: krFile, now: SATURDAY })
  assert.deepEqual(kr, {
    key: 'KR',
    status: 'fresh',
    marketDate: '2030-01-04',
    quotedNewest: '2030-01-04T06:30:05.000Z',
    quotedOldest: '2030-01-03T06:30:01.000Z',
    session: 'close',
    fetchedAt: '2030-01-04T07:00:00.000Z',
    source: 'Example quotes API',
    sourceUrl: 'https://quotes.example/{symbol}',
    exchanges: ['KOE', 'KSC'],
    priced: 3,
    missing: 1,
  })
})

test('stock status follows the session-aware limit: 36 hours when closed, 2 hours once the session settles', () => {
  const fetched = (ms: number) => ({ ...krFile, generatedAt: new Date(ms).toISOString() })
  assert.equal(buildValuationBasis({ kr: fetched(SATURDAY.getTime() - 30 * HOUR), now: SATURDAY })[0].status, 'fresh')
  assert.equal(buildValuationBasis({ kr: fetched(SATURDAY.getTime() - 40 * HOUR), now: SATURDAY })[0].status, 'stale')
  assert.equal(buildValuationBasis({ kr: fetched(KR_MIDDAY.getTime() - 3 * HOUR), now: KR_MIDDAY })[0].status, 'stale')
  assert.equal(buildValuationBasis({ kr: fetched(KR_MIDDAY.getTime() - 1 * HOUR), now: KR_MIDDAY })[0].status, 'fresh')
})

test('a missing or unreadable file is a missing item with nothing else known', () => {
  const [us] = buildValuationBasis({ us: null, now: SATURDAY })
  assert.deepEqual(us, {
    key: 'US',
    status: 'missing',
    marketDate: null,
    quotedNewest: null,
    quotedOldest: null,
    session: null,
    fetchedAt: null,
    source: null,
    sourceUrl: null,
    exchanges: [],
    priced: 0,
    missing: 0,
  })
})

test('only the inputs passed in are described, in a fixed order', () => {
  const keys = buildValuationBasis({ cash: null, fx: null, us: null, kr: null, now: SATURDAY }).map((item) => item.key)
  assert.deepEqual(keys, ['KR', 'US', 'FX', 'CASH'])
})

test('crypto trades continuously: no session, venues as exchanges, stale after 8 hours', () => {
  const crypto = {
    generatedAt: new Date(SATURDAY.getTime() - 9 * HOUR).toISOString(),
    source: 'Venue A ticker API (KRW venues), Example quotes API (USD venues)',
    prices: [
      { venue: 'Venue A', symbol: 'X', asOfDate: '2030-01-04', quotedAt: '2030-01-04T18:00:00.000Z' },
      { venue: 'Venue B', symbol: 'Y', asOfDate: '2030-01-04', quotedAt: '2030-01-04T17:59:00.000Z' },
    ],
  }
  const [item] = buildValuationBasis({ crypto, now: SATURDAY })
  assert.equal(item.status, 'stale')
  assert.equal(item.session, null)
  assert.deepEqual(item.exchanges, ['Venue A', 'Venue B'])
  assert.equal(item.source, 'Venue A ticker API · Example quotes API')
  assert.equal(item.quotedNewest, '2030-01-04T18:00:00.000Z')
})

test('FX carries its rate and is judged on its market date, with a 7-day limit', () => {
  const fx = { generatedAt: '2030-01-04T07:00:00.000Z', rates: [{ from: 'USD', to: 'KRW', rate: 1234.5, asOfDate: '2029-12-27', source: 'Example quotes API' }] }
  const [item] = buildValuationBasis({ fx, now: SATURDAY })
  assert.equal(item.key, 'FX')
  assert.equal(item.value, 1234.5)
  assert.equal(item.marketDate, '2029-12-27')
  assert.equal(item.source, 'Example quotes API')
  assert.equal(item.status, 'stale')
  assert.equal(buildValuationBasis({ fx: { rates: [] }, now: SATURDAY })[0].status, 'missing')
})

test('gold is a daily close, judged on its price date with a 7-day limit', () => {
  const gold = { source: 'Example gold API', fetchedAt: '2030-01-04T08:00:00.000Z', latest: { date: '2030-01-03', price: 99000 } }
  const [item] = buildValuationBasis({ gold, now: SATURDAY })
  assert.equal(item.key, 'GOLD')
  assert.equal(item.status, 'fresh')
  assert.equal(item.session, 'close')
  assert.equal(item.marketDate, '2030-01-03')
  assert.equal(item.value, 99000)
  assert.equal(item.fetchedAt, '2030-01-04T08:00:00.000Z')
})

test('cash balances carry their date range and are not judged fresh or stale here', () => {
  const [item] = buildValuationBasis({ cash: { oldest: '2029-11-01', newest: '2030-01-03', undated: 2 }, now: SATURDAY })
  assert.equal(item.key, 'CASH')
  assert.equal(item.status, null)
  assert.deepEqual(item.cashRange, { oldest: '2029-11-01', newest: '2030-01-03', undated: 2 })
  assert.equal(buildValuationBasis({ cash: null, now: SATURDAY })[0].status, 'missing')
})

test('one security is described by its own quote: time, exchange, price and currency', () => {
  const [item] = securityValuationBasis('KR', krFile, 'B', SATURDAY)
  assert.equal(item.key, 'KR')
  assert.equal(item.marketDate, '2030-01-03')
  assert.equal(item.quotedNewest, '2030-01-03T06:30:01.000Z')
  assert.equal(item.quotedOldest, '2030-01-03T06:30:01.000Z')
  assert.deepEqual(item.exchanges, ['KOE'])
  assert.equal(item.value, 51000)
  assert.equal(item.currency, 'KRW')
  assert.equal(item.priced, 1)
  assert.equal(item.missing, 0)
  assert.equal(item.fetchedAt, krFile.generatedAt)
  assert.equal(item.source, 'Example quotes API')
})

test('a security the price file lists as missing, or does not list at all, carries no quote', () => {
  const [missing] = securityValuationBasis('KR', krFile, 'D', SATURDAY)
  assert.equal(missing.priced, 0)
  assert.equal(missing.missing, 1)
  assert.equal(missing.quotedNewest, null)
  const [absent] = securityValuationBasis('KR', krFile, 'ZZZ', SATURDAY)
  assert.equal(absent.priced, 0)
  assert.equal(absent.missing, 0)
  assert.equal(securityValuationBasis('KR', null, 'A', SATURDAY)[0].status, 'missing')
})
