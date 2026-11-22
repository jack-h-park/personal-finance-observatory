import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import type { BriefingActivity, BriefingMarket, BriefingPosition, BriefingSessionMove } from '@/lib/adapters/briefing-archive'
import { isFractionalTrade, reviewMarket } from '@/lib/briefing-review'

const move = (ticker: string, pctChange: number, extra: Partial<BriefingSessionMove> = {}): BriefingSessionMove => ({
  ticker, name: null, pctChange, valueChange: 0, priceFrom: 1, priceTo: 1, quantity: 1, marketValue: 1, ...extra,
})
const pos = (ticker: string, pct: number, name: string | null = null): BriefingPosition => ({
  ticker, name, cost: 1, gl: 0, pct, quantity: 1, currentPrice: 1, marketValue: 1, accounts: [],
})
const act = (ticker: string, kind: BriefingActivity['kind'], quantityChange: number): BriefingActivity => ({
  ticker, kind, quantityChange, quantity: 10, cost: 0,
})

function market(opts: {
  up?: BriefingSessionMove[]
  down?: BriefingSessionMove[]
  best?: BriefingPosition[]
  worst?: BriefingPosition[]
  activity?: BriefingActivity[]
  closed?: boolean
}): BriefingMarket {
  return {
    id: 'US', label: 'US', flag: '', currency: 'USD', symbol: '$', priceDigits: 2, moverMinCost: 0,
    holdings: { available: true, markdown: null, rows: [] },
    aggregates: {
      totals: { cost: 0, gl: 0, pct: 0, marketValue: 0, positions: 0, rows: 0 },
      positions: [], gainers: opts.best ?? [], losers: opts.worst ?? [], largest: [],
    },
    session: {
      available: true, reason: null, previousDate: '2026-10-27', marketClosed: opts.closed ?? false,
      totals: { pl: 0, plPct: 0, priorMarketValue: 0, coveredPositions: 0, uncoveredPositions: 0 },
      gainers: opts.up ?? [], losers: opts.down ?? [], activity: opts.activity ?? [],
    },
  } as BriefingMarket
}

// On the 2026-11-10 edition INTC, 005930, 000660 and 003230 each sat in both the
// session list and the cost-basis list with the same note, so the page printed
// the paragraph twice. One row per ticker, carrying both figures.
test('a ticker in both lists is shown once with both figures', () => {
  const review = reviewMarket(
    market({ up: [move('INTC', 12)], best: [pos('INTC', 40), pos('AAPL', 30)] }),
    { INTC: { why: 'Foundry news.' }, AAPL: { why: 'Services growth.' } },
  )
  assert.deepEqual(review.noted.map((n) => n.ticker), ['INTC', 'AAPL'])
  assert.equal(review.noted[0].session?.pctChange, 12)
  assert.equal(review.noted[0].vsCost?.pct, 40)
  assert.equal(review.noted[0].why, 'Foundry news.')
  assert.equal(review.noted[1].session, null)
})

// 25 cards on 11-10 said only that no note existed. They become one line each list.
test('movers without a note are listed apart, not as note rows', () => {
  const review = reviewMarket(
    market({ up: [move('DELL', 5)], down: [move('BND', -1)], best: [pos('VOO', 20)], worst: [pos('MSFT', -15)] }),
    { MSFT: { why: '   ' } },
  )
  assert.equal(review.noted.length, 0)
  assert.deepEqual(review.quietUp.map((m) => m.ticker), ['DELL'])
  assert.deepEqual(review.quietDown.map((m) => m.ticker), ['BND'])
  assert.deepEqual(review.quietBest.map((p) => p.ticker), ['VOO'])
  assert.deepEqual(review.quietWorst.map((p) => p.ticker), ['MSFT'], 'a blank note counts as no note')
})

// A cost-basis mover with no note of its own still joins the row of a session
// mover that has one, rather than turning up again in the quiet line.
test('a noted session mover absorbs its own cost-basis entry', () => {
  const review = reviewMarket(market({ down: [move('X', -9)], worst: [pos('X', -30)] }), { X: { why: 'Guidance cut.' } })
  assert.equal(review.noted.length, 1)
  assert.equal(review.quietWorst.length, 0)
  assert.equal(review.noted[0].vsCost?.pct, -30)
})

// The restatement caveat replaces the note, so such a move must keep a row even
// with no researched note — hiding it in the quiet line would hide the caveat.
test('a suspected restatement keeps its row without a note', () => {
  const review = reviewMarket(market({ down: [move('CRWD', -75, { suspectedRestatement: '4-for-1' })] }), {})
  assert.equal(review.noted.length, 1)
  assert.equal(review.noted[0].why, null)
  assert.equal(review.quietDown.length, 0)
})

test('a closed market contributes no session movers but keeps its activity', () => {
  const review = reviewMarket(
    market({ closed: true, up: [move('A', 0)], best: [pos('A', 10)], activity: [act('A', 'bought', 3)] }),
    { A: { why: 'Note.' } },
  )
  assert.equal(review.noted[0].session, null)
  assert.equal(review.noted[0].vsCost?.pct, 10)
  assert.equal(review.activity.length, 1)
})

// DELL 0.004101 and BND 0.00755 on 11-10 were dividend reinvestments, each with a row.
test('trades under one share fold into a count; position changes never do', () => {
  assert.equal(isFractionalTrade(act('DELL', 'bought', 0.004101)), true)
  assert.equal(isFractionalTrade(act('BND', 'sold', -0.00755)), true)
  assert.equal(isFractionalTrade(act('AAPL', 'bought', 1)), false)
  assert.equal(isFractionalTrade(act('X', 'closed', -0.3)), false)
  assert.equal(isFractionalTrade(act('Y', 'opened', 0.5)), false)
  assert.equal(isFractionalTrade(act('Z', 'split', 0.5)), false)
  const review = reviewMarket(market({ activity: [act('DELL', 'bought', 0.004101), act('AAPL', 'bought', 2)] }), {})
  assert.deepEqual(review.activity.map((a) => a.ticker), ['AAPL'])
  assert.deepEqual(review.fractional.map((a) => a.ticker), ['DELL'])
})

test('a ticker ranking in both cost lists is listed once', () => {
  const review = reviewMarket(market({ best: [pos('A', 5), pos('B', -5)], worst: [pos('B', -5), pos('A', 5)] }), {})
  assert.deepEqual(review.quietBest.map((p) => p.ticker), ['A', 'B'])
  assert.deepEqual(review.quietWorst.map((p) => p.ticker), [])
})
