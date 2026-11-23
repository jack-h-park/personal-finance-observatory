import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { weightChanges, type ChangeRow } from '../lib/weight-changes'

const row = (date: string, market: string, ticker: string, quantity: number, value: number | null): ChangeRow => ({
  date,
  market,
  ticker,
  name: ticker,
  quantity,
  marketValueKrw: value,
})

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('value change splits into trading at the start price and the rest as price', () => {
  // 10 shares at 100 -> 15 shares at 120: trade 5 x 100 = 500, price 15 x 20 = 300.
  const [a] = weightChanges({
    rows: [row('a', 'KR', 'A', 10, 1000), row('b', 'KR', 'A', 15, 1800)],
    from: 'a',
    to: 'b',
    held: [],
    scope: 'all',
  })!.changes
  close(a.tradeKrw, 500)
  close(a.priceKrw, 300)
})

test('a new position is all trading, a sold-out one all trading the other way', () => {
  const changes = weightChanges({
    rows: [row('a', 'KR', 'OLD', 10, 1000), row('a', 'KR', 'KEEP', 10, 1000), row('b', 'KR', 'NEW', 5, 600), row('b', 'KR', 'KEEP', 10, 1400)],
    from: 'a',
    to: 'b',
    held: [],
    scope: 'all',
  })!.changes
  const by = Object.fromEntries(changes.map((c) => [c.ticker, c]))
  close(by.NEW.tradeKrw, 600)
  close(by.NEW.priceKrw, 0)
  close(by.OLD.tradeKrw, -1000)
  close(by.OLD.priceKrw, 0)
  close(by.OLD.startPct, 50)
  close(by.OLD.endPct, 0)
})

test('shares move against each date total, largest move first', () => {
  const changes = weightChanges({
    rows: [row('a', 'KR', 'A', 1, 500), row('a', 'KR', 'B', 1, 500), row('b', 'KR', 'A', 1, 800), row('b', 'KR', 'B', 1, 200)],
    from: 'a',
    to: 'b',
    held: [],
    scope: 'all',
  })!.changes
  assert.deepEqual(changes.map((c) => [c.ticker, c.startPct, c.endPct, c.changePp]), [
    ['A', 50, 80, 30],
    ['B', 50, 20, -30],
  ])
})

test('Toss US rows fold into the US security, and a market scope divides by that market', () => {
  const changes = weightChanges({
    rows: [
      row('a', 'US', 'TSLA', 1, 100),
      row('a', 'KR', 'TSLA', 1, 100),
      row('a', 'KR', '005930', 1, 800),
      row('b', 'US', 'TSLA', 1, 150),
      row('b', 'KR', 'TSLA', 1, 150),
      row('b', 'US', 'NVDA', 1, 300),
    ],
    from: 'a',
    to: 'b',
    held: [{ market: 'US', ticker: 'TSLA' }],
    scope: 'US',
  })!.changes
  const tsla = changes.find((c) => c.key === 'US:TSLA')!
  close(tsla.startValue, 200)
  close(tsla.startPct, 100)
  close(tsla.endPct, 50)
  assert.ok(!changes.some((c) => c.market === 'KR'))
})

test('a security unpriced on either date is left out of both, and reported with its cost share', () => {
  const result = weightChanges({
    rows: [
      { ...row('a', 'KR', 'A1', 1, 500), costKrw: 400 },
      { ...row('a', 'KR', 'BOND1', 1, 100), costKrw: 100 },
      { ...row('b', 'KR', 'A1', 1, 600), costKrw: 400 },
      { ...row('b', 'KR', 'B1', 1, 400), costKrw: 400 },
      { ...row('b', 'KR', 'BOND1', 1, null), costKrw: 200 },
    ],
    from: 'a',
    to: 'b',
    held: [],
    scope: 'all',
  })!
  assert.deepEqual(result.changes.map((c) => [c.ticker, c.startPct, c.endPct]), [
    ['A1', 100, 60],
    ['B1', 0, 40],
  ])
  assert.deepEqual(result.excluded, { count: 1, costPct: 20 })
})

test('a date with nothing priced gives no table', () => {
  assert.equal(weightChanges({ rows: [row('a', 'KR', 'A1', 1, 100), row('b', 'KR', 'A1', 1, null)], from: 'a', to: 'b', held: [], scope: 'all' }), null)
  assert.equal(weightChanges({ rows: [row('a', 'KR', 'A1', 1, 100)], from: 'a', to: 'b', held: [], scope: 'all' }), null)
})
