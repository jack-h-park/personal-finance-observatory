import assert from 'node:assert/strict'
import test from 'node:test'
import { approvedMiraeBalances } from '../scripts/approved-mirae-balances.mjs'

const isaAccount = '미래에셋증권(ISA)'
const cmaAccount = '미래에셋 CMA'
const hash = 'a'.repeat(64)
const input = {
  version: 1,
  isa: {
    date: '2026-01-01', accountEnding: '2000', statementSha256: hash, cashWon: 10, totalWon: 30,
    positions: [{ ticker: '005930', name: '삼성전자', quantity: 2, valueWon: 20, unitCostWon: 8 }],
  },
  cma: { date: '2026-01-01', accountEnding: '9320', statementSha256: hash, valueWon: 101 },
}

test('approved certificate replaces only scoped holdings and balance series on replay', () => {
  const approved = approvedMiraeBalances(input)
  const pension = { account: '미래에셋증권(IRP)', ticker: '088980', quantity: 3 }
  const positions = approved.holdings([
    { account: isaAccount, ticker: '088980', quantity: 4 },
    { account: isaAccount, ticker: '005930', quantity: 2, native_cost: 15 },
    pension,
  ])
  assert.deepEqual(positions.map(({ account, ticker }) => [account, ticker]), [
    [pension.account, pension.ticker], [isaAccount, '005930'],
  ])
  assert.equal(positions[1].native_cost, 15)
  assert.equal(positions[1].valuation_source, 'snapshot')
  assert.deepEqual(approved.holdings(positions), positions)

  const cma = { institution: 'mirae', account: cmaAccount, currency: 'KRW', balance: 100 }
  const oldCma = { ...cma, as_of_date: '2025-12-31' }
  const usd = { ...cma, currency: 'USD', as_of_date: '2026-01-01' }
  const cmaRows = approved.cmaCash([oldCma, usd, { ...cma, as_of_date: '2026-01-02' }])
  assert.deepEqual(cmaRows.slice(0, 2), [oldCma, usd])
  assert.deepEqual(cmaRows.filter(r => r.currency === 'KRW').map(r => r.balance), [100, 101])
  assert.deepEqual(approved.cmaCash(cmaRows), cmaRows)

  const isaCash = { institution: '미래에셋증권', account: isaAccount, pool: 'KRW', currency: 'KRW', balance: 9 }
  const oldIsa = { ...isaCash, as_of_date: '2025-12-31' }
  const cash = approved.isaCash([oldIsa, { ...isaCash, as_of_date: '2026-01-01' }])
  assert.deepEqual(cash.map(r => r.balance), [9, 10])
  assert.deepEqual(approved.isaCash(cash), cash)
})

test('a receipt with ambiguous identity, duplicate holdings, or inconsistent totals fails closed', () => {
  assert.throws(() => approvedMiraeBalances({ ...input, cma: { ...input.cma, accountEnding: '9346' } }), /identity/)
  assert.throws(() => approvedMiraeBalances({ ...input, isa: { ...input.isa, totalWon: 29 } }), /total/)
  assert.throws(() => approvedMiraeBalances({
    ...input, isa: { ...input.isa, positions: [...input.isa.positions, ...input.isa.positions] },
  }), /position/)
})

test('a quoted ISA position is valued at the market price; an unquoted one keeps the certificate value', () => {
  const approved = approvedMiraeBalances({
    ...input,
    isa: {
      ...input.isa, cashWon: 10, totalWon: 40,
      positions: [
        { ticker: '005930', name: '삼성전자', quantity: 2, valueWon: 20, unitCostWon: 8 },
        { ticker: '000660', name: 'SK하이닉스', quantity: 1, valueWon: 10, unitCostWon: 9 },
      ],
    },
  })
  const quotes = { '005930': { price: 12, asOfDate: '2026-01-05' } }
  const [samsung, hynix] = approved.holdings([], (ticker) => quotes[ticker] ?? null)
  assert.equal(samsung.native_price, 12)
  assert.equal(samsung.native_market_value, 24)
  assert.equal(samsung.base_market_value, 24)
  assert.equal(samsung.native_unrealized_gl, 24 - 16)
  assert.equal(samsung.valuation_source, 'price')
  assert.equal(samsung.as_of_date, '2026-01-05')
  assert.equal(hynix.native_market_value, 10)
  assert.equal(hynix.valuation_source, 'snapshot')
  assert.equal(hynix.as_of_date, '2026-01-01')
})

test('lots that a newer certificate disagrees with are reported; an older certificate says nothing', () => {
  const approved = approvedMiraeBalances(input)
  const lot = (ticker, open_quantity, as_of_date = '2025-12-15') => ({ account: isaAccount, ticker, open_quantity, as_of_date })
  const other = { account: '미래에셋증권(IRP)', ticker: '111111', open_quantity: 5, as_of_date: '2025-12-15' }
  const result = approved.lotDisagreements([lot('005930', 1), lot('005930', 1), lot('111111', 7), other])
  assert.equal(result.statementDate, '2025-12-15')
  assert.equal(result.certificateDate, '2026-01-01')
  assert.deepEqual(result.mismatches, [{ ticker: '111111', lots: 7, certificate: 0 }])
  assert.deepEqual(approved.lotDisagreements([lot('111111', 7, '2026-01-02')]).mismatches, [])
})
