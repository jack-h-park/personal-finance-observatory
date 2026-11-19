import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { accountSortValue } from '@/lib/account-label'
import { realizedAmountSortValue } from '@/lib/realized-lots'
import { columnSortValue, knownSort, parseSort, sortRows, sortableKeys } from '@/lib/table-sort'

const fallback = { key: 'sold_date', direction: 'desc' as const }
const rows = [
  { id: 'a', brokerage: 'Sample Securities', account: 'Sample 2222', ticker: 'AAA', name: 'Zed' },
  { id: 'b', brokerage: 'Another Broker', account: 'Sample 1111', ticker: 'BBB', name: 'Yak' },
  { id: 'c', brokerage: 'Sample Securities', account: 'Sample 1111', ticker: 'CCC', name: 'Abe' },
]

// The /realized columns that matter here. The cost, proceeds and gain keys stay
// the same in both currencies, so a sort survives the currency switch; only the
// value each one sorts on changes.
const realizedColumns = (usd: boolean) => {
  const amount = realizedAmountSortValue(usd)
  return [
    { key: 'market', sortable: true },
    { key: 'account', sortable: true, sortValue: accountSortValue },
    { key: 'sold_date', sortable: true },
    { key: 'cost', sortable: true, sortValue: amount.cost },
    { key: 'proceeds', sortable: true, sortValue: amount.proceeds },
    { key: 'gain', sortable: true, sortValue: amount.gain },
    { key: 'notes' },
  ]
}

test('an unknown sort key falls back to the default', () => {
  const columns = realizedColumns(false)
  const parsed = parseSort('brokerage:asc', fallback)
  assert.equal(parsed?.key, 'brokerage')
  assert.deepEqual(knownSort(parsed, sortableKeys(columns), fallback), fallback)
  assert.deepEqual(knownSort(parseSort('account:asc', fallback), sortableKeys(columns), fallback), { key: 'account', direction: 'asc' })
  assert.deepEqual(knownSort(null, sortableKeys(columns), fallback), fallback)
})

test('every sortable column key is accepted, in KRW and in USD', () => {
  for (const usd of [false, true]) {
    const columns = realizedColumns(usd)
    for (const key of sortableKeys(columns)) {
      assert.deepEqual(knownSort(parseSort(`${key}:asc`, fallback), sortableKeys(columns), fallback), { key, direction: 'asc' }, key)
    }
    // A column that is not sortable falls back.
    assert.deepEqual(knownSort(parseSort('notes:asc', fallback), sortableKeys(columns), fallback), fallback)
  }
})

test('the realized amount columns sort on the selected currency', () => {
  // Sample lots whose KRW and USD orders disagree, so the currency decides the order.
  const lots = [
    { id: 'x', cost_basis_krw: 300, cost_usd: 1, proceeds_krw: 100, proceeds_usd: 3, realized_gl_krw: -200, gain_usd: 2 },
    { id: 'y', cost_basis_krw: 100, cost_usd: 3, proceeds_krw: 300, proceeds_usd: 1, realized_gl_krw: 200, gain_usd: -2 },
    { id: 'z', cost_basis_krw: 200, cost_usd: 2, proceeds_krw: 200, proceeds_usd: 2, realized_gl_krw: 0, gain_usd: 0 },
  ]
  const order = (usd: boolean, key: string) =>
    sortRows(lots, { key, direction: 'asc' }, columnSortValue(realizedColumns(usd))).map((r) => r.id)
  assert.deepEqual(sortableKeys(realizedColumns(false)), sortableKeys(realizedColumns(true)))
  assert.deepEqual(order(false, 'cost'), ['y', 'z', 'x'])
  assert.deepEqual(order(true, 'cost'), ['x', 'z', 'y'])
  assert.deepEqual(order(false, 'proceeds'), ['x', 'z', 'y'])
  assert.deepEqual(order(true, 'proceeds'), ['y', 'z', 'x'])
  assert.deepEqual(order(false, 'gain'), ['x', 'z', 'y'])
  assert.deepEqual(order(true, 'gain'), ['y', 'z', 'x'])
})

test('rows keep input order when the sort is null', () => {
  assert.deepEqual(sortRows(rows, null, columnSortValue([])).map((r) => r.id), ['a', 'b', 'c'])
})

test('the account column sorts on broker then account', () => {
  const columns = [{ key: 'account', sortable: true, sortValue: accountSortValue }]
  const sorted = sortRows(rows, { key: 'account', direction: 'asc' }, columnSortValue(columns))
  assert.deepEqual(sorted.map((r) => r.id), ['b', 'c', 'a'])
})

test('a column without sortValue sorts on the row field, one with it on its own value', () => {
  const plain = columnSortValue([{ key: 'ticker', sortable: true }])
  const named = columnSortValue([{ key: 'ticker', sortable: true, sortValue: (r: (typeof rows)[number]) => r.name }])
  assert.deepEqual(sortRows(rows, { key: 'ticker', direction: 'asc' }, plain).map((r) => r.id), ['a', 'b', 'c'])
  assert.deepEqual(sortRows(rows, { key: 'ticker', direction: 'asc' }, named).map((r) => r.id), ['c', 'b', 'a'])
})
