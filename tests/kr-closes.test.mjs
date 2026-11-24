import test from 'node:test'
import assert from 'node:assert/strict'
import { coveredKrSession, newestSettledKrSession, previousSessionClose, withSettledLastClose } from '../scripts/settled-bars.mjs'

// Yahoo leaves the newest daily bar's close empty for a while after a Korean
// session ends, while meta already carries the settled price. On 2026-11-23 the
// historical fetch therefore stored no close for most Korean stocks, and the daily
// chart valued them at the previous session's close.
const at = (iso) => Math.floor(Date.parse(iso) / 1000)
const krPeriod = (d) => ({ regular: { start: at(`${d}T00:00:00Z`), end: at(`${d}T06:30:00Z`) } })
const bars = (...pairs) => pairs.map(([price_date, close]) => ({ price_date, close }))

test('fills a settled session with an empty close from the market price', () => {
  // After the bell the period already names the next session.
  const meta = { regularMarketPrice: 102, regularMarketTime: at('2026-11-24T06:30:09Z'), currentTradingPeriod: krPeriod('2026-11-25') }
  const out = withSettledLastClose(bars(['2026-11-23', 100], ['2026-11-24', null]), meta)
  assert.deepEqual(out.map((b) => [b.price_date, b.close]), [['2026-11-23', 100], ['2026-11-24', 102]])
})

test('fills it when the period has not moved on but the last trade is at the bell', () => {
  const meta = { regularMarketPrice: 102, regularMarketTime: at('2026-11-24T06:30:00Z'), currentTradingPeriod: krPeriod('2026-11-24') }
  assert.equal(withSettledLastClose(bars(['2026-11-24', null]), meta)[0].close, 102)
})

test('leaves the close empty while that session is still trading', () => {
  const meta = { regularMarketPrice: 101, regularMarketTime: at('2026-11-24T03:00:00Z'), currentTradingPeriod: krPeriod('2026-11-24') }
  assert.equal(withSettledLastClose(bars(['2026-11-24', null]), meta)[0].close, null)
})

test('leaves the close empty when the market price belongs to another day', () => {
  const meta = { regularMarketPrice: 101, regularMarketTime: at('2026-11-23T06:30:00Z'), currentTradingPeriod: krPeriod('2026-11-25') }
  assert.equal(withSettledLastClose(bars(['2026-11-24', null]), meta)[0].close, null)
})

test('never overwrites a close Yahoo already gave', () => {
  const meta = { regularMarketPrice: 999, regularMarketTime: at('2026-11-24T06:30:00Z'), currentTradingPeriod: krPeriod('2026-11-25') }
  assert.equal(withSettledLastClose(bars(['2026-11-24', 102]), meta)[0].close, 102)
})

test('the previous session close is the last real close before the quote date', () => {
  const series = bars(['2026-11-19', 196], ['2026-11-20', 183], ['2026-11-23', 177], ['2026-11-24', null])
  assert.deepEqual(previousSessionClose(series, '2026-11-24'), { close: 177, date: '2026-11-23' })
  assert.deepEqual(previousSessionClose(series, '2026-11-23'), { close: 183, date: '2026-11-20' })
  assert.equal(previousSessionClose(series, '2026-11-19'), null)
})

test('newest settled Korean session: the bell is 06:30 UTC, weekends walk back', () => {
  assert.equal(newestSettledKrSession(new Date('2026-11-24T05:00:00Z')), '2026-11-23')
  assert.equal(newestSettledKrSession(new Date('2026-11-24T06:31:00Z')), '2026-11-24')
  assert.equal(newestSettledKrSession(new Date('2026-11-23T05:00:00Z')), '2026-11-20')
  assert.equal(newestSettledKrSession(new Date('2026-11-22T12:00:00Z')), '2026-11-20')
})

test('Korean coverage is the session nearly every Korean stock has reached', () => {
  // 2026-11-23: the ETFs had the new close and most stocks did not. A quorum of a
  // few rows read that as covered; most tickers still had to be refetched.
  const krRow = (ticker, price_date) => ({ market: 'KR', currency: 'KRW', ticker, price_date })
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => krRow(`K${i}`, '2026-11-20')),
    ...Array.from({ length: 4 }, (_, i) => krRow(`E${i}`, '2026-11-20')),
    ...Array.from({ length: 4 }, (_, i) => krRow(`E${i}`, '2026-11-23')),
    // A US stock held through a Korean broker: KR market, USD quote. Not a Korean session.
    { market: 'KR', currency: 'USD', ticker: 'NVDA', price_date: '2026-11-23' },
  ]
  assert.equal(coveredKrSession(rows), '2026-11-20')
  const caughtUp = [...rows, ...Array.from({ length: 6 }, (_, i) => krRow(`K${i}`, '2026-11-23'))]
  assert.equal(coveredKrSession(caughtUp), '2026-11-23')
})

test('Korean coverage ignores a ticker that stopped trading long ago', () => {
  const krRow = (ticker, price_date) => ({ market: 'KR', currency: 'KRW', ticker, price_date })
  const rows = [krRow('OLD', '2025-03-31'), ...Array.from({ length: 5 }, (_, i) => krRow(`K${i}`, '2026-11-23'))]
  assert.equal(coveredKrSession(rows), '2026-11-23')
})

test('Korean coverage is empty without Korean rows', () => {
  assert.equal(coveredKrSession([{ market: 'US', currency: 'USD', ticker: 'A', price_date: '2026-11-23' }]), '')
})
