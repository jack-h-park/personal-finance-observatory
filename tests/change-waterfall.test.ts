import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { waterfallScale, waterfallSegments } from '@/components/ChangeWaterfall'

test('each step runs from the running total to the running total plus its value', () => {
  assert.deepEqual(
    waterfallSegments({
      start: 100,
      steps: [
        { key: 'KR', value: 20 },
        { key: 'US', value: -5 },
        { key: 'in', value: 10 },
      ],
    }),
    [
      { key: 'KR', from: 100, to: 120, positive: true },
      { key: 'US', from: 120, to: 115, positive: false },
      { key: 'in', from: 115, to: 125, positive: true },
    ],
  )
})

test('no steps gives no segments', () => {
  assert.deepEqual(waterfallSegments({ start: 50, steps: [] }), [])
})

test('the scale spans every running total with a margin, never starting at zero', () => {
  const scale = waterfallScale([1000, 1040, 1010])
  assert.ok(scale.min < 1000 && scale.min > 900)
  assert.ok(scale.max > 1040 && scale.max < 1100)
})

test('a flat scale still has width', () => {
  const scale = waterfallScale([500, 500])
  assert.ok(scale.max > scale.min)
})
