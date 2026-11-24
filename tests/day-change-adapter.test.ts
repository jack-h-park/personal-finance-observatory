import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

const dir = mkdtempSync(path.join(tmpdir(), 'day-change-adapter-'))

type Holding = { market: string; ticker: string; currency: string; asOf: string; quantity?: number }
type Close = { market: string; ticker: string; currency: string; date: string; close: number }

function makeDb(name: string, holdings: Holding[], closes: Close[], fx: [string, number][] = []) {
  const file = path.join(dir, name)
  const conn = new Database(file)
  conn.exec(`
    create table holdings (market text, ticker text, name text, currency text, quantity real, native_price real, as_of_date text, fx_rate_to_base real);
    create table historical_prices (id integer primary key, market text, ticker text, symbol text, currency text, price_date text, close real, adj_close real, source text);
    create table historical_fx_rates (id integer primary key, price_date text unique, rate real, source text);
  `)
  for (const h of holdings) {
    conn.prepare('insert into holdings values (?, ?, ?, ?, ?, ?, ?, ?)').run(h.market, h.ticker, `${h.ticker} Inc`, h.currency, h.quantity ?? 10, 100, h.asOf, h.currency === 'KRW' ? 1 : 1400)
  }
  for (const c of closes) {
    conn.prepare('insert into historical_prices (market, ticker, symbol, currency, price_date, close, source) values (?, ?, ?, ?, ?, ?, ?)').run(c.market, c.ticker, c.ticker, c.currency, c.date, c.close, 'test')
  }
  for (const [date, rate] of fx) conn.prepare('insert into historical_fx_rates (price_date, rate, source) values (?, ?, ?)').run(date, rate, 'test')
  conn.close()
  return file
}

async function withPaths<T>(paths: { db: string; kr?: string; us?: string; crypto?: string }, run: () => T): Promise<T> {
  const { config } = await import('@/config')
  const saved = { db: config.stockDbPath, kr: config.stockKrPricesPath, us: config.stockUsPricesPath, crypto: config.stockCryptoPricesPath }
  config.stockDbPath = paths.db
  config.stockKrPricesPath = paths.kr ?? path.join(dir, 'absent-kr.json')
  config.stockUsPricesPath = paths.us ?? path.join(dir, 'absent-us.json')
  config.stockCryptoPricesPath = paths.crypto ?? path.join(dir, 'absent-crypto.json')
  try {
    return run()
  } finally {
    config.stockDbPath = saved.db
    config.stockKrPricesPath = saved.kr
    config.stockUsPricesPath = saved.us
    config.stockCryptoPricesPath = saved.crypto
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
