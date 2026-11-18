import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { getPageCopy } from '@/lib/ui-copy'

/**
 * Each block renders on the page that owns it. The overview and the review
 * page used to repeat blocks that other pages own (the total-assets history on
 * /net-worth, dividends on /income, freshness on /health, positions on
 * /holdings); these source assertions keep them from drifting back.
 */
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const BLOCKS: { path: string; absent: string[]; present: string[] }[] = [
  {
    path: 'app/net-worth/page.tsx',
    absent: ['getForeignAccountMaxima', 'fbarYear'],
    present: [],
  },
  {
    path: 'app/fbar/page.tsx',
    absent: [],
    present: ['getForeignAccountMaxima'],
  },
  {
    path: 'app/page.tsx',
    absent: ['getTransactionTypes', 'getDividendByYear', 'StackedAssetChart', 'AssetEventList', 'topHoldingsByCost', 'freshnessTitle'],
    present: ['copy.concentrationBasis', 'copy.openTotalAssets'],
  },
  {
    path: 'app/review/page.tsx',
    absent: ['marketSummary', 'operationalReadiness', 'largestPositions'],
    present: ['copy.concentrationBasis'],
  },
]

for (const { path, absent, present } of BLOCKS) {
  test(`${path} renders only the blocks it owns`, () => {
    const text = source(path)
    for (const token of absent) assert.ok(!text.includes(token), `${path} still references ${token}`)
    for (const token of present) assert.ok(text.includes(token), `${path} is missing ${token}`)
  })
}

// A template literal whose last character is a bare `$` appends a literal
// dollar sign to the URL (`...&view=single$` parses as an unknown view), and
// nothing else in the build or the type system catches it.
for (const path of ['app/page.tsx', 'app/review/page.tsx']) {
  test(`${path} has no template literal that ends in a stray $`, () => {
    const lines = source(path).split('\n')
    const stray = lines.flatMap((line, i) => (/[^\\]\$`/.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : []))
    assert.deepEqual(stray, [])
  })
}

// The review page's intro names only the blocks it still shows; freshness and
// operational readiness live on /health.
test('review copy describes only the blocks the page shows', () => {
  for (const [language, gone] of [['en', /freshness|operational/i], ['ko', /최신성|운영/]] as const) {
    const copy = getPageCopy('review', language)
    for (const value of [copy.subtitle, copy.readOrder]) assert.doesNotMatch(value, gone, `${language}: ${value}`)
  }
})
