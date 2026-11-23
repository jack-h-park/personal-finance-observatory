import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { FreshnessDetail, FreshnessItem } from '@/lib/adapters/portfolio-db'
import { freshnessDetailText, freshnessLabel } from '@/lib/freshness-text'

const item = (over: Partial<FreshnessItem>): FreshnessItem => ({
  key: 'kr_prices',
  label: 'kr_prices',
  category: 'price',
  status: 'fresh',
  observedAt: null,
  thresholdMs: null,
  ageMs: null,
  detail: { code: 'FX_RATE_MISSING' },
  ...over,
})

test('the English freshness detail reads as the adapter sentence did', () => {
  assert.equal(
    freshnessDetailText({ code: 'PRICE_SNAPSHOT', count: 3, marketDate: '2020-01-02' }, 'en'),
    '3 prices · market date 2020-01-02',
  )
  assert.equal(
    freshnessDetailText({ code: 'PRICE_SNAPSHOT', count: 3, marketDate: null }, 'en'),
    '3 prices · market date unknown',
  )
  assert.equal(freshnessDetailText({ code: 'CRYPTO_SNAPSHOT', count: 0, quotes: [] }, 'en'), '0 prices · none')
  // The provider a price file names is appended when it has one.
  assert.equal(
    freshnessDetailText({ code: 'PRICE_SNAPSHOT', count: 3, marketDate: '2020-01-02', source: 'Example Quotes API' }, 'en'),
    '3 prices · market date 2020-01-02 · Example Quotes API',
  )
  assert.equal(
    freshnessDetailText({ code: 'CRYPTO_SNAPSHOT', count: 1, quotes: ['Venue BTC'], source: 'Example Quotes API' }, 'ko'),
    '시세 1건 · Venue BTC · Example Quotes API',
  )
  assert.equal(freshnessDetailText({ code: 'FX_RATE_MISSING' }, 'en'), 'No FX rate configured.')
})

test('the quote time is appended, with the oldest quote only when it is over an hour behind', () => {
  const same = freshnessDetailText(
    { code: 'PRICE_SNAPSHOT', count: 2, marketDate: '2030-01-02', quotedNewest: '2030-01-02T15:00:00.000Z', quotedOldest: '2030-01-02T14:30:00.000Z' },
    'en',
  )
  assert.match(same, /^2 prices · market date 2030-01-02 · quoted \d{2}-\d{2} \d{2}:\d{2} \S+$/)
  const behind = freshnessDetailText(
    { code: 'PRICE_SNAPSHOT', count: 2, marketDate: '2030-01-02', quotedNewest: '2030-01-02T15:00:00.000Z', quotedOldest: '2030-01-02T10:00:00.000Z' },
    'ko',
  )
  assert.match(behind, /시세 시각 \d{2}-\d{2} \d{2}:\d{2} \S+ \(\d{2}-\d{2} \d{2}:\d{2} \S+\)$/)
  assert.equal(
    freshnessDetailText({ code: 'PRICE_SNAPSHOT', count: 2, marketDate: '2030-01-02', quotedNewest: null, quotedOldest: null }, 'en'),
    '2 prices · market date 2030-01-02',
  )
})

test('a snapshot label comes from copy; a source-drift label is the file name', () => {
  assert.equal(freshnessLabel(item({ key: 'kr_prices', label: 'kr_prices' }), 'ko'), '한국 주식 시세')
  assert.equal(freshnessLabel(item({ key: 'kr_prices', label: 'kr_prices' }), 'en'), 'KR prices')
  const source = item({ key: 'source:example.csv', label: 'example.csv', category: 'source' })
  assert.equal(freshnessLabel(source, 'en'), 'example.csv')
  assert.equal(freshnessLabel(source, 'ko'), 'example.csv')
})

test('every freshness detail code has a Korean sentence without English words', () => {
  const samples: FreshnessDetail[] = [
    { code: 'PRICE_SNAPSHOT', count: 2, marketDate: '2020-01-02' },
    { code: 'PRICE_SNAPSHOT', count: 2, marketDate: null },
    { code: 'CRYPTO_SNAPSHOT', count: 0, quotes: [] },
    { code: 'FX_RATE', rate: 1000, source: 'manual' },
    { code: 'FX_RATE_MISSING' },
    { code: 'SOURCE_MISSING' },
    { code: 'SOURCE_CHANGED', recordedBytes: 10, currentBytes: 12 },
    { code: 'SOURCE_MTIME_ONLY' },
    { code: 'SOURCE_MATCHES' },
    { code: 'SNAPSHOT_PRICE_DATES', markets: [{ market: 'KR', newest: '2020-01-02', oldest: '2019-12-30' }, { market: 'CRYPTO', newest: '2020-01-02', oldest: null }] },
  ]
  const allowed = new Set(['FX', 'SHA', 'USD', 'KRW'])
  const codes = new Set<string>()
  for (const detail of samples) {
    codes.add(detail.code)
    // The FX source is data the adapter passes through, not copy.
    const text = freshnessDetailText(detail, 'ko').replace('manual', '')
    assert.ok(/[가-힣]/.test(text) || detail.code === 'FX_RATE', `${detail.code}: ${text}`)
    const words = (text.match(/[A-Za-z]+/g) ?? []).filter((word) => !allowed.has(word))
    assert.deepEqual(words, [], `${detail.code}: ${text}`)
  }
  assert.equal(codes.size, 9)
})
