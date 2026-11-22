import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { fmtPct } from '@/lib/format'
import { fractionPct } from '@/lib/cash-inflow-format'
import { cashInflow } from '@/lib/ui-copy/pages/cashInflow'

test('a share is shown as a percent, not a fraction', () => {
  assert.equal(fmtPct(fractionPct(6000000 / 6200000)), fmtPct(96.7741935483871))
  assert.match(fmtPct(fractionPct(0.971)), /^97\.1/)
})

test('a missing share stays null', () => {
  assert.equal(fractionPct(null), null)
  assert.equal(fractionPct(undefined), null)
})

test('the yearly partial-period note describes the completed-month comparison', () => {
  assert.match(cashInflow.en.partialNote('2026'), /The change above compares completed months/)
  assert.match(cashInflow.ko.partialNote('2026'), /위 증감은 완료된 달끼리 비교합니다/)
})
