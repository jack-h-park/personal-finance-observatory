import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedBankBalanceRows } from '../scripts/approved-bank-balances.mjs'

const reportHash = '1'.repeat(64)
const statementHash = '2'.repeat(64)
const connectorHash = '3'.repeat(64)
const prior = {
  institution: 'bank', account: 'Checking', currency: 'USD', owner: 'self',
  kind: 'checking', as_of_date: '2026-10-01', balance: 100, derived: 0,
}
const receipt = {
  institution: 'bank', account: 'Checking', currency: 'USD',
  observedAt: '2026-11-20T11:54:03-05:00', balanceCents: 12523,
  reportSha256: reportHash, statementSha256: statementHash, connectorManifestSha256: connectorHash,
}
const source = 'approved-bank-balances.json'

test('uses the exact existing account and appends only the verified balance', () => {
  assert.deepEqual(approvedBankBalanceRows([receipt], [prior], source), [{
    ...prior, as_of_date: '2026-11-20', balance: 125.23,
    day_max_balance: null, source,
  }])
  assert.equal(prior.balance, 100)
})

test('an existing same-day balance supersedes the observation without a second row', () => {
  assert.deepEqual(approvedBankBalanceRows([receipt], [prior, {
    ...prior, as_of_date: '2026-11-20', balance: 126,
  }], source), [])
})

test('rejects an unknown account, duplicate approval, or invalid evidence', () => {
  assert.throws(() => approvedBankBalanceRows([receipt], [], source), /existing/)
  assert.throws(() => approvedBankBalanceRows([receipt, receipt], [prior], source), /duplicate/)
  assert.throws(() => approvedBankBalanceRows([{ ...receipt, reportSha256: 'invalid' }], [prior], source), /invalid/)
  assert.throws(() => approvedBankBalanceRows([{ ...receipt, observedAt: '2026-02-30T12:00:00-05:00' }], [prior], source), /invalid/)
})

test('uses a derived balance history to identify an existing bank account', () => {
  const derived = { ...prior, kind: 'savings', derived: 1 }
  const rows = approvedBankBalanceRows([receipt], [derived], source)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].kind, 'savings')
  assert.equal(rows[0].derived, 0)
  assert.deepEqual(approvedBankBalanceRows([receipt], [
    derived, { ...derived, as_of_date: '2026-11-20' },
  ], source), [])
  assert.throws(() => approvedBankBalanceRows([receipt], [
    derived, { ...derived, owner: 'joint' },
  ], source), /existing/)
})

test('adds a whole-won confirmation to the existing KRW account without scaling', () => {
  const { balanceCents, ...evidence } = receipt
  const approved = { ...evidence, currency: 'KRW', balanceWon: 12345 }
  const row = { ...prior, currency: 'KRW' }
  assert.deepEqual(approvedBankBalanceRows([approved], [row], source), [{
    ...row, as_of_date: '2026-11-20', balance: 12345,
    day_max_balance: null, source,
  }])
  assert.throws(() => approvedBankBalanceRows([
    { ...approved, balanceCents },
  ], [row], source), /invalid/)
  assert.throws(() => approvedBankBalanceRows([
    { ...approved, balanceWon: 1.5 },
  ], [row], source), /invalid/)
})
