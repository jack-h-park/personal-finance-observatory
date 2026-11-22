import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

// Invented credits across 2024-2025 at a flat 1,000 KRW/USD.
const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'cash-inflow-scope-')), 'portfolio.db')
const db = new Database(dbPath)
db.exec(`
create table bank_inflows (
  institution text, account text, currency text, date text, amount real, description text,
  counterparty text, category text, rule text, rule_note text, usd_krw_rate real, usd_krw_rate_dated integer
);
create table dividends (
  date text, account text, ticker text, name text, currency text, native_amount real,
  native_tax_withheld real, type text, source_system text, income_category text,
  usd_krw_rate real, usd_krw_rate_dated integer
);
`)
const bank = db.prepare('insert into bank_inflows values (?,?,?,?,?,?,?,?,?,?,?,?)')
const b = (date: string, currency: string, amount: number, category: string) =>
  bank.run('mg', 'Invented Checking', currency, date, amount, 'EXAMPLE', '', category, 'r', 'note', 1000, 1)
b('2024-06-10', 'KRW', 1_000_000, 'salary')
b('2025-01-10', 'KRW', 2_000_000, 'salary')
b('2025-03-10', 'USD', 100, 'salary')
b('2025-05-20', 'KRW', 500, 'interest')
b('2025-06-10', 'KRW', 3_000_000, 'salary')
b('2025-05-01', 'KRW', 777, 'unclassified')
const div = db.prepare('insert into dividends values (?,?,?,?,?,?,?,?,?,?,?,?)')
div.run('2025-02-15', 'Invented Broker', 'AAA', 'Invented Corp', 'KRW', 10_000, 1_540, '배당금입금', 'korea_statement', 'dividend', 1000, 1)
div.run('2025-04-15', 'Invented Broker', 'BBB', 'Invented ETF', 'USD', 20, 3, '외화증권배당금입금', 'korea_statement', 'dividend', 1000, 1)
db.close()

process.env.STOCK_DB_PATH = dbPath
process.env.STOCK_TIME_ZONE = 'Asia/Seoul'
const NOW = new Date('2025-06-15T03:00:00Z')
const LAST_12 = 2_000_000 + 100_000 + 3_000_000 + 8_460 + 20_000 + 500

test('the range sets the window, the average divides by calendar months, and the change compares the window before', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  const r12 = getCashInflow('month', 'KRW', NOW, 'All', { range: '12m' }).totals
  assert.equal(r12.rangeTotal, LAST_12)
  assert.equal(r12.rangeMonths, 12)
  assert.equal(r12.monthlyAverage, LAST_12 / 12)
  // June is the month in progress: the change compares July-May with the year
  // before's July-May, which holds nothing, so it reads as n/a.
  assert.deepEqual([r12.previousTotal, r12.change, r12.changeThrough, r12.changeDriver], [null, null, null, null])
  assert.equal(r12.salary, 5_100_000)
  assert.equal(r12.investment, 28_960)
  assert.equal(r12.investmentShare, 28_960 / LAST_12)

  const ytd = getCashInflow('month', 'KRW', NOW, 'All', { range: 'ytd' }).totals
  // January-May against January-May 2024, which is empty: June 2024 falls with June 2025.
  assert.deepEqual([ytd.rangeTotal, ytd.rangeMonths, ytd.previousTotal], [LAST_12, 6, null])

  const last = getCashInflow('month', 'KRW', NOW, 'All', { range: 'lastYear' })
  assert.deepEqual([last.totals.rangeTotal, last.totals.rangeMonths, last.totals.change], [1_000_000, 12, null])
  assert.deepEqual(last.periods.map((p) => p.period), ['2024-06'])

  const all = getCashInflow('month', 'KRW', NOW, 'All', { range: 'all' }).totals
  assert.deepEqual([all.rangeTotal, all.rangeMonths, all.change], [LAST_12 + 1_000_000, 13, null])
})

test('the change leaves out the month in progress and names the category that moved most', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  // In July, June is whole: July-June against July 2023-June 2024 (1,000,000 salary in 2024-06).
  const july = getCashInflow('month', 'KRW', new Date('2025-07-15T03:00:00Z'), 'All', { range: '12m' }).totals
  assert.equal(july.rangeTotal, LAST_12)
  assert.equal(july.previousTotal, 1_000_000)
  assert.equal(july.change, (LAST_12 - 1_000_000) / 1_000_000)
  assert.equal(july.changeThrough, '2025-06')
  assert.deepEqual(july.changeDriver, { category: 'salary', delta: 5_100_000 - 1_000_000 })

  // Last year ends before the month in progress, so nothing is trimmed, and there is no window before it to hold.
  const last = getCashInflow('month', 'KRW', new Date('2025-07-15T03:00:00Z'), 'All', { range: 'lastYear' }).totals
  assert.equal(last.changeThrough, null)

  // One category has no driver to name.
  const salary = getCashInflow('month', 'KRW', new Date('2025-07-15T03:00:00Z'), 'salary', { range: '12m' }).totals
  assert.equal(salary.changeDriver, null)
  assert.equal(getCashInflow('month', 'KRW', NOW, 'All', { range: '12m' }).currentMonth, '2025-06')
})

test('byCategory carries every category over the range, with its own change on the same whole-month windows', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  const july = getCashInflow('month', 'KRW', new Date('2025-07-15T03:00:00Z'), 'All', { range: '12m' }).totals
  assert.deepEqual(july.byCategory.salary, { amount: 5_100_000, change: (5_100_000 - 1_000_000) / 1_000_000 })
  // Nothing in the window before: an amount, but no change.
  assert.deepEqual(july.byCategory.dividend, { amount: 28_460, change: null })
  // Unclassified is reported, though no total counts it.
  assert.equal(july.byCategory.unclassified.amount, 777)
  // The counted categories add up to the range total under All.
  const counted = (['salary', 'dividend', 'interest', 'other'] as const).reduce((s, c) => s + july.byCategory[c].amount, 0)
  assert.equal(counted, july.rangeTotal)
  // A one-category filter still reports the others.
  const salaryOnly = getCashInflow('month', 'KRW', NOW, 'salary', { range: '12m' }).totals
  assert.equal(salaryOnly.byCategory.interest.amount, 500)
})

test('source and currency narrow every figure; the currency is the credit\'s own', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  const total = (scope: object) => getCashInflow('month', 'KRW', NOW, 'All', { range: '12m', ...scope }).totals.rangeTotal
  assert.equal(total({ source: 'bank' }), 5_100_500)
  assert.equal(total({ source: 'broker' }), 28_460)
  assert.equal(total({ currency: 'USD' }), 120_000)
  assert.equal(total({ currency: 'KRW', source: 'broker' }), 8_460)
})

test('yearly periods carry the previous year\'s total, and a range keeps the years it touches', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  const y = getCashInflow('year', 'KRW', NOW, 'All', { range: 'all' })
  // 2025 is the current year: it meets January-June 2024 (1,000,000 on 2024-06), not all of 2024.
  assert.deepEqual(y.periods.map((p) => [p.period, p.previousTotal, p.previousThrough]), [['2024', null, null], ['2025', 1_000_000, '2024-06']])
  const mayNow = new Date('2025-05-15T03:00:00Z')
  const may = getCashInflow('year', 'KRW', mayNow, 'All', { range: 'all' }).periods.find((p) => p.period === '2025')!
  assert.deepEqual([may.previousTotal, may.previousThrough], [null, '2024-05'])
  assert.deepEqual(getCashInflow('year', 'KRW', NOW, 'All', { range: '12m' }).periods.map((p) => p.period), ['2024', '2025'])
  assert.deepEqual(getCashInflow('year', 'KRW', NOW, 'All', { range: 'lastYear' }).periods.map((p) => p.period), ['2024'])
})

test('dividend detail rows carry ticker, gross and withheld; a Toss foreign dividend adds its 제세금 back', async () => {
  const { getCashInflowRows } = await import('../lib/adapters/portfolio-db')
  const [kr] = getCashInflowRows('2025-02', 'KRW', ['dividend'])
  assert.deepEqual([kr.ticker, kr.gross, kr.withheld, kr.native], ['AAA', 10_000, 1_540, 8_460])
  // Booked net (20) with its 제세금 (3) apart: gross 23, withheld 3, net 20.
  const [toss] = getCashInflowRows('2025-04', 'KRW', ['dividend'])
  assert.deepEqual([toss.gross, toss.withheld, toss.native], [23, 3, 20])
  const [salary] = getCashInflowRows('2025-06', 'KRW', ['salary'])
  assert.deepEqual([salary.ticker, salary.gross, salary.withheld], [null, null, null])
  assert.equal(getCashInflowRows('2025-03', 'KRW', ['salary'], { currency: 'KRW' }).length, 0)
})

test('the header badges count within the chosen source, currency and range', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  const count = (scope: object) => getCashInflow('month', 'KRW', NOW, 'All', scope).unclassifiedCount
  assert.equal(count({}), 1)
  assert.equal(count({ source: 'broker' }), 0) // only bank credits can be unclassified
  assert.equal(count({ currency: 'USD' }), 0)
  assert.equal(count({ range: 'lastYear' }), 0)
})
