import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Each block renders on the page that owns it. The overview and the review
 * page used to repeat blocks that other pages own (the total-assets history on
 * /net-worth, dividends on /income, freshness on /health, positions on
 * /holdings); these source assertions keep them from drifting back.
 */
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const BLOCKS: { path: string; absent: string[]; present: string[] }[] = [
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
