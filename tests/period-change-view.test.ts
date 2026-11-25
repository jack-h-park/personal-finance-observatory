import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { measuredDates } from '@/app/holdings/period-change-view'

test('fewer than two measured dates cannot be measured', () => {
  assert.equal(measuredDates(['2030-01-01'], [{ date: '2030-01-01' }]), null)
  assert.equal(measuredDates(['2030-01-01', '2030-01-02'], [{ date: '2030-01-01' }]), null)
  assert.equal(measuredDates([], []), null)
})

test('dates without position rows are skipped, two or more are kept', () => {
  const rows = [{ date: '2030-01-01' }, { date: '2030-01-03' }]
  assert.deepEqual(measuredDates(['2030-01-01', '2030-01-02', '2030-01-03'], rows), ['2030-01-01', '2030-01-03'])
})
