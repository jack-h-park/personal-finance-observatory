import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { anchoredCashSeries, nextBusinessDay, openingAnchorFromFlows } from '../scripts/anchored-cash.mjs'
import { REPO_ROOT, runIngest } from './ingest-harness'
import { writeSheetPayloads } from './sheet-payloads'
import { PYTHON_BIN } from '../scripts/python-bin.mjs'

// Robinhood's uninvested cash in total assets (scripts/anchored-cash.mjs).
//
// Selling stock moved value out of total assets and a later buy from that cash
// read as new money, because the cash itself was counted nowhere. Each monthly
// statement's closing cash is now an anchor, the days after it are derived
// FORWARD from the account's cash movements, and the snapshot's live cash is
// today's figure. Forward, because the CSV leaves out transfers from Robinhood
// checking: derived backward, each one would raise every earlier day and the
// past would count the money twice.
//
// Every account number, date and amount below is invented; the repository is public.

// --- the series ------------------------------------------------------------------

test('the days after a statement are derived forward, and the snapshot is today', () => {
  const { points, segments, negative } = anchoredCashSeries({
    statements: [{ date: '2026-10-31', balance: 1000 }],
    snapshot: { date: '2026-11-10', balance: 605 },
    flows: [
      // Traded before the statement, settled after it: not in the closing cash, so it moves it the day after.
      { date: '2026-10-30', settle: '2026-11-02', amount: -100 },
      // Settled by the statement date: already in the closing cash.
      { date: '2026-10-29', settle: '2026-10-30', amount: -999 },
      { date: '2026-11-04', settle: '2026-11-04', amount: 5 },
      { date: '2026-11-05', settle: '2026-11-06', amount: -100 },
      { date: '2026-11-06', settle: '2026-11-06', amount: -200 },
    ],
  })
  assert.deepEqual(points, [
    { date: '2026-10-31', balance: 1000, source: 'anchor' },
    { date: '2026-11-01', balance: 900, source: 'derived' },
    { date: '2026-11-04', balance: 905, source: 'derived' },
    { date: '2026-11-05', balance: 805, source: 'derived' },
    { date: '2026-11-06', balance: 605, source: 'derived' },
    { date: '2026-11-10', balance: 605, source: 'snapshot' },
  ])
  assert.deepEqual(segments, [
    { from: '2026-10-31', to: '2026-11-10', toSource: 'snapshot', derived: 605, actual: 605, residual: 0 },
  ])
  assert.deepEqual(negative, [])
})

test('a transfer the rows do not show lands on the next anchor as new money, never on the past', () => {
  const { points, segments, negative } = anchoredCashSeries({
    statements: [
      { date: '2026-09-30', balance: 100 },
      { date: '2026-10-31', balance: 2100 },
    ],
    snapshot: { date: '2026-11-05', balance: 3000 },
    flows: [
      { date: '2026-10-10', settle: '2026-10-13', amount: -400 },
      // A snapshot-side fill that has traded but not settled still counts: the live cash reflects it.
      { date: '2026-11-04', settle: '2026-11-05', amount: -50 },
    ],
  })
  // Nothing before the first statement, and September's balance is not rewritten by October's inflow.
  assert.equal(points[0].date, '2026-09-30')
  assert.deepEqual(points.find((p) => p.date === '2026-10-10'), { date: '2026-10-10', balance: -300, source: 'derived' })
  assert.deepEqual(
    segments.map((s) => [s.from, s.to, s.residual]),
    [
      ['2026-09-30', '2026-10-31', 2400],
      ['2026-10-31', '2026-11-05', 950],
    ]
  )
  assert.deepEqual(negative.map((p) => p.date), ['2026-10-10'])
})

test('no statement means no cash written at all, whatever the snapshot says', () => {
  const series = anchoredCashSeries({
    statements: [],
    snapshot: { date: '2026-11-10', balance: 605 },
    flows: [{ date: '2026-11-04', settle: '2026-11-04', amount: 5 }],
  })
  assert.deepEqual(series, { points: [], segments: [], negative: [] })
})

test('a bridged fill settles on the next weekday', () => {
  assert.equal(nextBusinessDay('2026-11-05'), '2026-11-06')
  assert.equal(nextBusinessDay('2026-10-30'), '2026-11-02')
  assert.equal(nextBusinessDay('2026-10-31'), '2026-11-02')
})

// --- the statement extractor -------------------------------------------------------

// pdfplumber replaced by a stub that returns page text from a JSON fixture, as in
// tossbank-pdf.test.ts.
const PDFPLUMBER_STUB = `
import builtins, json

class _Page:
    def __init__(self, data):
        self._data = data
    def extract_text(self):
        return self._data.get("text", "")
    def extract_tables(self):
        return []

class _Pdf:
    def __init__(self, data):
        self.pages = [_Page(p) for p in data["pages"]]
    def __enter__(self):
        return self
    def __exit__(self, *exc):
        return False

def open(path, password=None):
    with builtins.open(path, encoding="utf-8") as fh:
        return _Pdf(json.load(fh))
`

function summaryPage(account: string, cash: [string, string], sweep: [string, string], securities: [string, string], portfolio: [string, string]) {
  return [
    'Example Street 1, Example City Page 1 of 9',
    'help@example.invalid 10/01/2026 to 10/31/2026',
    'Example Customer',
    `Individual Account #:*****${account}`,
    'Portfolio Allocation',
    'Account Summary Opening Balance Closing Balance',
    `Brokerage Cash Balance * ${cash[0]} ${cash[1]}`,
    'Cash and Cash Equivalents',
    `Deposit Sweep Balance ${sweep[0]} ${sweep[1]} 5.00%`,
    `Total Securities ** ${securities[0]} ${securities[1]}`,
    `Portfolio Value ${portfolio[0]} ${portfolio[1]} Options`,
  ].join('\n')
}

function extractStatements(pages: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rh-statement-'))
  const stub = path.join(dir, 'stub')
  mkdirSync(stub)
  writeFileSync(path.join(stub, 'pdfplumber.py'), PDFPLUMBER_STUB, 'utf8')
  mkdirSync(path.join(dir, 'us-transactions'))
  writeFileSync(
    path.join(dir, 'us-transactions', 'robinhood-statement-0001-20261001-20261031.pdf'),
    JSON.stringify({ pages: pages.map((text) => ({ text })) }),
    'utf8'
  )
  const out = path.join(dir, 'us-pdf-evidence.json')
  const result = spawnSync(PYTHON_BIN, ['scripts/extract-us-pdf-evidence.py'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: stub, STOCK_DATA_DIR: dir, STOCK_US_PDF_EVIDENCE_PATH: out },
  })
  assert.equal(result.status, 0, `extractor exited ${result.status}: ${result.stderr}`)
  return JSON.parse(readFileSync(out, 'utf8')).reports.filter((r: { category: string }) => r.category === 'robinhood_statement_pdf')
}

test('the statement gives each account its month-end cash: brokerage cash plus the deposit sweep', () => {
  const [report] = extractStatements([
    summaryPage('0001', ['$10.00', '$400.00'], ['$0.00', '$100.00'], ['$90.00', '$1,500.00'], ['$100.00', '$2,000.00']),
    // A later page repeats cash and sweep with one figure each; only the summary counts.
    'Brokerage Cash Balance $999.00 4.60%\nDeposit Sweep Balance $999.00 0.80%',
    summaryPage('0002', ['$1.00', '$2.00'], ['$0.00', '$0.00'], ['$9.00', '$8.00'], ['$10.00', '$10.00']),
  ])
  assert.equal(report.metrics.period_start, '2026-10-01')
  assert.equal(report.metrics.period_end, '2026-10-31')
  assert.deepEqual(report.metrics.summary_mismatches, [])
  assert.deepEqual(report.accounts, [
    { account: '0001', opening_cash_usd: 10, closing_cash_usd: 500, bank_transfers: [] },
    { account: '0002', opening_cash_usd: 1, closing_cash_usd: 2, bank_transfers: [] },
  ])
})

test('a summary that does not add up to its portfolio value is reported and that account anchors nothing', () => {
  const [report] = extractStatements([
    summaryPage('0001', ['$10.00', '$400.00'], ['$0.00', '$100.00'], ['$90.00', '$1,500.00'], ['$100.00', '$2,100.00']),
  ])
  assert.deepEqual(report.metrics.summary_mismatches, [
    '0001: closing cash, sweep and securities do not add up to the portfolio value',
  ])
  assert.deepEqual(report.accounts, [])
})

test('older layouts: an unmasked account number, an account opened that month, and one with no sweep', () => {
  const page = (lines: string[]) => ['help@example.invalid 01/01/2026 to 01/31/2026', ...lines].join('\n')
  const [report] = extractStatements([
    // The account number printed in full, and no asterisk after the cash label.
    page(['Individual Account #:000000001', 'Account Summary Opening Balance Closing Balance', 'Brokerage Cash Balance $16.48 $0.00',
      'Deposit Sweep Balance $2,000.00 $3,000.00 2.99%', 'Total Securities * $7,983.52 $9,000.00', 'Portfolio Value $10,000.00 $12,000.00 Options']),
    // Opened this month: no opening balance.
    page(['Individual Account #:000000002', 'Account Summary Opening Balance Closing Balance', 'Brokerage Cash Balance N/A $0.00',
      'Deposit Sweep Balance N/A $2,000.35 1.55%', 'Total Securities * N/A $100.00', 'Portfolio Value N/A $2,100.35 Options']),
    // No sweep: "Net Account Balance" and no sweep row.
    page(['Individual Account #:*****0003', 'Account Summary Opening Balance Closing Balance', 'Net Account Balance $813.79 $814.35',
      'Total Securities $1,277.65 $1,345.94 37.70%', 'Portfolio Value $2,091.44 $2,160.29']),
    // Does not add up: left out alone, the others still count.
    page(['Individual Account #:*****0004', 'Account Summary Opening Balance Closing Balance', 'Brokerage Cash Balance $1.00 $2.00',
      'Deposit Sweep Balance $0.00 $0.00', 'Total Securities $9.00 $8.00', 'Portfolio Value $10.00 $99.00']),
  ])
  assert.deepEqual(report.accounts, [
    { account: '0001', opening_cash_usd: 2016.48, closing_cash_usd: 3000, bank_transfers: [] },
    { account: '0002', opening_cash_usd: null, closing_cash_usd: 2000.35, bank_transfers: [] },
    { account: '0003', opening_cash_usd: 813.79, closing_cash_usd: 814.35, bank_transfers: [] },
  ])
  assert.deepEqual(report.metrics.summary_mismatches, ['0004: closing cash, sweep and securities do not add up to the portfolio value'])
})

// --- filing the statement from the inbox -------------------------------------------

function claims(pages: string[]) {
  const program = `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('filer', 'scripts/file-downloads.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
pages = json.loads(sys.argv[1])
class Doc:
    path = Path('statement.pdf')
    suffix = '.pdf'
    pdf_meta = {}
    def page_text(self, i):
        return pages[i] if i < len(pages) else ''
out = []
for label, detect in m.DETECTORS:
    try:
        got = detect(Doc())
    except Exception:
        continue
    if isinstance(got, m.Plan):
        out.append({'label': label, 'plan': got.subdir + '/' + got.name})
    elif got is not None:
        out.append({'label': label, 'reason': got.reason})
print(json.dumps(out))
`
  return JSON.parse(
    execFileSync(PYTHON_BIN, ['-c', program, JSON.stringify(pages)], { cwd: REPO_ROOT, encoding: 'utf8' })
  )
}

test('the filer names a Robinhood statement by its first account and its own period, masked or not', () => {
  // The broker's public support address is the marker, beside the Account Summary.
  const masked = summaryPage('0001', ['$1.00', '$2.00'], ['$0.00', '$0.00'], ['$9.00', '$8.00'], ['$10.00', '$10.00']).replace(
    'help@example.invalid',
    'help@robinhood.com'
  )
  // The extractor's fixtures, without that address, are claimed by nothing.
  assert.deepEqual(claims([summaryPage('0001', ['$1.00', '$2.00'], ['$0.00', '$0.00'], ['$9.00', '$8.00'], ['$10.00', '$10.00'])]), [])
  assert.deepEqual(claims([masked]), [
    { label: 'Robinhood account statement', plan: 'us-transactions/robinhood-statement-0001-20261001-20261031.pdf' },
  ])
  const unmasked = masked.replace('Individual Account #:*****0001', 'Individual Account #:000000001')
  assert.equal(claims([unmasked])[0].plan, 'us-transactions/robinhood-statement-0001-20261001-20261031.pdf')
  assert.deepEqual(claims([masked.replace('10/01/2026 to 10/31/2026', '')]), [
    { label: 'Robinhood account statement', reason: 'page 1 does not print its `MM/DD/YYYY to MM/DD/YYYY` period' },
  ])
})

// --- the ingest, end to end --------------------------------------------------------

const CSV_HEADER =
  '"Activity Date","Process Date","Settle Date","Instrument","Description","Trans Code","Quantity","Price","Amount"'

function row(date: string, settle: string, ticker: string, code: string, qty: string, price: string, amount: string) {
  return `"${date}","${date}","${settle}","${ticker}","${ticker} Corp\nCUSIP: 000000000","${code}","${qty}","${price}","${amount}"`
}

// Robinhood writes newest-first.
const MIDTERM_ROWS = [
  row('11/5/2026', '11/6/2026', 'KEEP', 'Buy', '2', '$50.00', '($100.00)'),
  row('11/4/2026', '11/4/2026', 'KEEP', 'CDIV', '', '', '$5.00'),
  row('10/30/2026', '11/2/2026', 'ACME', 'Buy', '1', '$100.00', '($100.00)'),
]

function ingest({ midtermCash, crypto = true }: { midtermCash: string; crypto?: boolean }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rh-cash-'))
  mkdirSync(path.join(dir, 'us-transactions'), { recursive: true })
  writeFileSync(
    path.join(dir, 'us-transactions', 'robinhood-transactions-midterm-20261001-20261106.csv'),
    [CSV_HEADER, ...MIDTERM_ROWS].join('\n') + '\n',
    'utf8'
  )
  writeSheetPayloads(dir)
  const account = (accountNumber: string, nickname: string, cash: string) => ({
    accountNumber,
    nickname,
    positions: [],
    lots: [],
    orders: { createdAtGte: '2026-10-01', complete: true, items: [] },
    portfolio: { cash, currency: 'USD' },
  })
  const snapshotPath = path.join(dir, 'robinhood-snapshot.json')
  writeFileSync(
    snapshotPath,
    JSON.stringify({
      fetchedAt: '2026-11-10T20:00:00.000Z',
      accounts: [account('000000001', 'Mid-term', midtermCash), account('000000002', 'Long-term', '50.00')],
    })
  )
  const evidencePath = path.join(dir, 'us-pdf-evidence.json')
  writeFileSync(
    evidencePath,
    JSON.stringify({
      reports: [
        {
          category: 'robinhood_statement_pdf',
          name: 'robinhood_statement:robinhood-statement-0001-20261001-20261031',
          filename: 'robinhood-statement-0001-20261001-20261031.pdf',
          path: path.join(dir, 'us-transactions', 'robinhood-statement-0001-20261001-20261031.pdf'),
          pages: 9,
          row_count: 1,
          metrics: { period_start: '2026-10-01', period_end: '2026-10-31', accounts: 1, summary_mismatches: [] },
          // Long-term (0002) has no statement here.
          accounts: [{ account: '0001', opening_cash_usd: 700, closing_cash_usd: 1000 }],
        },
      ],
    })
  )
  const cryptoRow = (date: string, type: string, amount: number, fundingAccount: string) => ({
    venue: 'Robinhood', account: 'Robinhood Crypto', currency: 'USD', date, time: '', symbol: 'BTC', isCash: false,
    rawType: type === 'BUY' ? 'Crypto Purchase' : 'Crypto Sale', type, quantity: 0.001, price: amount / 0.001, amount,
    settlement: null, fee: 0, assetBalance: null, cashBalance: null, note: '', source: 'robinhood-crypto-statement-202611.pdf',
    page: 2, fundingAccount,
  })
  const cryptoPath = path.join(dir, 'crypto-activity.json')
  writeFileSync(
    cryptoPath,
    JSON.stringify({
      documents: [],
      // The purchase settles against Mid-term; the one in another account's section does not touch it.
      transactions: crypto ? [cryptoRow('2026-11-06', 'BUY', 200, '0001'), cryptoRow('2026-11-06', 'BUY', 70, '0003')] : [],
      snapshots: [],
    })
  )
  const dbPath = runIngest(dir, {
    env: { STOCK_ROBINHOOD_SNAPSHOT_PATH: snapshotPath, STOCK_US_PDF_EVIDENCE_PATH: evidencePath, STOCK_CRYPTO_ACTIVITY_PATH: cryptoPath },
    allowFailure: true,
  })
  const db = new Database(dbPath, { readonly: true })
  const rows = db
    .prepare(
      `select account, as_of_date, balance, source, account_wrapper, asset_class from brokerage_cash
       where institution = 'Robinhood' order by account, as_of_date`
    )
    .all()
  const checks = new Map(
    (db.prepare('select name, status, detail from validation_checks').all() as { name: string; status: string; detail: string }[]).map((c) => [c.name, c])
  )
  db.close()
  return { rows, check: (name: string) => checks.get(name) }
}

test('the ingest writes the statement, the derived days and the snapshot for an account with a statement, and nothing for one without', () => {
  const out = ingest({ midtermCash: '605.00' })
  const r = (as_of_date: string, balance: number, source: string) => ({
    account: 'Robinhood 0001', as_of_date, balance, source, account_wrapper: 'taxable', asset_class: 'security',
  })
  assert.deepEqual(out.rows, [
    r('2026-10-31', 1000, 'robinhood_statement'),
    r('2026-11-01', 900, 'derived:robinhood_cash_flows'),
    r('2026-11-04', 905, 'derived:robinhood_cash_flows'),
    r('2026-11-05', 805, 'derived:robinhood_cash_flows'),
    r('2026-11-06', 605, 'derived:robinhood_cash_flows'),
    r('2026-11-10', 605, 'robinhood_mcp'),
  ])
  const anchored = out.check('robinhood_cash_anchored')
  assert.equal(anchored?.status, 'fail')
  assert.match(anchored?.detail ?? '', /Robinhood 0002: no monthly statement filed, so its cash is not counted/)
  assert.equal(out.check('robinhood_cash_unexplained')?.status, 'pass')
  assert.equal(out.check('robinhood_cash_derivation_nonnegative')?.status, 'pass')
  assert.ok(out.check('robinhood_statement_fresh'))
})

test('cash the rows do not explain is named, and counted on the snapshot date only', () => {
  const out = ingest({ midtermCash: '1605.00' })
  const balances = (out.rows as { as_of_date: string; balance: number }[]).map((x) => [x.as_of_date, x.balance])
  assert.deepEqual(balances.at(-2), ['2026-11-06', 605])
  assert.deepEqual(balances.at(-1), ['2026-11-10', 1605])
  const unexplained = out.check('robinhood_cash_unexplained')
  assert.equal(unexplained?.status, 'fail')
  assert.match(unexplained?.detail ?? '', /Robinhood 0001 2026-10-31 → 2026-11-10: 1000\.00 USD/)
})

test('a crypto purchase moves the cash of the account its statement section names', () => {
  const without = ingest({ midtermCash: '605.00', crypto: false })
  const day = (rows: unknown[], date: string) => (rows as { as_of_date: string; balance: number }[]).find((x) => x.as_of_date === date)?.balance
  // Without the crypto row the 11-06 day does not move, and the snapshot reads 200 unexplained.
  assert.equal(day(without.rows, '2026-11-06'), undefined)
  assert.match(without.check('robinhood_cash_unexplained')?.detail ?? '', /-200\.00 USD/)
})

// --- Chase and Merrill sweep cash --------------------------------------------------
//
// Neither holdings export lists its cash as a position, so the parsers skip it
// and a buy from the sweep read as new money. Every holdings export on disk is an
// anchor; Chase's days between them are derived from its transactions other than
// the `QACDS` sweep rows, which only move cash between the core balance and the
// sweep.

const CHASE_HOLDINGS_HEADER = '"Account name","Account number","Account type","Asset Class","Description","Ticker","Quantity","Value","As of","Pricing Date"'
const chaseCash = (asOf: string, ticker: string, description: string, value: string) =>
  `"Self-Directed","...0000","Brokerage","Cash & Money Market Funds","${description}","${ticker}","${value}","${value}","${asOf}","${asOf} 08:00:00"`
const CHASE_TX_HEADER = '"Trade Date","Account Name","Account Number","Account Type","Type","Description","Ticker","Quantity","Amount USD"'
const chaseTx = (date: string, type: string, ticker: string, quantity: string, amount: string) =>
  `"${date}","Self-Directed","...0000","Brokerage","${type}","${ticker} example","${ticker}","${quantity}","${amount}"`

function ingestSweeps(laterSweep: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sweep-cash-'))
  mkdirSync(path.join(dir, 'us-holdings'), { recursive: true })
  mkdirSync(path.join(dir, 'us-transactions'), { recursive: true })
  writeFileSync(path.join(dir, 'us-holdings', 'chase-holdings-20261009.csv'), [CHASE_HOLDINGS_HEADER, chaseCash('10/08/2026', 'QACDS', 'CHASE DEPOSIT SWEEP', '15.00')].join('\n') + '\n')
  writeFileSync(
    path.join(dir, 'us-holdings', 'chase-holdings-20261113.csv'),
    // The core balance is a cash row with no ticker; zero here, the sweep holds it all.
    [CHASE_HOLDINGS_HEADER, chaseCash('11/12/2026', 'QACDS', 'CHASE DEPOSIT SWEEP', laterSweep), chaseCash('11/12/2026', '', 'US DOLLAR', '0')].join('\n') + '\n'
  )
  writeFileSync(
    path.join(dir, 'us-transactions', 'chase-transactions-20261001-20261110.csv'),
    [
      CHASE_TX_HEADER,
      chaseTx('11/2/2026', 'Reinvest', 'QACDS', '0.04', '-0.04'),
      chaseTx('11/2/2026', 'Interest', '', '0', '0.04'),
      chaseTx('10/21/2026', 'WDL', 'QACDS', '-400', '400'),
      chaseTx('10/20/2026', 'Buy', 'ACME', '4', '-400'),
      chaseTx('10/13/2026', 'DBS', 'QACDS', '1000', '-1000'),
      chaseTx('10/9/2026', 'Sell', 'KEEP', '-10', '1000'),
    ].join('\n') + '\n'
  )
  writeFileSync(
    path.join(dir, 'us-holdings', 'merrill-holdings-20261113.csv'),
    [
      'Exported on: 11/13/2026 01:49 PM ET',
      'Selected account(s):Example 000-00000',
      '"" ,"Symbol " ,"Quantity" ,"Unit Cost" ,"Cost Basis" ,"Price" ,"Value" ,"Unrealized Gain/Loss $ Chg % Chg" ," "',
      '"" ,"Balances" ,"" ,"" ,"" ,"" ,"" ,"" ,""',
      '"" ,"Money accounts  Executed Tranx" ,"28" ,"--" ,"--" ,"$1.00" ,"$28.00" ,"-- --" ,""',
      '"" ,"Cash balance" ,"" ,"" ,"" ,"" ,"$0.48" ," " ,""',
      '"" ,"Pending activity" ,"" ,"" ,"" ,"" ,"-$10.00" ," " ,""',
    ].join('\n') + '\n'
  )
  writeSheetPayloads(dir)
  const dbPath = runIngest(dir, { allowFailure: true })
  const db = new Database(dbPath, { readonly: true })
  const rows = db
    .prepare(
      `select institution, account, pool, as_of_date, balance, source from brokerage_cash
       where institution in ('Chase', 'Merrill') order by institution, as_of_date`
    )
    .all()
  const check = db.prepare("select status, detail from validation_checks where name = 'us_sweep_cash_reconciles'").get() as
    | { status: string; detail: string }
    | undefined
  db.close()
  return { rows, check }
}

test('Chase sweep cash is anchored on each holdings export and derived between them; Merrill nets its pending activity', () => {
  const { rows, check } = ingestSweeps('615.04')
  const chase = (as_of_date: string, balance: number, source: string) => ({
    institution: 'Chase', account: 'Chase Self-Directed ...0000', pool: 'sweep', as_of_date, balance, source,
  })
  assert.deepEqual(rows, [
    chase('2026-10-08', 15, 'chase_holdings'),
    // The sale lands in the core balance; the sweep deposit that follows moves nothing.
    chase('2026-10-09', 1015, 'derived:chase_cash_flows'),
    chase('2026-10-20', 615, 'derived:chase_cash_flows'),
    chase('2026-11-02', 615.04, 'derived:chase_cash_flows'),
    chase('2026-11-12', 615.04, 'chase_holdings'),
    { institution: 'Merrill', account: 'Merrill Example 000-00000', pool: 'sweep', as_of_date: '2026-11-13', balance: 18.48, source: 'merrill_holdings' },
  ])
  assert.equal(check?.status, 'pass', check?.detail)
})

test('a Chase export whose cash the transactions do not reach is named, and the gap lands on its date', () => {
  const { rows, check } = ingestSweeps('815.04')
  const last = (rows as { institution: string; as_of_date: string; balance: number }[]).filter((r) => r.institution === 'Chase').at(-1)
  assert.deepEqual([last?.as_of_date, last?.balance], ['2026-11-12', 815.04])
  assert.equal(check?.status, 'fail')
  assert.match(check?.detail ?? '', /Chase Self-Directed \.\.\.0000 2026-10-08 → 2026-11-12: 200\.00 USD/)
})

test('an account whose history reaches its first movement opens at zero, only when the flows land on the first anchor', () => {
  const flows = [
    { date: '2025-09-12', amount: 10_000 },
    { date: '2025-10-03', amount: -6_000 },
    { date: '2025-12-01', amount: 40 },
  ]
  // 10,000 - 6,000 + 40 = 4,040, which is the first anchor: the history is complete.
  const opening = openingAnchorFromFlows({ anchors: [{ date: '2026-01-15', balance: 4_040.4 }], flows })
  assert.deepEqual(opening, { date: '2025-09-11', balance: 0 })
  const series = anchoredCashSeries({ statements: [opening!, { date: '2026-01-15', balance: 4_040.4 }], snapshot: null, flows })
  assert.deepEqual(
    series.points.map((p) => [p.date, p.balance]),
    [
      ['2025-09-11', 0],
      ['2025-09-12', 10_000],
      ['2025-10-03', 4_000],
      ['2025-12-01', 4_040],
      ['2026-01-15', 4_040.4],
    ]
  )
})

test('a history that does not add up to the first anchor, or that has no movement before it, opens nothing', () => {
  const anchors = [{ date: '2026-01-15', balance: 9_000 }]
  // The rows start after the account did: they sum to 4,040, not 9,000.
  assert.equal(openingAnchorFromFlows({ anchors, flows: [{ date: '2025-09-12', amount: 4_040 }] }), null)
  // Nothing before the anchor.
  assert.equal(openingAnchorFromFlows({ anchors, flows: [{ date: '2026-02-01', amount: 9_000 }] }), null)
  assert.equal(openingAnchorFromFlows({ anchors: [], flows: [{ date: '2025-09-12', amount: 1 }] }), null)
})

