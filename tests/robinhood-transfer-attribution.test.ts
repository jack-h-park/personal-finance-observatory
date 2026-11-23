// A transfer the owner attributed by hand counts as cash on the receiving account until a
// statement prints the same transfer, which then replaces it. Every figure below is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { anchoredCashSeries } from '../scripts/anchored-cash.mjs'
import { manualBankTransferFlows } from '../scripts/robinhood-transfer-attribution.mjs'

const entry = (date: string, amountUsd: number, account: string) => ({ date, amountUsd, account })

test('an entry becomes a cash inflow on its account and date', () => {
  const { flows, dropped, invalid } = manualBankTransferFlows([entry('2026-11-11', 5000, '1111'), entry('2026-11-11', 5000, '2222')])
  assert.deepEqual(flows.get('1111'), [{ date: '2026-11-11', settle: '2026-11-11', amount: 5000 }])
  assert.deepEqual(flows.get('2222'), [{ date: '2026-11-11', settle: '2026-11-11', amount: 5000 }])
  assert.deepEqual([dropped, invalid], [[], []])
})

test('a statement transfer for the same account, amount and nearby date replaces the entry', () => {
  const statement = new Map([['1111', [{ date: '2026-11-12', amount: 5000 }]]])
  const { flows, dropped } = manualBankTransferFlows([entry('2026-11-11', 5000, '1111'), entry('2026-11-11', 5000, '2222')], statement)
  assert.equal(flows.has('1111'), false)
  assert.equal(dropped.length, 1)
  assert.equal(flows.get('2222')?.length, 1)
})

test('one statement line covers one entry, and another amount or a far date does not match', () => {
  const statement = new Map([['1111', [{ date: '2026-11-11', amount: 5000 }]]])
  const twice = manualBankTransferFlows([entry('2026-11-11', 5000, '1111'), entry('2026-11-11', 5000, '1111')], statement)
  assert.equal(twice.dropped.length, 1)
  assert.equal(twice.flows.get('1111')?.length, 1)
  const other = manualBankTransferFlows([entry('2026-11-11', 4000, '1111'), entry('2026-11-20', 5000, '1111')], statement)
  assert.equal(other.flows.get('1111')?.length, 2)
})

test('a malformed entry is reported and skipped', () => {
  const { flows, invalid } = manualBankTransferFlows([entry('11/11/2026', 5000, '1111'), entry('2026-11-11', 0, '1111'), entry('2026-11-11', 5000, '12'), null as never])
  assert.equal(flows.size, 0)
  assert.equal(invalid.length, 4)
})

test('counting the attributed transfers closes the open segment', () => {
  const statements = [{ date: '2026-10-31', balance: 1000 }]
  const snapshot = { date: '2026-11-22', balance: 6200 }
  const open = anchoredCashSeries({ statements, snapshot, flows: [{ date: '2026-11-15', settle: '2026-11-15', amount: -800 }] })
  assert.equal(open.segments[0].residual, 6000)
  const { flows } = manualBankTransferFlows([entry('2026-11-11', 5000, '1111'), entry('2026-11-13', 1000, '1111')])
  const closed = anchoredCashSeries({ statements, snapshot, flows: [{ date: '2026-11-15', settle: '2026-11-15', amount: -800 }, ...(flows.get('1111') ?? [])] })
  assert.equal(closed.segments[0].residual, 0)
  assert.deepEqual(closed.negative, [])
})
