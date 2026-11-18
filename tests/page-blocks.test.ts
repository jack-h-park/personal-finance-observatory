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
  // One merged sources card: its table (the sha column) and the evidence-count line.
  for (const marker of ['copy.evidenceSummary', 'copy.evidenceDetail', 'shortHash(']) {
    const at = position.indexOf(marker)
    assert.ok(at > wrapper && at < position.indexOf('</OperatorDetails>'), `${marker} is inside OperatorDetails`)
  }
})

// A position reads lead figure, wash-sale warning, reconciliation, accounts,
// lots, then activity; the checks and mixes that repeated those cards are gone.
test('app/positions/[market]/[ticker]/page.tsx renders the Decision 10 cards in order', () => {
  const text = source('app/positions/[market]/[ticker]/page.tsx')
  for (const gone of ['copy.firstChecks', 'copy.holdingMix', 'copy.transactionMix', 'copy.accountLotProfile', 'copy.freshness}']) {
    assert.ok(!text.includes(gone), `still references ${gone}`)
  }
  assert.ok(text.includes('washSaleForTicker('))
  assert.ok(text.includes('id="position-lead"'))
  const order = ['<MetricHeroCard', 'copy.reconciliation}', 'copy.accountHoldings', 'copy.openTaxLots', 'copy.activityTimeline']
  const at = order.map((marker) => text.indexOf(marker))
  for (const [i, marker] of order.entries()) assert.ok(at[i] >= 0, `missing ${marker}`)
  for (let i = 1; i < at.length; i++) assert.ok(at[i - 1] < at[i], `${order[i - 1]} before ${order[i]}`)
  const sources = text.indexOf('rows={detail.sources}')
  assert.ok(sources > text.indexOf('<OperatorDetails') && sources < text.indexOf('</OperatorDetails>'), 'sources table inside OperatorDetails')
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

test('getRebalanceReview reads its thresholds from named constants', () => {
  const full = source('lib/adapters/portfolio-db.ts')
  const start = full.indexOf('export function getRebalanceReview')
  assert.ok(start >= 0)
  const next = full.indexOf('\nexport function', start + 1)
  const body = full.slice(start, next < 0 ? undefined : next)
  assert.ok(body.includes('MARKET_GAP_HOLD_PCT'))
  assert.ok(body.includes('SHORT_TERM_WATCH_PCT'))
  assert.ok(!body.includes('< 2 ?'))
  assert.ok(!body.includes('>= 50 &&'))
})

test('every rebalance row reason code has copy in both languages', () => {
  const codes = ['missing_market_value', 'short_term_heavy'] as const
  for (const language of ['en', 'ko'] as const) {
    const copy = getPageCopy('rebalance', language)
    for (const code of codes) {
      assert.ok(copy.reasons[code].length > 0, `${language} ${code}`)
    }
    assert.ok(copy.guardrails('2%', '10%', '50%').length > 0)
  }
})

// The allocation policy is the one model on /rebalance: no second target
// editor, no hand-typed thresholds, and the lead figure comes first.
test('app/rebalance/page.tsx reads one policy model and leads with the hero', () => {
  const text = source('app/rebalance/page.tsx')
  for (const token of ['saveRebalanceTargets', 'targetEditor', "'2%'", "'50%+'", '>2%<', '>50%+<', 'addContext.map']) {
    assert.ok(!text.includes(token), `app/rebalance/page.tsx still references ${token}`)
  }
  // A reason column must render copy, never the raw code.
  for (const line of text.split('\n').filter((l) => l.includes("key: 'reason'"))) {
    assert.ok(line.includes('render:') && line.includes('copy.reasons['), `reason column without copy: ${line.trim()}`)
  }
  for (const token of ['MARKET_GAP_HOLD_PCT', 'copy.reasons[', 'id="rebalance-lead"']) {
    assert.ok(text.includes(token), `app/rebalance/page.tsx is missing ${token}`)
  }
  const hero = text.indexOf('<MetricHeroCard')
  assert.ok(hero > -1, 'no MetricHeroCard')
  for (const later of ['title={ac.title}', 'id="rebalance-hold-watch"', 'title={copy.marketTargetGaps}']) {
    assert.ok(text.indexOf(later) > hero, `${later} renders before the hero`)
  }
  assert.ok(text.indexOf('id="rebalance-hold-watch"') < text.indexOf('title={copy.marketTargetGaps}'), 'hold/watch must follow the hero row')
})

test('app/rebalance/actions.ts no longer saves a market split', () => {
  assert.ok(!/export async function saveRebalanceTargets/.test(source('app/rebalance/actions.ts')))
  assert.ok(!source('lib/rebalance-policy.ts').includes('saveRebalancePolicy'))
})

// A phone tap needs a 24px target; the summary stays a block (flex drops the
// disclosure marker in Chromium), so the height comes from min-h-6 and leading-6.
test('app/tax-planning/page.tsx gives the lot-candidates summary a 24px target', () => {
  const text = source('app/tax-planning/page.tsx')
  const at = text.indexOf('{copy.page.allOpenLotCandidates}</summary>')
  assert.ok(at >= 0)
  const open = text.slice(text.lastIndexOf('<summary', at), at)
  assert.match(open, /\bmin-h-6\b/)
  assert.doesNotMatch(open, /\bflex\b/)
})
