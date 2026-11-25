import assert from 'node:assert/strict'
import test from 'node:test'
import { readCashBalanceEvidence } from '../lib/adapters/cash-balance-evidence'

const index = [
  '## Robinhood Banking — May 2025 and June 14 balance confirmation',
  '',
  'The statements cover May 1–31, 2025. The selected export start and end dates remain unconfirmed for both CSVs.',
  '',
  '| Existing account | Issuer statement PDF | May 31 ending balance | June 14 owner-confirmed balance | Existing transaction CSV |',
  '|---|---|---:|---:|---|',
  '| Sample Checking | [May statement, PDF page 2](../inbox/example.pdf) | $1,425.09 | USD 0.00 | [Existing CSV](../bank-statements/example.csv) |',
  '| Sample Savings | [May statement, PDF page 2](../inbox/other.pdf) | USD 15.00 | USD 20.00 | [Existing CSV](../bank-statements/other.csv) |',
].join('\n')

const cash = { institution: 'robinhood-bank', account: 'Sample Checking', currency: 'USD' as const }
const evidence = (source: string) => readCashBalanceEvidence(source)

test('cash evidence binds to the exact institution, account and currency without leaking paths', () => {
  const find = evidence(index)
  assert.deepEqual(find(cash), {
    statementStart: '2025-05-01',
    statementEnd: '2025-05-31',
    statementPage: 2,
    closingMinor: 142509,
    confirmationDate: '2025-06-14',
    confirmationMinor: 0,
    csvPeriod: 'unconfirmed',
  })
  assert.equal(find({ ...cash, account: 'Sample Savings' })?.closingMinor, 1500)
  assert.equal(find({ ...cash, institution: 'another-bank' }), undefined)
  assert.equal(find({ ...cash, currency: 'KRW' }), undefined)
  assert.equal(find({ ...cash, account: 'sample checking' }), undefined)
})

test('unsupported or ambiguous evidence contributes no claim', () => {
  assert.equal(evidence('')(cash), undefined)
  assert.equal(evidence(index.replace('May 1–31', 'May 1–32'))(cash), undefined)
  assert.equal(evidence(index.replace('May 31 ending', 'May 30 ending'))(cash), undefined)
  assert.equal(evidence(index.replace('$1,425.09', '$1,42.09'))(cash), undefined)
  assert.equal(evidence(index.replace('remain unconfirmed', 'were confirmed'))(cash), undefined)
  assert.equal(evidence([index, index.replace('1,425.09', '1,000.00')].join('\n\n'))(cash), undefined)
})
