import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'

import { measuredDates, periodChangeView } from '@/app/holdings/period-change-view'
import { config } from '@/config'
import { portfolioToday } from '@/lib/adapters/portfolio-db'
import { monthsBack } from '@/lib/calendar-dates.mjs'

test('fewer than two measured dates cannot be measured', () => {
  assert.equal(measuredDates(['2030-01-01'], [{ date: '2030-01-01' }]), null)
  assert.equal(measuredDates(['2030-01-01', '2030-01-02'], [{ date: '2030-01-01' }]), null)
  assert.equal(measuredDates([], []), null)
})

test('dates without position rows are skipped, two or more are kept', () => {
  const rows = [{ date: '2030-01-01' }, { date: '2030-01-03' }]
  assert.deepEqual(measuredDates(['2030-01-01', '2030-01-02', '2030-01-03'], rows), ['2030-01-01', '2030-01-03'])
})


test('long-period views use the latest snapshot, priced anchors, and monthly chart intervals', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'holdings-long-period-'))
  const file = path.join(directory, 'fixture.db')
  const db = new Database(file)
  const previousFile = config.stockDbPath
  config.stockDbPath = file
  try {
    const latest = monthsBack(`${portfolioToday().slice(0, 7)}-15`, 1)
    const exact2 = monthsBack(latest, 24)
    const exact3 = monthsBack(latest, 36)
    const priorMonthEnd = new Date(`${exact3.slice(0, 7)}-01T00:00:00Z`)
    priorMonthEnd.setUTCDate(0)
    const fallback3 = priorMonthEnd.toISOString().slice(0, 10)
    const monthEnd = new Date(`${latest.slice(0, 7)}-01T00:00:00Z`)
    monthEnd.setUTCDate(0)
    const recentMonthEnd = monthEnd.toISOString().slice(0, 10)
    const weekday = `${latest.slice(0, 7)}-04`
    db.exec(`
      create table portfolio_snapshots (snapshot_date text primary key);
      create table position_snapshots (snapshot_date text, market text, ticker text, name text, quantity real, cost_krw real, market_value_krw real);
      create table long_period_position_snapshots as select * from position_snapshots where 0;
      create table holdings (market text, ticker text, name text, currency text, quantity real, native_price real, as_of_date text, fx_rate_to_base real);
      create table historical_prices (market text, ticker text, currency text, price_date text, close real);
    `)
    const insertDate = db.prepare('insert into portfolio_snapshots values (?)')
    const insertPosition = db.prepare("insert into position_snapshots values (?, 'KR', 'TESTLONG', 'Sample', 1, 100, ?)")
    for (const [date, value] of [[recentMonthEnd, 120], [weekday, 160], [latest, 140]] as const) {
      insertDate.run(date)
      insertPosition.run(date, value)
    }
    const insertReference = db.prepare("insert into long_period_position_snapshots values (?, 'KR', 'TESTLONG', 'Sample', 1, 100, ?)")
    for (const [date, value] of [[fallback3, 90], [exact3, null], [exact2, 110]] as const) insertReference.run(date, value)
    db.prepare("insert into holdings values ('KR', 'TESTLONG', 'Sample', 'KRW', 2, 140, ?, 1)").run(latest)
    const insertClose = db.prepare("insert into historical_prices values ('KR', 'TESTLONG', 'KRW', ?, ?)")
    insertClose.run(fallback3, 90)
    insertClose.run(exact3, 95)
    insertClose.run(exact2, 110)

    const two = periodChangeView('2y', 'actual', [])
    assert.equal(two.kind, 'actual')
    assert.equal(two.requestedStart, exact2)
    assert.equal(two.summary.from, exact2)
    assert.equal(two.summary.to, latest)
    assert.equal(two.summary.marketEffect, 30)
    assert.deepEqual(two.cumulative, [
      { date: exact2, total: 0 },
      { date: recentMonthEnd, total: 10 },
      { date: latest, total: 30 },
    ])

    const three = periodChangeView('3y', 'actual', [])
    assert.equal(three.kind, 'actual')
    assert.equal(three.requestedStart, exact3)
    assert.equal(three.summary.from, fallback3)
    assert.deepEqual(three.cumulative.map(({ date }) => date), [fallback3, recentMonthEnd, latest])

    const held = periodChangeView('3y', 'held', [])
    assert.equal(held.kind, 'held')
    assert.equal(held.from, fallback3)
    assert.equal(held.requestedStart, exact3)
    assert.equal(held.change.total?.changeKrw, 100)

    db.prepare('delete from long_period_position_snapshots where snapshot_date = ?').run(fallback3)
    assert.deepEqual(periodChangeView('3y', 'actual', []), { kind: 'empty' })
  } finally {
    config.stockDbPath = previousFile
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
