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
    absent: ['StackedAssetChart', 'AssetEventList', 'topHoldingsByCost', 'freshnessTitle'],
    present: ['copy.concentrationBasis', 'copy.openTotalAssets'],
  },
  {
    path: 'app/review/page.tsx',
    absent: ['marketSummary', 'operationalReadiness', 'largestPositions'],
    present: ['copy.concentrationBasis'],
  },
  {
    // Annual filing flags and base assumptions are edited and shown on
    // /tax-settings; the planner leads with its own plan.
    path: 'app/tax-planning/page.tsx',
    absent: ['annualFilingProfile', 'baseAssumptions'],
    present: ['copy.sections.monthlyPlan', 'copy.sections.lotEstimate'],
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

test('operator detail sits behind OperatorDetails', () => {
  const health = source('app/health/page.tsx')
  const tail = health.indexOf('stderrTail')
  assert.ok(tail >= 0)
  for (let at = health.indexOf('stderrTail'); at >= 0; at = health.indexOf('stderrTail', at + 1)) {
    // The guard that decides whether to render at all is not output.
    if (health.slice(health.lastIndexOf('\n', at), at).includes('.some(')) continue
    const open = health.lastIndexOf('<OperatorDetails', at)
    const close = health.lastIndexOf('</OperatorDetails>', at)
    assert.ok(open >= 0 && open > close, 'stderrTail is outside an OperatorDetails element')
  }
  const hint = health.indexOf('refreshRunsHint')
  assert.ok(health.lastIndexOf('<OperatorDetails', hint) > health.lastIndexOf('</OperatorDetails>', hint))
  const dataMap = source('app/data-map/page.tsx')
  assert.ok(!/copy\.subtitle\([^)]*dataDir/.test(dataMap))
  assert.ok(dataMap.includes('copy.dataDir(inventory.dataDir)'))
  assert.ok(dataMap.indexOf('copy.dataDir(') > dataMap.indexOf('<OperatorDetails'))
  const position = source('app/positions/[market]/[ticker]/page.tsx')
  const wrapper = position.indexOf('<OperatorDetails')
  assert.ok(wrapper >= 0)
  for (const marker of ['copy.evidenceSummary', 'copy.lineage']) {
    const at = position.indexOf(marker)
    assert.ok(at > wrapper && at < position.indexOf('</OperatorDetails>'), `${marker} is inside OperatorDetails`)
  }
})

// The tax planner leads with the monthly plan's overview, above the toolbar
// that changes it and the scenario comparison that follows.
test('app/tax-planning/page.tsx puts the plan overview first', () => {
  const text = source('app/tax-planning/page.tsx')
  const overview = text.indexOf('<MasterPlanOverview')
  assert.ok(overview >= 0)
  assert.equal((text.match(/<form\b/g) ?? []).length, 1, 'one toolbar form')
  assert.ok(overview < text.indexOf('<form'), 'overview before the toolbar')
  assert.ok(overview < text.indexOf('<MasterScenarioComparison'), 'overview before the scenario comparison')
})
