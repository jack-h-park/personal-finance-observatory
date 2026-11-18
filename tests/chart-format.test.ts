import assert from 'node:assert/strict'
import { test } from 'node:test'
import { axisTick, hasPlottablePoint, tooltipValue, type ChartUnit } from '../lib/chart-format'
import { EMPTY_VALUE, fmtMoney, fmtPct } from '../lib/format'

const KRW: ChartUnit = { kind: 'money', currency: 'KRW' }
const USD: ChartUnit = { kind: 'money', currency: 'USD' }

test('axisTick ko KRW reads in 만 and 억', () => {
  assert.equal(axisTick(0, KRW, 'ko'), '0')
  assert.equal(axisTick(9_999, KRW, 'ko'), '9,999')
  assert.equal(axisTick(10_000, KRW, 'ko'), '1만')
  assert.equal(axisTick(35_000_000, KRW, 'ko'), '3,500만')
  // Rounding reaches 10,000만, so the tick promotes to the next unit.
  assert.equal(axisTick(99_999_999, KRW, 'ko'), '1억')
  assert.equal(axisTick(100_000_000, KRW, 'ko'), '1억')
  assert.equal(axisTick(120_000_000, KRW, 'ko'), '1.2억')
  assert.equal(axisTick(-120_000_000, KRW, 'ko'), '-1.2억')
})

test('axisTick ko KRW rounds half away from zero', () => {
  assert.equal(axisTick(125_000_000, KRW, 'ko'), '1.3억')
  assert.equal(axisTick(-125_000_000, KRW, 'ko'), '-1.3억')
  assert.equal(axisTick(15_000, KRW, 'ko'), '2만')
  assert.equal(axisTick(-9_999, KRW, 'ko'), '-9,999')
})

test('axisTick en KRW reads in K and M', () => {
  assert.equal(axisTick(0, KRW, 'en'), '0')
  assert.equal(axisTick(900, KRW, 'en'), '₩900')
  assert.equal(axisTick(9_999, KRW, 'en'), '₩10K')
  assert.equal(axisTick(10_000, KRW, 'en'), '₩10K')
  assert.equal(axisTick(350_000, KRW, 'en'), '₩350K')
  assert.equal(axisTick(999_999, KRW, 'en'), '₩1M')
  assert.equal(axisTick(1_200_000, KRW, 'en'), '₩1.2M')
  assert.equal(axisTick(99_999_999, KRW, 'en'), '₩100M')
  assert.equal(axisTick(100_000_000, KRW, 'en'), '₩100M')
  assert.equal(axisTick(-1_200_000, KRW, 'en'), '-₩1.2M')
  assert.equal(axisTick(-120_000_000, KRW, 'en'), '-₩120M')
})

test('axisTick USD ignores language', () => {
  assert.equal(axisTick(1_500, USD, 'ko'), '$1.5K')
  assert.equal(axisTick(1_500, USD, 'en'), '$1.5K')
  assert.equal(axisTick(1_200_000, USD, 'ko'), '$1.2M')
  assert.equal(axisTick(900, USD, 'en'), '$900')
  assert.equal(axisTick(-350_000, USD, 'en'), '-$350K')
})

test('axisTick percent and number', () => {
  assert.equal(axisTick(12.34, { kind: 'percent' }, 'en'), fmtPct(12.34, { digits: 0 }))
  assert.equal(axisTick(1_380.5, { kind: 'number' }, 'ko'), '1,381')
  assert.equal(axisTick(5, { kind: 'number', suffix: 'x' }, 'en'), '5x')
})

test('axisTick never prints NaN', () => {
  assert.equal(axisTick(Number.NaN, KRW, 'ko'), '')
  assert.equal(axisTick(Number.POSITIVE_INFINITY, USD, 'en'), '')
})

test('tooltipValue money is the full amount', () => {
  assert.equal(tooltipValue(123_456_789, KRW, 'ko'), fmtMoney(123_456_789, 'KRW'))
  assert.equal(tooltipValue(1_234.5, USD, 'en'), fmtMoney(1_234.5, 'USD'))
  assert.equal(tooltipValue(null, KRW, 'ko'), EMPTY_VALUE)
  assert.equal(tooltipValue(undefined, USD, 'en'), EMPTY_VALUE)
  assert.equal(tooltipValue(Number.NaN, USD, 'en'), EMPTY_VALUE)
  assert.equal(tooltipValue(1.234, { kind: 'percent' }, 'en'), fmtPct(1.234))
})

test('hasPlottablePoint needs one finite value in a series key', () => {
  assert.equal(hasPlottablePoint([], ['value']), false)
  assert.equal(hasPlottablePoint([{ date: 'a', value: null }, { date: 'b', value: null }], ['value']), false)
  assert.equal(hasPlottablePoint([{ date: 'a', value: Number.NaN }], ['value']), false)
  assert.equal(hasPlottablePoint([{ date: 'a', value: null }, { date: 'b', value: 3 }], ['value']), true)
  assert.equal(hasPlottablePoint([{ date: 'a', other: 3 }], ['value']), false)
})
