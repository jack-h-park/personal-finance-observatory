import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

const dir = mkdtempSync(path.join(tmpdir(), 'day-change-adapter-'))

type Holding = { market: string; ticker: string; currency: string; asOf: string; quantity?: number; price?: number; source?: string }
type Close = { market: string; ticker: string; currency: string; date: string; close: number }

function makeDb(name: string, holdings: Holding[], closes: Close[], fx: [string, number][] = []) {
  const file = path.join(dir, name)
  const conn = new Database(file)
  conn.exec(`
    create table holdings (market text, ticker text, name text, currency text, quantity real, native_price real, as_of_date text, fx_rate_to_base real, source_system text);
    create table historical_prices (id integer primary key, market text, ticker text, symbol text, currency text, price_date text, close real, adj_close real, source text);
    create table historical_fx_rates (id integer primary key, price_date text unique, rate real, source text);
  `)
  for (const h of holdings) {
    conn.prepare('insert into holdings values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(h.market, h.ticker, `${h.ticker} Inc`, h.currency, h.quantity ?? 10, h.price ?? 100, h.asOf, h.currency === 'KRW' ? 1 : 1400, h.source ?? 'test')
  }
  for (const c of closes) {
    conn.prepare('insert into historical_prices (market, ticker, symbol, currency, price_date, close, source) values (?, ?, ?, ?, ?, ?, ?)').run(c.market, c.ticker, c.ticker, c.currency, c.date, c.close, 'test')
  }
  for (const [date, rate] of fx) conn.prepare('insert into historical_fx_rates (price_date, rate, source) values (?, ?, ?)').run(date, rate, 'test')
  conn.close()
  return file
}

async function withPaths<T>(paths: { db: string; kr?: string; us?: string; crypto?: string; toss?: string }, run: () => T): Promise<T> {
  const { config } = await import('@/config')
  const saved = { db: config.stockDbPath, kr: config.stockKrPricesPath, us: config.stockUsPricesPath, crypto: config.stockCryptoPricesPath, toss: config.stockTossSnapshotPath }
  config.stockDbPath = paths.db
  config.stockKrPricesPath = paths.kr ?? path.join(dir, 'absent-kr.json')
  config.stockUsPricesPath = paths.us ?? path.join(dir, 'absent-us.json')
  config.stockCryptoPricesPath = paths.crypto ?? path.join(dir, 'absent-crypto.json')
  config.stockTossSnapshotPath = paths.toss ?? path.join(dir, 'absent-toss.json')
  try {
    return run()
  } finally {
    config.stockDbPath = saved.db
    config.stockKrPricesPath = saved.kr
    config.stockUsPricesPath = saved.us
    config.stockCryptoPricesPath = saved.crypto
    config.stockTossSnapshotPath = saved.toss
  }
}

test('a KR row gets the close from the day before its quote date, not two days before', async () => {
  const file = makeDb('kr.db', [{ market: 'KR', ticker: '111111', currency: 'KRW', asOf: '2030-03-12' }], [
    { market: 'KR', ticker: '111111', currency: 'KRW', date: '2030-03-10', close: 90 },
    { market: 'KR', ticker: '111111', currency: 'KRW', date: '2030-03-11', close: 95 },
  ])
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(row.prevClose, 95)
  assert.equal(row.prevCloseDate, '2030-03-11')
  assert.equal(row.quoteDate, '2030-03-12')
  assert.equal(row.price, 100)
})

test('a US holding whose closes are stored under KR in USD still gets its previous close', async () => {
  const file = makeDb('us-under-kr.db', [{ market: 'US', ticker: 'ZZZZ', currency: 'USD', asOf: '2030-03-12' }], [
    { market: 'KR', ticker: 'ZZZZ', currency: 'USD', date: '2030-03-11', close: 50 },
  ])
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(row.prevClose, 50)
})

test('a close dated on the quote date itself is not the previous close', async () => {
  const file = makeDb('same-day.db', [{ market: 'KR', ticker: '111111', currency: 'KRW', asOf: '2030-03-12' }], [
    { market: 'KR', ticker: '111111', currency: 'KRW', date: '2030-03-11', close: 95 },
    { market: 'KR', ticker: '111111', currency: 'KRW', date: '2030-03-12', close: 100 },
  ])
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(row.prevCloseDate, '2030-03-11')
})

test('prevFx is the rate on or before the previous close date', async () => {
  const file = makeDb(
    'fx.db',
    [{ market: 'US', ticker: 'ZZZZ', currency: 'USD', asOf: '2030-03-12' }],
    [{ market: 'US', ticker: 'ZZZZ', currency: 'USD', date: '2030-03-11', close: 50 }],
    [['2030-03-08', 1300], ['2030-03-10', 1310], ['2030-03-12', 1500]]
  )
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(row.prevFx, 1310)
  assert.equal(row.fxNow, 1400)
})

test('the quote date is the price file date when as_of_date is a day ahead of it', async () => {
  const file = makeDb('toss-ahead.db', [{ market: 'US', ticker: 'ZZZZ', currency: 'USD', asOf: '2030-03-13' }], [
    { market: 'US', ticker: 'ZZZZ', currency: 'USD', date: '2030-03-11', close: 50 },
    { market: 'US', ticker: 'ZZZZ', currency: 'USD', date: '2030-03-12', close: 55 },
  ])
  const us = path.join(dir, 'us-prices.json')
  writeFileSync(us, JSON.stringify({ prices: [{ ticker: 'zzzz', price: 60, asOfDate: '2030-03-12' }] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, us }, () => getDayChangeRows())
  assert.equal(row.quoteDate, '2030-03-12')
  assert.equal(row.prevCloseDate, '2030-03-11')
  assert.equal(row.prevClose, 50)
})

test('zero-quantity rows are skipped and a database without the tables gives no rows', async () => {
  const file = makeDb('zero.db', [{ market: 'KR', ticker: '111111', currency: 'KRW', asOf: '2030-03-12', quantity: 0 }], [])
  const empty = path.join(dir, 'empty.db')
  new Database(empty).close()
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  assert.deepEqual(await withPaths({ db: file }, () => getDayChangeRows()), [])
  assert.deepEqual(await withPaths({ db: empty }, () => getDayChangeRows()), [])
})

test('a historical_prices table without a currency column still gives the same-market previous close', async () => {
  const file = path.join(dir, 'sample-schema.db')
  const conn = new Database(file)
  conn.exec(`
    create table holdings (market text, ticker text, name text, currency text, quantity real, native_price real, as_of_date text, fx_rate_to_base real);
    create table historical_prices (id integer primary key, market text, ticker text, price_date text, close real, source text);
    insert into holdings values ('KR', '111111', 'Sample', 'KRW', 5, 100, '2030-03-12', 1);
    insert into historical_prices (market, ticker, price_date, close, source) values ('KR', '111111', '2030-03-11', 95, 'test');
  `)
  conn.close()
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const rows = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(rows.length, 1)
  assert.equal(rows[0].prevClose, 95)
  assert.equal(rows[0].prevFx, null)
})

test('a KRW crypto holding finds no previous close when crypto closes are stored in USD', async () => {
  const file = makeDb('crypto-krw.db', [{ market: 'CRYPTO', ticker: 'QQQC', currency: 'KRW', asOf: '2030-03-12' }], [
    { market: 'CRYPTO', ticker: 'QQQC', currency: 'USD', date: '2030-03-11', close: 50 },
  ])
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const { dayChange } = await import('../lib/day-change')
  const rows = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(rows[0].prevClose, null)
  assert.equal(rows[0].prevCloseDate, null)
  const result = dayChange(rows)
  assert.equal(result.markets.length, 0)
  assert.equal(result.excluded, 1)
})

test('a same-market close in the holding currency wins over a newer close under another market', async () => {
  const file = makeDb('preference.db', [{ market: 'US', ticker: 'ZZZZ', currency: 'USD', asOf: '2030-03-12' }], [
    { market: 'US', ticker: 'ZZZZ', currency: 'USD', date: '2030-03-10', close: 40 },
    { market: 'KR', ticker: 'ZZZZ', currency: 'USD', date: '2030-03-11', close: 50 },
    { market: 'US', ticker: 'ZZZZ', currency: 'KRW', date: '2030-03-11', close: 70000 },
  ])
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file }, () => getDayChangeRows())
  assert.equal(row.prevClose, 40)
  assert.equal(row.prevCloseDate, '2030-03-10')
})

test('a Toss KR row takes both price and date from its price-file entry', async () => {
  const file = makeDb('toss-kr.db', [{ market: 'KR', ticker: '222222', currency: 'KRW', asOf: '2030-03-13', price: 1000, source: 'toss_open_api' }], [
    { market: 'KR', ticker: '222222', currency: 'KRW', date: '2030-03-11', close: 1100 },
    { market: 'KR', ticker: '222222', currency: 'KRW', date: '2030-03-12', close: 1150 },
  ])
  const kr = path.join(dir, 'toss-kr-prices.json')
  writeFileSync(kr, JSON.stringify({ prices: [{ ticker: '222222', price: 1200, currency: 'KRW', asOfDate: '2030-03-12' }] }))
  const toss = path.join(dir, 'toss-kr-snapshot.json')
  writeFileSync(toss, JSON.stringify({ fetchedAt: '2030-03-13T01:00:00Z', accounts: [] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, kr, toss }, () => getDayChangeRows())
  assert.equal(row.price, 1200)
  assert.equal(row.quoteDate, '2030-03-12')
  assert.equal(row.prevCloseDate, '2030-03-11')
  assert.equal(row.prevClose, 1100)
})

test('a Toss-only US row dates its own price by the Toss fetch on the New York clock', async () => {
  const file = makeDb('toss-us.db', [{ market: 'US', ticker: 'TOSO', currency: 'USD', asOf: '2026-11-24', price: 30, source: 'toss_open_api' }], [
    { market: 'US', ticker: 'TOSO', currency: 'USD', date: '2026-11-20', close: 28 },
    { market: 'US', ticker: 'TOSO', currency: 'USD', date: '2026-11-23', close: 29 },
  ])
  const us = path.join(dir, 'toss-us-prices.json')
  writeFileSync(us, JSON.stringify({ prices: [{ ticker: 'OTHR', price: 10, currency: 'USD', asOfDate: '2026-11-23' }] }))
  const toss = path.join(dir, 'toss-us-snapshot.json')
  writeFileSync(toss, JSON.stringify({ fetchedAt: '2026-11-24T02:00:00Z', accounts: [] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, us, toss }, () => getDayChangeRows())
  assert.equal(row.price, 30)
  assert.equal(row.quoteDate, '2026-11-23')
  assert.equal(row.prevCloseDate, '2026-11-20')
  assert.equal(row.prevClose, 28)
})

test('KRW and USD crypto quotes for one ticker each reach their own holding', async () => {
  const file = makeDb(
    'crypto-venues.db',
    [
      { market: 'CRYPTO', ticker: 'QQQC', currency: 'KRW', asOf: '2030-03-10', price: 1 },
      { market: 'CRYPTO', ticker: 'QQQC', currency: 'USD', asOf: '2030-03-10', price: 1 },
    ],
    [{ market: 'CRYPTO', ticker: 'QQQC', currency: 'USD', date: '2030-03-11', close: 50 }]
  )
  const crypto = path.join(dir, 'crypto-prices.json')
  writeFileSync(
    crypto,
    JSON.stringify({
      prices: [
        { venue: 'krw-venue', ticker: 'QQQC', symbol: 'QQQC', price: 70000, currency: 'KRW', asOfDate: '2030-03-12' },
        { venue: 'usd-venue', ticker: 'QQQC', symbol: 'QQQC', price: 52, currency: 'USD', asOfDate: '2030-03-12' },
      ],
    })
  )
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const rows = await withPaths({ db: file, crypto }, () => getDayChangeRows())
  const krw = rows.find((r) => r.currency === 'KRW')!
  const usd = rows.find((r) => r.currency === 'USD')!
  assert.equal(krw.price, 70000)
  assert.equal(krw.quoteDate, '2030-03-12')
  assert.equal(krw.prevClose, null)
  assert.equal(usd.price, 52)
  assert.equal(usd.quoteDate, '2030-03-12')
  assert.equal(usd.prevClose, 50)
})

test('a price-file entry in another currency is not used for the holding', async () => {
  const file = makeDb('currency-mismatch.db', [{ market: 'KR', ticker: '333333', currency: 'USD', asOf: '2030-03-12', price: 5 }], [
    { market: 'KR', ticker: '333333', currency: 'USD', date: '2030-03-11', close: 4 },
  ])
  const kr = path.join(dir, 'mismatch-kr-prices.json')
  writeFileSync(kr, JSON.stringify({ prices: [{ ticker: '333333', price: 7000, currency: 'KRW', asOfDate: '2030-03-13' }] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, kr }, () => getDayChangeRows())
  assert.equal(row.price, 5)
  assert.equal(row.quoteDate, '2030-03-12')
  assert.equal(row.prevClose, 4)
})

test("the price file's previous close wins over a stale daily history", async () => {
  // The history stops two sessions back, as it did for Korean stocks on 2026-11-23.
  const file = makeDb('file-prev.db', [{ market: 'KR', ticker: '333333', currency: 'KRW', asOf: '2030-03-12', price: 1000 }], [
    { market: 'KR', ticker: '333333', currency: 'KRW', date: '2030-03-08', close: 900 },
  ])
  const kr = path.join(dir, 'file-prev-prices.json')
  writeFileSync(kr, JSON.stringify({ prices: [{ ticker: '333333', price: 1200, currency: 'KRW', asOfDate: '2030-03-12', previousClose: 1150, previousCloseDate: '2030-03-11' }] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, kr }, () => getDayChangeRows())
  assert.equal(row.price, 1200)
  assert.equal(row.prevClose, 1150)
  assert.equal(row.prevCloseDate, '2030-03-11')
})

test('a USD row takes the rate on the file previous-close date', async () => {
  const file = makeDb('file-prev-fx.db', [{ market: 'US', ticker: 'FXQ', currency: 'USD', asOf: '2030-03-12', price: 20 }], [], [
    ['2030-03-10', 1300],
    ['2030-03-11', 1350],
  ])
  const us = path.join(dir, 'file-prev-fx-prices.json')
  writeFileSync(us, JSON.stringify({ prices: [{ ticker: 'FXQ', price: 22, currency: 'USD', asOfDate: '2030-03-12', previousClose: 21, previousCloseDate: '2030-03-11' }] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, us }, () => getDayChangeRows())
  assert.equal(row.prevClose, 21)
  assert.equal(row.prevFx, 1350)
})

test('a file previous close dated on or after the quote date is ignored', async () => {
  const file = makeDb('file-prev-bad.db', [{ market: 'KR', ticker: '444444', currency: 'KRW', asOf: '2030-03-12' }], [
    { market: 'KR', ticker: '444444', currency: 'KRW', date: '2030-03-11', close: 95 },
  ])
  const kr = path.join(dir, 'file-prev-bad-prices.json')
  writeFileSync(kr, JSON.stringify({ prices: [{ ticker: '444444', price: 100, currency: 'KRW', asOfDate: '2030-03-12', previousClose: 99, previousCloseDate: '2030-03-12' }] }))
  const { getDayChangeRows } = await import('../lib/adapters/portfolio-db')
  const [row] = await withPaths({ db: file, kr }, () => getDayChangeRows())
  assert.equal(row.prevClose, 95)
  assert.equal(row.prevCloseDate, '2030-03-11')
})
