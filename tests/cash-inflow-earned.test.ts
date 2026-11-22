import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

// One invented month (2025-03) with salary, bonus and an expense payout beside
// interest, other and a reimbursement, at a flat 1,000 KRW/USD.
const dbPath = path.join(mkdtempSync(path.join(tmpdir(), 'cash-inflow-earned-')), 'portfolio.db')
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
bank.run('mg', 'Invented Checking', 'KRW', '2025-03-21', 3_000_000, 'EXAMPLE PAYROLL', '', 'salary', 'salary', 'Payroll', 1000, 1)
bank.run('mg', 'Invented Checking', 'KRW', '2025-03-22', 1_000_000, 'EXAMPLE INCENTIVE', '', 'bonus', 'bonus', 'Incentive', 1000, 1)
bank.run('toss', 'Invented Expense', 'KRW', '2025-03-23', 200_000, 'EXAMPLE EMPLOYER', 'EXAMPLE EMPLOYER', 'expense', 'expense', 'Expense payout', 1000, 1)
bank.run('mg', 'Invented Checking', 'KRW', '2025-03-26', 2_000, '이자 지급', '', 'interest', null, null, 1000, 1)
bank.run('mg', 'Invented Checking', 'KRW', '2025-03-27', 50_000, 'EXAMPLE REFUND', '', 'other', 'refund', null, 1000, 1)
bank.run('mg', 'Invented Checking', 'KRW', '2025-03-30', 120_000, 'PURCHASE REFUND', '', 'reimbursement', 'purchase', 'Purchase', 1000, 1)
db.close()

process.env.STOCK_DB_PATH = dbPath
const NOW = new Date('2025-04-30T12:00:00Z')
const EARNED = 3_000_000 + 1_000_000 + 200_000
const NON_EARNED = 2_000 + 50_000

test('bonus and expense payouts count as income, and earned income is salary, bonus and expense', async () => {
  const { getCashInflow } = await import('../lib/adapters/portfolio-db')
  const march = (filter: Parameters<typeof getCashInflow>[3]) => getCashInflow('month', 'KRW', NOW, filter).periods.find((p) => p.period === '2025-03')!
  assert.equal(march('All').total, EARNED + NON_EARNED)
  assert.equal(march('earned').total, EARNED)
  assert.equal(march('bonus').total, 1_000_000)
  assert.equal(march('expense').total, 200_000)
  assert.equal(march('salary').total, 3_000_000)
  const totals = getCashInflow('month', 'KRW', NOW).totals
  assert.equal(totals.counted, EARNED + NON_EARNED)
  assert.deepEqual([totals.byCategory.bonus.amount, totals.byCategory.expense.amount], [1_000_000, 200_000])
})

test('excluding earned income leaves every other counted category, and never a reimbursement', async () => {
  const { getCashInflow, cashInflowCategories } = await import('../lib/adapters/portfolio-db')
  assert.deepEqual(cashInflowCategories('nonEarned'), ['dividend', 'interest', 'other'])
  const nonEarned = getCashInflow('month', 'KRW', NOW, 'nonEarned')
  assert.equal(nonEarned.periods.find((p) => p.period === '2025-03')!.total, NON_EARNED)
  assert.equal(nonEarned.totals.rangeTotal, NON_EARNED)
  // Earned and non-earned together are the whole counted total.
  assert.equal(getCashInflow('month', 'KRW', NOW, 'earned').totals.rangeTotal + NON_EARNED, getCashInflow('month', 'KRW', NOW).totals.rangeTotal)
})

test('a period drill-down under earned income lists its three parts', async () => {
  const { getCashInflowRows, cashInflowCategories } = await import('../lib/adapters/portfolio-db')
  const rows = getCashInflowRows('2025-03', 'KRW', cashInflowCategories('earned'))
  assert.deepEqual(rows.map((r) => r.category), ['salary', 'bonus', 'expense'])
})

test('a bankInflowRules entry may file a credit as bonus or expense', async () => {
  const { BANK_INFLOW_CATEGORIES } = await import('../scripts/bank-inflow-rules.mjs')
  assert.ok(BANK_INFLOW_CATEGORIES.includes('bonus'))
  assert.ok(BANK_INFLOW_CATEGORIES.includes('expense'))
})
