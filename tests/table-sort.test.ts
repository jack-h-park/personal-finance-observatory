import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { accountSortValue } from '@/lib/account-label'
import { columnSortValue, knownSort, parseSort, sortRows, sortableKeys } from '@/lib/table-sort'

const fallback = { key: 'sold_date', direction: 'desc' as const }
const rows = [
  { id: 'a', brokerage: 'Sample Securities', account: 'Sample 2222', ticker: 'AAA', name: 'Zed' },
  { id: 'b', brokerage: 'Another Broker', account: 'Sample 1111', ticker: 'BBB', name: 'Yak' },
  { id: 'c', brokerage: 'Sample Securities', account: 'Sample 1111', ticker: 'CCC', name: 'Abe' },
]

// The /realized columns that matter here: the cost, proceeds and gain keys change with the currency.
const realizedColumns = (usd: boolean) => [
  { key: 'market', sortable: true },
  { key: 'account', sortable: true, sortValue: accountSortValue },
  { key: 'sold_date', sortable: true },
  { key: usd ? 'cost_usd' : 'cost_basis_krw', sortable: true },
  { key: usd ? 'proceeds_usd' : 'proceeds_krw', sortable: true },
  { key: usd ? 'gain_usd' : 'realized_gl_krw', sortable: true },
  { key: 'notes' },
]

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
    // A column that is not sortable, and the other currency's key, fall back.
    assert.deepEqual(knownSort(parseSort('notes:asc', fallback), sortableKeys(columns), fallback), fallback)
    assert.deepEqual(knownSort(parseSort(`${usd ? 'cost_basis_krw' : 'cost_usd'}:asc`, fallback), sortableKeys(columns), fallback), fallback)
  }
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
