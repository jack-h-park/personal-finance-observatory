import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { TotalAssetsPoint } from '@/lib/net-worth'
import { ASSET_CLASS_KEYS, resolveClasses, toggleClass, viewPoints } from '@/lib/total-assets-view'

const point = (date: string, values: Partial<TotalAssetsPoint>): TotalAssetsPoint => ({
  date,
  stocks: null,
  crypto: null,
  cash: null,
  pensions: null,
  gold: null,
  total: 0,
  ...values,
})

test('resolveClasses keeps stack order and falls back to every class', () => {
  assert.deepEqual(resolveClasses('cash,stocks'), ['stocks', 'cash'])
  assert.deepEqual(resolveClasses(undefined), [...ASSET_CLASS_KEYS])
  assert.deepEqual(resolveClasses(''), [...ASSET_CLASS_KEYS])
  assert.deepEqual(resolveClasses('bonds'), [...ASSET_CLASS_KEYS])
  assert.deepEqual(resolveClasses(['gold', 'cash']), ['gold'])
})

test('toggleClass turns one class on or off and never empties the selection', () => {
  assert.equal(toggleClass([...ASSET_CLASS_KEYS], 'cash'), 'stocks,crypto,pensions,gold')
  assert.equal(toggleClass(['stocks', 'crypto', 'pensions', 'gold'], 'cash'), null)
  assert.equal(toggleClass(['stocks'], 'cash'), 'stocks,cash')
  assert.equal(toggleClass(['cash'], 'cash'), 'cash')
})

test('viewPoints sums only the shown classes', () => {
  const [view] = viewPoints([point('2026-10-31', { stocks: 300, cash: 100, gold: 0, total: 400 })], ['stocks', 'gold'], false)
  assert.deepEqual(view, { date: '2026-10-31', stocks: 300, crypto: null, cash: null, pensions: null, gold: 0, total: 300 })
})

test('viewPoints in share mode stacks to 100, and a zero sum has no shares', () => {
  const [a, b] = viewPoints(
    [point('2026-10-31', { stocks: 300, cash: 100 }), point('2026-11-22', { stocks: 0, cash: 0 })],
    ['stocks', 'cash'],
    true,
  )
  assert.deepEqual([a.stocks, a.cash, a.total], [75, 25, 100])
  assert.deepEqual([b.stocks, b.cash, b.total], [null, null, 0])
})
