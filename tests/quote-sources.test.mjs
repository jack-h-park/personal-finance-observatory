import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseQuote, divergent, inRegularSession, marketDate, mergeQuotes } from '../scripts/quote-sources.mjs'

const ms = (iso) => Date.parse(iso)

test('the Korean regular session is 09:00-15:30 KST on weekdays, bell included', () => {
  assert.equal(inRegularSession(ms('2030-03-12T09:00:00+09:00'), 'KR'), true)
  assert.equal(inRegularSession(ms('2030-03-12T15:30:00+09:00'), 'KR'), true)
  assert.equal(inRegularSession(ms('2030-03-12T15:31:00+09:00'), 'KR'), false, 'NXT after-hours')
  assert.equal(inRegularSession(ms('2030-03-12T08:30:00+09:00'), 'KR'), false, 'NXT pre-market')
  assert.equal(inRegularSession(ms('2030-03-16T10:00:00+09:00'), 'KR'), false, 'Saturday')
})

test('the US regular session follows New York time across daylight saving', () => {
  assert.equal(inRegularSession(ms('2030-01-15T14:30:00Z'), 'US'), true, '09:30 EST')
  assert.equal(inRegularSession(ms('2030-07-15T13:30:00Z'), 'US'), true, '09:30 EDT')
  assert.equal(inRegularSession(ms('2030-07-15T20:30:00Z'), 'US'), false, '16:30 EDT, after hours')
})

test('Toss wins inside the session when it is newer than Yahoo', () => {
  const yahoo = { price: 100, atMs: ms('2030-03-12T10:40:00+09:00') }
  const toss = { price: 101, quotedAt: '2030-03-12T11:00:00+09:00' }
  const quote = chooseQuote('KR', yahoo, toss)
  assert.equal(quote.source, 'toss')
  assert.equal(quote.price, 101)
  assert.equal(quote.alternate.source, 'yahoo')
})

test('after the bell an NXT trade does not replace the KRX close', () => {
  const yahoo = { price: 100, atMs: ms('2030-03-12T15:30:09+09:00') }
  const toss = { price: 96, quotedAt: '2030-03-12T19:59:59+09:00' }
  assert.equal(chooseQuote('KR', yahoo, toss).source, 'yahoo')
})

test('a stock without NXT trading keeps the KRX close, not its last regular trade', () => {
  const yahoo = { price: 100, atMs: ms('2030-03-12T15:30:09+09:00') }
  const toss = { price: 99, quotedAt: '2030-03-12T15:19:24+09:00' }
  assert.equal(chooseQuote('KR', yahoo, toss).source, 'yahoo')
})

test('a Toss quote alone is kept only inside the session', () => {
  assert.equal(chooseQuote('US', null, { price: 10, quotedAt: '2030-03-12T15:00:00Z' }).source, 'toss', '11:00 EDT')
  assert.equal(chooseQuote('US', null, { price: 10, quotedAt: '2030-03-12T21:00:00Z' }), null, '17:00 EDT is after hours')
  assert.equal(chooseQuote('US', { price: 10, atMs: ms('2030-03-12T21:00:00Z') }, null).source, 'yahoo')
  assert.equal(chooseQuote('US', null, null), null)
})

test('a Yahoo price without a time is still kept', () => {
  const quote = chooseQuote('KR', { price: 100, atMs: NaN }, null)
  assert.equal(quote.source, 'yahoo')
  assert.equal(quote.price, 100)
})

test("Yahoo's trading period decides a half day", () => {
  // The day after Thanksgiving closes at 13:00 ET; 14:10 is after hours.
  const period = { start: ms('2030-11-29T14:30:00Z') / 1000, end: ms('2030-11-29T18:00:00Z') / 1000 }
  const yahoo = { price: 100, atMs: ms('2030-11-29T18:00:00Z'), period }
  assert.equal(chooseQuote('US', yahoo, { price: 99, quotedAt: '2030-11-29T19:10:00Z' }).source, 'yahoo')
  assert.equal(inRegularSession(ms('2030-11-29T19:10:00Z'), 'US'), true, 'the fixed table alone would have let it in')
  assert.equal(inRegularSession(ms('2030-11-29T19:10:00Z'), 'US', period), false)
})

test('the bell minute counts only up to the bell second', () => {
  assert.equal(inRegularSession(ms('2030-03-12T15:30:00+09:00'), 'KR'), true)
  assert.equal(inRegularSession(ms('2030-03-12T15:30:01+09:00'), 'KR'), false)
})

test('a Toss quote outside the session stays as the alternate for reference', () => {
  const quote = chooseQuote('KR', { price: 100, atMs: ms('2030-03-12T15:30:09+09:00') }, { price: 96, quotedAt: '2030-03-12T19:59:59+09:00' })
  assert.equal(quote.source, 'yahoo')
  assert.equal(quote.alternate.price, 96)
})

test('divergence is reported only when both quotes are inside the session', () => {
  const inside = chooseQuote('KR', { price: 100, atMs: ms('2030-03-12T10:40:00+09:00') }, { price: 104, quotedAt: '2030-03-12T11:00:00+09:00' })
  assert.equal(divergent('KR', inside), true)
  const close = chooseQuote('KR', { price: 100, atMs: ms('2030-03-12T10:40:00+09:00') }, { price: 101, quotedAt: '2030-03-12T11:00:00+09:00' })
  assert.equal(divergent('KR', close), false)
  const afterHours = chooseQuote('KR', { price: 100, atMs: ms('2030-03-12T15:30:09+09:00') }, { price: 90, quotedAt: '2030-03-12T19:59:59+09:00' })
  assert.equal(divergent('KR', afterHours), false)
})

test('the market date is on the exchange clock', () => {
  assert.equal(marketDate(ms('2030-03-12T02:00:00Z'), 'US'), '2030-03-11')
  assert.equal(marketDate(ms('2030-03-12T02:00:00Z'), 'KR'), '2030-03-12')
})

function chartFor(days, closes, meta = {}) {
  const result = { timestamp: days.map((d) => ms(`${d}T00:00:00Z`) / 1000), indicators: { quote: [{ close: closes }] }, meta }
  return result
}

test('merge keeps the Toss quote in session and measures the previous close against its date', () => {
  // 09:05 KST: Yahoo still shows yesterday's close; Toss already has today's trades.
  const entry = { ticker: '111111', symbol: '111111.KS', currency: 'KRW', price: 95, regularMarketTime: ms('2030-03-11T15:30:00+09:00') / 1000 }
  Object.defineProperty(entry, 'chart', { value: chartFor(['2030-03-10', '2030-03-11'], [90, 95]), enumerable: false })
  const { prices, divergent: flagged } = mergeQuotes({
    market: 'KR',
    yahooEntries: [entry],
    tossPrices: new Map([['111111', { price: 99, quotedAt: '2030-03-12T09:05:00+09:00', currency: 'KRW' }]]),
    tickers: ['111111'],
    currency: 'KRW',
  })
  assert.equal(prices.length, 1)
  assert.equal(prices[0].source, 'toss')
  assert.equal(prices[0].price, 99)
  assert.equal(prices[0].asOfDate, '2030-03-12')
  assert.equal(prices[0].previousClose, 95)
  assert.equal(prices[0].previousCloseDate, '2030-03-11')
  assert.equal(prices[0].alternate.source, 'yahoo')
  assert.equal('chart' in JSON.parse(JSON.stringify(prices[0])), false, 'the chart result is not written to the file')
  assert.equal(flagged.length, 0, 'Yahoo is outside the session, so nothing to compare')
})

test('merge skips a Toss quote in another currency and keeps tickers Yahoo missed', () => {
  const { prices } = mergeQuotes({
    market: 'US',
    yahooEntries: [],
    tossPrices: new Map([['AAA', { price: 10, quotedAt: '2030-03-12T15:00:00Z', currency: 'USD' }], ['BBB', { price: 10, quotedAt: '2030-03-12T15:00:00Z', currency: 'KRW' }]]),
    tickers: ['AAA', 'BBB'],
    currency: 'USD',
  })
  assert.deepEqual(prices.map((p) => [p.ticker, p.source, p.previousClose]), [['AAA', 'toss', null]])
})
