// The words on each valuation basis chip and in its popover (lib/valuation-basis-view.ts).
// Every date, price and count below is invented.
import assert from 'node:assert/strict'
import test from 'node:test'
import { valuationChip } from '../lib/valuation-basis-view'
import { getPageCopy, getUiCopy } from '../lib/ui-copy'
import type { ValuationBasisItem } from '../lib/valuation-basis'

const base: ValuationBasisItem = {
  key: 'KR',
  status: 'fresh',
  marketDate: '2030-01-04',
  quotedNewest: null,
  quotedOldest: null,
  session: null,
  fetchedAt: null,
  source: null,
  sourceUrl: null,
  exchanges: [],
  priced: 0,
  missing: 0,
}

const view = (item: Partial<ValuationBasisItem>, language: 'en' | 'ko' = 'en') =>
  valuationChip({ ...base, ...item }, {
    copy: getPageCopy('netWorth', language).valuationBasis,
    statusLabels: getUiCopy(language).freshness.labels,
    language,
  })
const row = (chip: ReturnType<typeof view>, label: string) => chip.rows.find((r) => r.label === label)?.value

test('a Korean close reads on the Seoul clock, with provider, exchanges and counts in the popover', () => {
  const chip = view({
    quotedNewest: '2030-01-04T06:30:05.000Z',
    quotedOldest: '2030-01-03T06:30:01.000Z',
    session: 'close',
    source: 'Example quotes API',
    exchanges: ['KOE', 'KSC'],
    priced: 3,
    missing: 1,
  })
  assert.equal(chip.label, 'Korean stocks')
  assert.equal(chip.summary, '01-04 15:30 KST close')
  assert.equal(chip.tone, 'success')
  assert.equal(chip.statusLabel, 'Fresh')
  assert.equal(row(chip, 'Quote time'), '01-04 15:30 KST (oldest 01-03 15:30 KST)')
  assert.equal(row(chip, 'Source'), 'Example quotes API')
  assert.equal(row(chip, 'Exchanges'), 'KOE · KSC')
  assert.equal(row(chip, 'Holdings'), '3 priced · 1 without a price')
  assert.match(chip.rule, /2 hours .* 90 minutes, otherwise after 36 hours/)
})

test('a US close reads 16:00 on the New York clock, not the next morning in Seoul', () => {
  const chip = view({ key: 'US', quotedNewest: '2030-01-04T21:00:00.000Z', session: 'close' })
  assert.equal(chip.summary, '01-04 16:00 ET close')
})

test('an intraday quote says so, in Korean too', () => {
  const chip = view({ quotedNewest: '2030-01-07T03:47:00.000Z', session: 'intraday' }, 'ko')
  assert.equal(chip.label, '한국 주식')
  assert.equal(chip.summary, '01-07 12:47 KST 장중')
})

test('a stale or missing price takes the warning or problem tone', () => {
  assert.equal(view({ status: 'stale', quotedNewest: '2030-01-04T06:30:05.000Z' }).tone, 'warning')
  const missing = view({ status: 'missing', marketDate: null })
  assert.equal(missing.tone, 'danger')
  assert.equal(missing.summary, 'no price')
})

test('FX shows its rate and market date; gold its date and that it is a close', () => {
  const fx = view({ key: 'FX', value: 1234.5, marketDate: '2030-01-04', source: 'Example quotes API' })
  assert.equal(fx.summary, '1,234.50 · 2030-01-04')
  assert.equal(row(fx, 'Rate'), '1,234.50')
  assert.match(fx.rule, /7 days/)
  const gold = view({ key: 'GOLD', value: 99000, marketDate: '2030-01-03', session: 'close' })
  assert.equal(gold.summary, '2030-01-03 close')
  assert.equal(row(gold, 'Price per gram'), '99,000')
  assert.match(gold.rule, /8 days/)
})

test('cash shows its balance date range, is not judged, and counts undated balances', () => {
  const chip = view({ key: 'CASH', status: null, marketDate: '2030-01-03', cashRange: { oldest: '2029-11-01', newest: '2030-01-03', undated: 2 } })
  assert.equal(chip.summary, '2029-11-01 – 2030-01-03')
  assert.equal(chip.tone, 'neutral')
  assert.equal(chip.statusLabel, null)
  assert.equal(row(chip, 'Balance dates'), '2029-11-01 – 2030-01-03 · 2 undated')
  assert.equal(row(chip, 'Source'), undefined)
})
