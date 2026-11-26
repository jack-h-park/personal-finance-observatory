import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import test from 'node:test'
import { estimateHoldingSale, estimateHoldingSales, type SalePosition } from '@/lib/domain/taxes/holding-sale'
import { estimateKrRecordedStockTax } from '@/lib/domain/taxes/kr-overseas-stock-tax'

const position: SalePosition = {
  id: '1', ticker: 'DEMO', accountLabel: 'Sample · …0001', holdingQuantity: 3.5,
  quote: { date: '2026-11-24', usd: 120 },
  lots: [
    { quantity: 2.25, costUsd: 180, costKrw: 225000, term: 'long' },
    { quantity: 1.25, costUsd: 125, costKrw: 162500, term: 'short' },
  ],
}

test('estimates the actual FIFO sale quantity including a partial lot in both currencies', () => {
  assert.deepEqual(estimateHoldingSale(position, '2.5', 1400), {
    lots: 2, proceedsUsd: 300,
    us: { longUsd: 90, shortUsd: 5 },
    krw: 162500,
  })
  assert.equal(estimateHoldingSale(position, '3.50000001', 1400), null)
  assert.equal(estimateHoldingSale(position, '0', 1400), null)
  assert.equal(estimateHoldingSale(position, '1e-1', 1400), null)
  assert.equal(estimateHoldingSale(position, '3.5', 1400)?.lots, 2)
  assert.equal(estimateHoldingSale({ ...position, holdingQuantity: 3.49999999 }, '3.5', 1400), null)
  assert.equal(estimateHoldingSale({ ...position, holdingQuantity: 3.499999999 }, '3.49999999', 1400)?.lots, 2)
})

test('a missing cost blocks its jurisdiction only when FIFO consumes the lot', () => {
  const withMissing = { ...position, lots: [position.lots[0], { ...position.lots[1], costKrw: 0 }] }
  assert.equal(estimateHoldingSale(withMissing, '2.25', 1400)?.krw, 153000)
  assert.equal(estimateHoldingSale(withMissing, '2.5', 1400)?.krw, null)
  assert.equal(estimateHoldingSale(withMissing, '2.5', 1400)?.us?.shortUsd, 5)
  assert.equal(estimateHoldingSale(position, '2.5', null)?.krw, null)
  assert.equal(estimateHoldingSale({ ...position, quote: null }, '2.5', 1400)?.us, null)
})

test('combines accounts while consuming a repeated position’s FIFO lots only once', () => {
  const other = { ...position, id: '2', holdingQuantity: 1, lots: [
    { quantity: 1, costUsd: 140, costKrw: 188000, term: 'short' as const },
  ] }
  const basket = estimateHoldingSales([position, other], [
    { positionId: '1', quantity: '2' }, { positionId: '2', quantity: '1' }, { positionId: '1', quantity: '0.5' },
  ], 1400)
  assert.deepEqual(basket.rows[2].estimate?.us, { shortUsd: 5, longUsd: 10 })
  assert.deepEqual(basket.us, { shortUsd: -15, longUsd: 90 })
  assert.equal(basket.krw, 142500)
})

test('rounds tax inputs after adding lines so splitting one lot does not change the estimate', () => {
  const split = { ...position, holdingQuantity: 3, quote: { date: '2026-11-24', usd: 1 },
    lots: [{ quantity: 3, costUsd: 2.9856, costKrw: 4198.8, term: 'short' as const }],
  }
  const separate = estimateHoldingSales([split], ['1', '1', '1'].map(quantity => ({ positionId: split.id, quantity })), 1400)
  const single = estimateHoldingSale(split, '3', 1400)
  assert.deepEqual(separate.us, single?.us)
  assert.equal(separate.krw, single?.krw)
  assert.equal(separate.us?.shortUsd, 0.01)
  assert.equal(separate.krw, 1)

  const midpoint = { ...split, holdingQuantity: 1, lots: [{ ...split.lots[0], quantity: 1, costUsd: 1.425 }] }
  const divided = estimateHoldingSales([midpoint], ['0.3', '0.7'].map(quantity => ({ positionId: midpoint.id, quantity })), 1400)
  assert.deepEqual(divided.us, estimateHoldingSale(midpoint, '1', 1400)?.us)
})

test('attributes aggregate balance and missing basis to affected sale lines', () => {
  const lines = [{ positionId: '1', quantity: '2' }, { positionId: '1', quantity: '1.50000001' }]
  const overdraw = estimateHoldingSales([position], lines, 1400)
  assert.deepEqual(overdraw.rows.map(row => row.error), ['balance', 'balance'])
  assert.equal(overdraw.us, null)
  assert.equal(overdraw.krw, null)

  const missing = { ...position, lots: [position.lots[0], { ...position.lots[1], costKrw: null }] }
  const incomplete = estimateHoldingSales([missing], [lines[0], { positionId: '1', quantity: '0.5' }], 1400)
  assert.deepEqual(incomplete.rows.map(row => row.estimate?.missingBasis.kr), [false, true])
  assert.deepEqual(incomplete.us, { shortUsd: 5, longUsd: 90 })
  assert.equal(incomplete.krw, null)
})

test('withholds aggregate results if a sale line is incomplete', () => {
  const basket = estimateHoldingSales([position], [
    { positionId: '1', quantity: '1' }, { positionId: '', quantity: '' }, { positionId: '1', quantity: '0' },
  ], 1400)
  assert.deepEqual(basket.rows.map(row => row.error), [null, 'position', 'quantity'])
  assert.equal(basket.krw, null)
})

test('the Korean scenario applies the annual deduction to both annual totals', () => {
  const estimate = estimateKrRecordedStockTax(2300000, '100000', 2026, 500000)
  assert.equal(estimate.status, 'ready')
  if (estimate.status === 'ready') {
    assert.equal(estimate.baseline.total, 0n)
    assert.equal(estimate.delta.total, 88000n)
  }
})

test('only the current owner’s reconciled brokerage balance can supply sale lots', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'holding-sale-reconcile-'))
  const dbPath = path.join(dir, 'positions.db')
  process.env.STOCK_DB_PATH = dbPath
  const db = new Database(dbPath)
  try {
    db.exec(`
      create table holdings_all (
        market text default 'US', currency text default 'USD', base_currency text default 'KRW',
        brokerage text default 'Broker', account text, ticker text default 'DEMO', quantity real,
        native_price real, current_price real, native_market_value real,
        asset_class text default 'security', account_wrapper text default 'taxable', owner text default 'self'
      );
      create table tax_lots_all (
        id integer primary key, market text default 'US', currency text default 'USD', brokerage text default 'Broker',
        account text, ticker text default 'DEMO', name text default 'Test', acquired_date text, open_quantity real,
        native_cost_basis real default 50, cost_basis_krw real default 60000, acquisition_cost_usd real default 50,
        acquisition_cost_krw real default 60000, fx_rate_to_base real, holding_days integer, tax_term text,
        native_market_value real, native_unrealized_gl real,
        asset_class text default 'security', account_wrapper text default 'taxable', owner text default 'self'
      );
      create table historical_prices (market text, ticker text, currency text, price_date text, close real);
      insert into historical_prices values ('US', 'DEMO', 'USD', '2026-11-24', 120), ('US', 'DEMO', 'USD', '2026-11-27', 999);
      insert into holdings_all (account, quantity, owner) values
        ('123456789111', 1.5, 'self'), ('Mismatch', 2, 'self'), ('Holding only', 1, 'self'), ('Child', 1, 'child:sample');
      insert into tax_lots_all (account, open_quantity, acquired_date, owner) values
        ('123456789111', 1.5, '2025-11-26', 'self'), ('Mismatch', 1, '2025-01-01', 'self'),
        ('Lot only', 1, '2025-01-01', 'self'), ('Child', 1, '2025-01-01', 'child:sample');
    `)
    const { getHoldingsForSale } = await import('@/lib/adapters/portfolio-db')
    const sale = getHoldingsForSale('2026-11-26')
    assert.equal(sale?.unreconciled, 2)
    assert.deepEqual(sale?.positions.map(row => [row.accountLabel, row.holdingQuantity]), [['Broker · …9111', 1.5]])
    const position = sale!.positions[0]
    assert.deepEqual(position.quote, { date: '2026-11-24', usd: 120 })
    assert.equal(position.lots[0].term, 'short')
    assert.equal(getHoldingsForSale('2026-11-27')?.positions[0].lots[0].term, 'long')
    db.exec(`
      insert into holdings_all (account, quantity) values ('New holding', 1);
      insert into tax_lots_all (account, open_quantity, acquired_date) values ('New holding', 1, '2020-01-01');
    `)
    const refreshed = getHoldingsForSale('2026-11-27')
    assert.equal(refreshed?.positions.find(row => row.accountLabel === position.accountLabel)?.id, position.id)
    assert.equal(new Set(refreshed?.positions.map(row => row.id)).size, 2)
  } finally {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
