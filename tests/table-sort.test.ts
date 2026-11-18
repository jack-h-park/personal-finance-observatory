import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { knownSort, parseSort, rowSortValue, sortRows } from '@/lib/table-sort'

const fallback = { key: 'value', direction: 'desc' as const }
const rows = [
  { id: 'a', brokerage: 'Sample Securities', account: 'Sample 2222', value: 1 },
  { id: 'b', brokerage: 'Another Broker', account: 'Sample 1111', value: 3 },
  { id: 'c', brokerage: 'Sample Securities', account: 'Sample 1111', value: 2 },
]

test('an unknown sort key falls back to the default', () => {
  const parsed = parseSort('brokerage:asc', fallback)
  assert.equal(parsed?.key, 'brokerage')
  const sort = knownSort(parsed, ['account', 'value'], fallback)
  assert.deepEqual(sort, fallback)
  assert.deepEqual(knownSort(parseSort('account:asc', fallback), ['account', 'value'], fallback), { key: 'account', direction: 'asc' })
  assert.deepEqual(knownSort(null, ['value'], fallback), fallback)
})

test('rows keep input order when the sort is null', () => {
  assert.deepEqual(sortRows(rows, null, rowSortValue).map((r) => r.id), ['a', 'b', 'c'])
})

test('the account key sorts on broker then account', () => {
  const sorted = sortRows(rows, { key: 'account', direction: 'asc' }, rowSortValue)
  assert.deepEqual(sorted.map((r) => r.id), ['b', 'c', 'a'])
})
