import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { NotifyState } from '../lib/rebalance/notify'
import type { Proposal, ProposalEvent } from '../lib/rebalance/proposal-store'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-notify-'))
process.env.STOCK_REBALANCE_PROPOSALS_DIR = path.join(root, 'proposals')
process.env.STOCK_REBALANCE_NOTIFY_STATE_PATH = path.join(root, 'notify-state.json')
process.env.STOCK_ALLOCATION_POLICY_PATH = path.join(root, 'none.json')

const DAY = 86_400_000
const T0 = new Date('2026-10-01T00:00:00Z')

function proposal(over: Partial<Proposal> = {}, events: ProposalEvent[] = []): Proposal {
  const base = {
    schemaVersion: 1,
    id: 'rb-2026-10',
    kind: 'monthly',
    triggers: ['band:us_equity'],
    status: 'draft',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    expiresAt: new Date(T0.getTime() + 7 * DAY).toISOString(),
    outlook: { summary: 'Rates are easing.', drivers: [], risks: [], whatWouldChangeMyView: [], sources: [], confidence: 'medium' },
    llm: { status: 'ok', runner: 'claude', model: null, attempts: [], reason: null },
    targetChange: { decision: 'change', sleeves: { us_equity: { from: 40, to: 45, reason: 'r' } }, boundsErrors: [] },
    plan: {
      moves: [],
      instructions: [
        { kind: 'sell', brokerage: 'Secret Broker', account: 'ACC-1', ticker: 'AAA', estimatedKrw: 123_456_789 },
        { kind: 'buy', brokerage: 'Secret Broker', account: 'ACC-1', ticker: 'BBB', estimatedKrw: 987_654_321 },
      ],
      warnings: [{ code: 'wash_sale_block', message: 'Secret Broker ACC-1 blocked' }],
      taxSummary: { estimatedTaxKrw: 1_234_567 },
    },
    reconciliation: null,
    events: [{ at: T0.toISOString(), type: 'created', detail: 'x' }, ...events],
    ...over,
  }
  return base as unknown as Proposal
}

test('first run seeds without events', async () => {
  const { runRebalanceCli } = await import('../lib/rebalance/cli')
  const run = async () => {
    let out = ''
    const code = await runRebalanceCli(['notify'], { out: (t) => (out += t), err: () => {} }, T0)
    return { code, body: JSON.parse(out) }
  }
  const first = await run()
  assert.equal(first.code, 0)
  assert.deepEqual([first.body.events, first.body.seeded], [[], true])
  assert.ok(fs.existsSync(process.env.STOCK_REBALANCE_NOTIFY_STATE_PATH as string))
  const second = await run()
  assert.equal(second.body.seeded, undefined)
  assert.deepEqual(second.body.events, [])
})

test('seedState marks every current event announced on both channels', async () => {
  const { seedState, pendingEvents } = await import('../lib/rebalance/notify')
  const p = proposal({ status: 'plan_approved' }, [{ at: T0.toISOString(), type: 'plan_approved', detail: '' }])
  const state = seedState([p], T0)
  assert.equal(state.seeded, true)
  assert.deepEqual(pendingEvents([p], state, T0), [])
})

test('new proposal yields created with telegram+discord', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const events = pendingEvents([proposal()], { version: 1, seeded: true, announced: {} }, T0)
  const created = events.find((e) => e.kind === 'created')
  assert.ok(created)
  assert.equal(created.id, 'rb-2026-10:created:new')
  assert.deepEqual(created.channels, ['telegram', 'discord'])
  assert.equal(created.telegram, '🧭 Rebalance proposal rb-2026-10 (monthly) is ready for review — 2 instructions, decision change. Discuss in its Discord thread; approve on /rebalance/proposals/rb-2026-10.')
  assert.equal(created.threadTitle, '⏳ 10/1 · Rebalance rb-2026-10')
  assert.match(created.threadPrompt ?? '', /us_equity 40% -> 45%/)
  assert.match(created.threadPrompt ?? '', /about 1230000 KRW/)
  assert.match(created.threadPrompt ?? '', /sell 1, buy 1/)
})

// The control plane's run-handoff.sh delivers a composed opening only when it carries
// the <<<HANDOFF>>> marker; unmarked output is dropped and a stand-in line is posted.
test('threadPrompt asks for the hand-off marker the control plane delivers on', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const events = pendingEvents([proposal()], { version: 1, seeded: true, announced: {} }, T0)
  const prompt = events.find((e) => e.kind === 'created')?.threadPrompt ?? ''
  assert.match(prompt, /Prefix the whole message with the exact marker <<<HANDOFF>>> on its own line/)
  assert.ok(prompt.trimEnd().endsWith('output nothing else.'))
})

test('status change yields one status_changed per transition', async () => {
  const { pendingEvents, seedState } = await import('../lib/rebalance/notify')
  const before = proposal()
  const state = seedState([before], T0)
  const after = proposal({ status: 'executing' }, [
    { at: T0.toISOString(), type: 'targets_approved', detail: '' },
    { at: T0.toISOString(), type: 'plan_approved', detail: '' },
    { at: T0.toISOString(), type: 'fill', detail: 'a executed' },
    { at: T0.toISOString(), type: 'fill', detail: 'b executed' },
  ])
  const events = pendingEvents([after], state, T0)
  assert.deepEqual(events.map((e) => e.id), ['rb-2026-10:status_changed:targets_approved', 'rb-2026-10:status_changed:plan_approved', 'rb-2026-10:status_changed:executing'])
  assert.deepEqual(events.map((e) => e.channels), [['discord'], ['discord'], ['discord']])
  assert.equal(events[1].discord, '상태 변경 → 계획 승인됨')
  assert.equal(events[1].telegram, null)
})

test('expired goes to telegram too', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const p = proposal({ status: 'expired' }, [{ at: T0.toISOString(), type: 'expired', detail: '' }])
  const e = pendingEvents([p], { version: 1, seeded: true, announced: { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' }, 'rb-2026-10:llm_failed:x': {} } }, T0)
  assert.equal(e.length, 1)
  assert.equal(e[0].telegram, '⌛ Rebalance rb-2026-10 expired without approval.')
  assert.deepEqual(e[0].channels, ['telegram', 'discord'])
})

test('reminder once after 3 days in draft', async () => {
  const { pendingEvents, markSent } = await import('../lib/rebalance/notify')
  const p = proposal()
  let state: NotifyState = { version: 1, seeded: true, announced: { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' } } }
  assert.deepEqual(pendingEvents([p], state, new Date(T0.getTime() + 2 * DAY)), [])
  const due = pendingEvents([p], state, new Date(T0.getTime() + 3 * DAY))
  assert.equal(due.length, 1)
  assert.equal(due[0].id, 'rb-2026-10:reminder:draft3d')
  assert.equal(due[0].discord, '알림: 이 제안은 3일째 초안 상태입니다. 2026-10-08에 만료됩니다. /rebalance/proposals/rb-2026-10')
  assert.equal(due[0].telegram, null)
  state = markSent(state, [due[0].id], 'discord', T0)
  assert.deepEqual(pendingEvents([p], state, new Date(T0.getTime() + 5 * DAY)), [])
  // Not for a proposal past draft.
  assert.deepEqual(pendingEvents([proposal({ status: 'plan_approved' })], { ...state, announced: { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' } } }, new Date(T0.getTime() + 5 * DAY)), [])
})

test('reconcile mismatch only when missing grows', async () => {
  const { pendingEvents, markSent } = await import('../lib/rebalance/notify')
  const rec = (n: number) => ({ at: '', matched: [], unplanned: [], complete: false, missing: Array.from({ length: n }, (_, i) => ({ instructionId: `i${i}`, daysSinceFill: 1 })) })
  const base = { version: 1 as const, seeded: true, announced: { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' } } }
  const at2 = proposal({ status: 'executing', reconciliation: rec(2) })
  const first = pendingEvents([at2], base, T0)
  assert.equal(first.length, 1)
  assert.equal(first[0].id, 'rb-2026-10:reconcile_mismatch:2')
  assert.equal(first[0].telegram, '⚠️ Rebalance rb-2026-10: 2 recorded fill(s) have no matching transaction yet.')
  const sent = markSent(base, [first[0].id], 'telegram', T0)
  assert.deepEqual(pendingEvents([at2], sent, T0), [])
  assert.deepEqual(pendingEvents([proposal({ status: 'executing', reconciliation: rec(1) })], sent, T0), [])
  assert.equal(pendingEvents([proposal({ status: 'executing', reconciliation: rec(3) })], sent, T0)[0].id, 'rb-2026-10:reconcile_mismatch:3')
})

test('llm_failed on a failed monthly', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const failed = proposal({ llm: { status: 'failed', runner: 'claude', model: null, attempts: [], reason: 'timeout' } })
  const e = pendingEvents([failed], { version: 1, seeded: true, announced: { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' } } }, T0)
  assert.equal(e.length, 1)
  assert.equal(e[0].kind, 'llm_failed')
  assert.equal(e[0].telegram, '⚠️ Rebalance rb-2026-10: LLM step failed (timeout); targets held, engine plan only.')
  assert.deepEqual(pendingEvents([proposal({ kind: 'trigger', llm: failed.llm })], { version: 1, seeded: true, announced: { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' } } }, T0), [])
})

test('marking telegram leaves discord pending', async () => {
  const { pendingEvents, markSent } = await import('../lib/rebalance/notify')
  const empty = { version: 1 as const, seeded: true, announced: {} }
  const state = markSent(empty, ['rb-2026-10:created:new'], 'telegram', T0)
  const e = pendingEvents([proposal()], state, T0)
  assert.deepEqual(e.map((x) => [x.id, x.channels, x.telegram === null, x.threadPrompt === null]), [['rb-2026-10:created:new', ['discord'], true, false]])
  assert.deepEqual(pendingEvents([proposal()], markSent(state, ['rb-2026-10:created:new'], 'discord', T0), T0), [])
})

test('deleted proposal entries are dropped', async () => {
  const { markSent } = await import('../lib/rebalance/notify')
  const state = { version: 1 as const, seeded: true, announced: { 'rb-gone:created:new': { telegram: 'x' }, 'rb-2026-10:created:new': { telegram: 'x' } } }
  const next = markSent(state, ['rb-2026-10:created:new'], 'discord', T0, [proposal()])
  assert.deepEqual(Object.keys(next.announced), ['rb-2026-10:created:new'])
})

test('telegram text has no account label or amount', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const p = proposal({ status: 'executing', llm: { status: 'failed', runner: 'c', model: null, attempts: [], reason: 'timeout' } })
  const events = pendingEvents([p], { version: 1, seeded: true, announced: {} }, new Date(T0.getTime() + 4 * DAY))
  const texts = events.map((e) => e.telegram).filter((t): t is string => t !== null)
  assert.ok(texts.length >= 2)
  for (const t of texts) assert.doesNotMatch(t, /Secret Broker|ACC-1|123|987|KRW|₩/)
})

test('threadPrompt has no account label', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const e = pendingEvents([proposal()], { version: 1, seeded: true, announced: {} }, T0).find((x) => x.kind === 'created')
  assert.ok(e?.threadPrompt)
  assert.doesNotMatch(e.threadPrompt, /Secret Broker|ACC-1|AAA|BBB|123456789|987654321/)
  assert.match(e.threadPrompt, /Write a short opening \(≤ 1,200 chars\)/)
})

test('--mark records ids per channel and drops unknown proposals', async () => {
  const { runRebalanceCli } = await import('../lib/rebalance/cli')
  const { readNotifyState } = await import('../lib/rebalance/notify')
  let out = ''
  const code = await runRebalanceCli(['notify', '--mark', 'rb-x:created:new,rb-x:reminder:draft3d', '--channel', 'telegram'], { out: (t) => (out += t), err: () => {} }, T0)
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).ok, true)
  // No proposals exist on disk, so unknown-proposal entries are pruned.
  assert.deepEqual(readNotifyState()?.announced, {})
  let err = ''
  assert.equal(await runRebalanceCli(['notify', '--mark', 'a:b:c'], { out: () => {}, err: (t) => (err += t) }, T0), 2)
  assert.match(err, /--channel/)
})

test('threadPrompt skips a sleeve change missing from or to (no "undefined%")', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const p = proposal({
    targetChange: { decision: 'change', sleeves: { us_equity: { from: 40, to: 45, reason: 'r' }, kr_equity: undefined, bonds: { from: null, to: 10, reason: 'r' } }, boundsErrors: [] } as never,
  })
  const e = pendingEvents([p], { version: 1, seeded: true, announced: {} }, T0).find((x) => x.kind === 'created')
  assert.ok(e?.threadPrompt)
  assert.match(e.threadPrompt, /Decision: change \(us_equity 40% -> 45%\)\./)
  assert.doesNotMatch(e.threadPrompt, /undefined|null%/)
})

test('threadMaterial carries the full outlook, every idea and question, and the harvest line; facts only', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const long = `${'Rates are easing across the curve. '.repeat(50)}END-MARKER`
  const p = proposal({
    outlook: { summary: long, drivers: [], risks: [], whatWouldChangeMyView: [], sources: [], confidence: 'high' },
    ideas: [
      { market: 'KR', ticker: '000001', sleeve: 'kr_equity', why: `Margins recovering. ${'x'.repeat(300)}` },
      { market: 'US', ticker: 'ZZZ', sleeve: 'us_equity', why: 'Cheap on earnings.' },
    ],
    questionsForMaintainer: ['Is the cash floor still right?', 'Any planned withdrawal this year?'],
    harvest: { totalLossKrw: 12_345_678, taxEffectKrw: -2_345_678 } as never,
  } as Partial<Proposal>)
  const e = pendingEvents([p], { version: 1, seeded: true, announced: {} }, T0).find((x) => x.kind === 'created')!
  const m = e.threadMaterial ?? ''
  assert.ok(m)
  // The summary is kept up to 1,500 characters (this one is longer, so it is cut and marked).
  assert.ok(m.includes(long.slice(0, 1_400)))
  assert.ok(!m.includes('END-MARKER'))
  assert.match(m, /Outlook \(high confidence\): Rates are easing/)
  assert.match(m, /^- KR:000001 \(kr_equity\) — Margins recovering\. x+…$/m)
  const ideaLine = m.split('\n').find((l) => l.startsWith('- KR:000001'))!
  assert.ok(ideaLine.length < 240, 'the why is capped near 200 characters')
  assert.match(m, /^- US:ZZZ \(us_equity\) — Cheap on earnings\.$/m)
  assert.match(m, /^- Is the cash floor still right\?$/m)
  assert.match(m, /^- Any planned withdrawal this year\?$/m)
  assert.match(m, /about 12350000 KRW of losses, a tax effect of about -2350000 KRW/)
  assert.match(m, /Estimated tax effect of the plan: about 1230000 KRW\./)
  assert.match(m, /^Page: \/rebalance\/proposals\/rb-2026-10$/m)
  // Facts only: the writing instructions and the hand-off marker live in the fallback prompt.
  assert.doesNotMatch(m, /HANDOFF|Write a short opening/)
  assert.ok(e.threadPrompt?.startsWith(m), 'the fallback prompt is the material plus instructions')
  assert.match(e.threadPrompt ?? '', /Prefix the whole message with the exact marker <<<HANDOFF>>> on its own line; output nothing else\.$/)
})

test('threadMaterial without ideas, questions or harvest says so briefly; other events carry none', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const p = proposal({ status: 'plan_approved' }, [{ at: T0.toISOString(), type: 'plan_approved', detail: '' }])
  const events = pendingEvents([p], { version: 1, seeded: true, announced: {} }, T0)
  const m = events.find((x) => x.kind === 'created')?.threadMaterial ?? ''
  assert.match(m, /^Ideas: none\.$/m)
  assert.doesNotMatch(m, /Questions for the maintainer|Loss harvest/)
  for (const e of events.filter((x) => x.kind !== 'created')) assert.equal(e.threadMaterial, null)
})

test('threadMaterial has no account label', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const e = pendingEvents([proposal()], { version: 1, seeded: true, announced: {} }, T0).find((x) => x.kind === 'created')
  assert.ok(e?.threadMaterial)
  assert.doesNotMatch(e.threadMaterial, /Secret Broker|ACC-1|AAA|BBB|123456789|987654321/)
})

test('an answered question sends nothing, and answers stay out of the thread material', async () => {
  const { pendingEvents, seedState } = await import('../lib/rebalance/notify')
  const before = proposal({ status: 'rejected' }, [{ at: T0.toISOString(), type: 'rejected', detail: 'no' }])
  const state = seedState([before], T0)
  const after = proposal(
    {
      status: 'rejected',
      questionsForMaintainer: ['Any planned withdrawal this year?'],
      answers: [{ index: 0, question: 'Any planned withdrawal this year?', answer: 'ANSWER-MARKER', at: T0.toISOString() }],
    } as Partial<Proposal>,
    [
      { at: T0.toISOString(), type: 'rejected', detail: 'no' },
      { at: T0.toISOString(), type: 'answered', detail: 'question 1 answered' },
    ],
  )
  assert.deepEqual(pendingEvents([after], state, T0), [])
  const fresh = pendingEvents([after], { version: 1, seeded: true, announced: {} }, T0)
  assert.ok(!fresh.some((e) => JSON.stringify(e).includes('ANSWER-MARKER')))
  assert.ok(!fresh.some((e) => e.id.includes('answered')))
})

// --- The Korean thread messages --------------------------------------------------------------------------
//
// The Discord opening and status lines are a Korean template built from the proposal's data alone. Fixture
// figures are invented; the account labels and instruction tickers below must never appear.

const policyAtCreation = {
  version: 1,
  bounds: { sleeves: {}, positionCapPct: 10, maxTargetShiftPctPerCycle: 5, maxTurnoverPctPerProposal: 20, minTradeKrw: 100_000, staleDataDays: 7, harvestThresholdKrw: 1_000_000 },
  targets: {
    kr_equity: { target: 20, band: 5 },
    us_equity: { target: 45, band: 5 },
    bonds: { target: 5, band: 2.5 },
    gold: { target: 10, band: 2 },
    crypto: { target: 5, band: 2 },
    cash: { target: 15, band: 5 },
  },
  preferredInstruments: {},
  accounts: {},
  history: [],
}

/** A trigger proposal: gold above its band, held, no trades, warnings and a harvest scenario, no LLM. */
const bandHold = (over: Partial<Proposal> = {}) =>
  proposal({
    id: 'rb-2026-10-01-band',
    kind: 'trigger',
    triggers: ['band:gold', 'harvest'],
    outlook: null,
    llm: null,
    ideas: [],
    questionsForMaintainer: [],
    policyAtCreation,
    targetChange: { decision: 'hold', sleeves: {}, boundsErrors: [] },
    plan: {
      moves: [{ sleeve: 'gold', fromPct: 12.4321, toPct: 12, amountKrw: -4_000_000 }],
      instructions: [],
      warnings: [
        { code: 'wash_sale_block', message: 'Secret Broker ACC-1 blocked' },
        { code: 'unclassified', message: 'x' },
        { code: 'unclassified', message: 'y' },
        { code: 'mystery_code', message: 'z' },
      ],
      taxSummary: { estimatedTaxKrw: 0 },
    },
    harvest: { totalLossKrw: 12_345_678, taxEffectKrw: -2_345_678 },
    ...over,
  } as unknown as Partial<Proposal>)

/** A monthly proposal with a Korean outlook summary, ideas and a target change. */
const monthlyChange = (over: Partial<Proposal> = {}) =>
  proposal({
    policyAtCreation,
    triggers: ['monthly'],
    outlook: { summary: 'Rates are easing.', summaryKo: '금리가 내려가고 있습니다. 채권 비중을 조금 늘립니다.', drivers: [], risks: [], whatWouldChangeMyView: [], sources: [], confidence: 'high' },
    ideas: [
      { market: 'US', ticker: 'ZZZ', sleeve: 'us_equity', why: 'Cheap on earnings.', whyKo: '실적 대비 저렴합니다.' },
      { market: 'KR', ticker: '000001', sleeve: 'kr_equity', why: 'Margins recovering.' },
    ],
    questionsForMaintainer: ['Is the cash floor still right?'],
    targetChange: { decision: 'change', sleeves: { us_equity: { from: 45, to: 42, reason: 'r' }, bonds: { from: 5, to: 8, reason: 'r' } }, boundsErrors: [] },
    ...over,
  } as unknown as Partial<Proposal>)

const openingOf = async (p: Proposal, opts: Record<string, unknown> = {}) => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const e = pendingEvents([p], { version: 1, seeded: true, announced: {} }, T0, opts).find((x) => x.kind === 'created')
  assert.ok(e?.discordOpening)
  return { text: e.discordOpening, quotesModel: e.discordOpeningQuotesModel }
}

test('Korean opening: a band trigger held with no LLM, warnings and a harvest scenario', async () => {
  const { text, quotesModel } = await openingOf(bandHold())
  assert.equal(
    text,
    [
      '🧭 리밸런싱 제안 rb-2026-10-01-band · 범위 이탈(금), 손실 확정 기회',
      '판단: 유지 · 매매 지시 0건 · 예상 세금 영향 0원',
      '금: 현재 12.43% / 목표 10% (허용 8–12%)',
      '⚠️ 경고 4건: wash sale 차단 1 · 미분류 종목 2 · mystery_code 1',
      '참고 · 손실 확정 시나리오(계획에 없음): 손실 약 1,235만 원 확정 시 올해 세금 약 -235만 원',
      '할 일: 경고 확인 후 페이지에서 종료',
      '/rebalance/proposals/rb-2026-10-01-band',
    ].join('\n'),
  )
  assert.equal(quotesModel, false, 'nothing in it was written by a model')
  // No outlook means no outlook line, and never the English in its place.
  assert.doesNotMatch(text, /전망|아이디어|질문/)
})

test('Korean opening: a monthly proposal with summaryKo, ideas, a target change and a question', async () => {
  const { text, quotesModel } = await openingOf(monthlyChange(), { baseUrl: 'https://stock.example.test/' })
  assert.equal(
    text,
    [
      '🧭 리밸런싱 제안 rb-2026-10 · 월간 점검',
      '판단: 목표 변경 · 매매 지시 2건 · 예상 세금 영향 +123만 원',
      '목표 변경: 미국주식 45% → 42% · 채권 5% → 8%',
      '전망(신뢰도 높음): 금리가 내려가고 있습니다. 채권 비중을 조금 늘립니다.',
      '아이디어(자동 매매 없음):',
      '- US:ZZZ (미국주식) — 실적 대비 저렴합니다.',
      '- KR:000001 (한국주식)',
      '⚠️ 경고 1건: wash sale 차단 1',
      '질문 1개 — 페이지에서 답변할 수 있습니다',
      '할 일: 페이지에서 목표 변경을 검토하고 목표 승인',
      'https://stock.example.test/rebalance/proposals/rb-2026-10',
    ].join('\n'),
  )
  assert.equal(quotesModel, true)
  assert.doesNotMatch(text, /Rates are easing|Cheap on earnings|Margins recovering/)
})

test('Korean opening: an outlook without summaryKo prints no outlook line; ideas beyond five are counted', async () => {
  const ideas = Array.from({ length: 7 }, (_, i) => ({ market: 'US', ticker: `T${i}`, sleeve: 'gold', why: 'English only.' }))
  const p = monthlyChange({ outlook: { summary: 'English only.', drivers: [], risks: [], whatWouldChangeMyView: [], sources: [], confidence: 'low' }, ideas } as never)
  const { text, quotesModel } = await openingOf(p)
  assert.doesNotMatch(text, /전망|English only/)
  assert.match(text, /^- US:T4 \(금\)$/m)
  assert.doesNotMatch(text, /T5|T6/)
  assert.match(text, /^- 외 2건은 페이지에서$/m)
  assert.equal(quotesModel, false)
})

test('Korean opening: the page link is absolute only with a usable http(s) base', async () => {
  for (const baseUrl of [undefined, null, '', 'not a url', 'ftp://x']) {
    const { text } = await openingOf(bandHold(), { baseUrl })
    assert.equal(text.split('\n').at(-1), '/rebalance/proposals/rb-2026-10-01-band', String(baseUrl))
  }
  const { text } = await openingOf(bandHold(), { baseUrl: 'https://stock.example.test' })
  assert.equal(text.split('\n').at(-1), 'https://stock.example.test/rebalance/proposals/rb-2026-10-01-band')
})

test('Korean opening: the notify CLI reads STOCK_OBSERVATORY_BASE_URL', async () => {
  const { runRebalanceCli } = await import('../lib/rebalance/cli')
  const dir = process.env.STOCK_REBALANCE_PROPOSALS_DIR as string
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'rb-2026-10-01-band.json'), JSON.stringify(bandHold()))
  fs.writeFileSync(process.env.STOCK_REBALANCE_NOTIFY_STATE_PATH as string, JSON.stringify({ version: 1, seeded: true, announced: {} }))
  const listed = async () => {
    let out = ''
    await runRebalanceCli(['notify'], { out: (t) => (out += t), err: () => {} }, T0)
    return (JSON.parse(out).events as { kind: string; discordOpening: string }[]).find((e) => e.kind === 'created')!.discordOpening
  }
  try {
    process.env.STOCK_OBSERVATORY_BASE_URL = 'https://stock.example.test'
    assert.match(await listed(), /\nhttps:\/\/stock\.example\.test\/rebalance\/proposals\/rb-2026-10-01-band$/)
    delete process.env.STOCK_OBSERVATORY_BASE_URL
    assert.match(await listed(), /\n\/rebalance\/proposals\/rb-2026-10-01-band$/)
  } finally {
    delete process.env.STOCK_OBSERVATORY_BASE_URL
    fs.rmSync(path.join(dir, 'rb-2026-10-01-band.json'))
    fs.rmSync(process.env.STOCK_REBALANCE_NOTIFY_STATE_PATH as string)
  }
})

test('Korean opening: a cap trigger shows the frozen position weight when the classes are given', async () => {
  const p = bandHold({
    triggers: ['cap:US:QQQ'],
    harvest: undefined,
    plan: { moves: [], instructions: [{ kind: 'sell', brokerage: 'Secret Broker', account: 'ACC-1', ticker: 'QQQ', estimatedKrw: 5 }], warnings: [], taxSummary: { estimatedTaxKrw: 345_000 } },
    inputSnapshot: {
      positions: [
        { brokerage: 'Secret Broker', account: 'ACC-1', market: 'US', currency: 'USD', ticker: 'QQQ', name: 'q', asset_class: 'etf', quantity: 1, valueKrw: 1_250_000, costKrw: 1, dataAsOf: null },
        { brokerage: 'Secret Broker', account: 'ACC-1', market: 'US', currency: 'USD', ticker: 'BIG', name: 'b', asset_class: 'etf', quantity: 1, valueKrw: 8_750_000, costKrw: 1, dataAsOf: null },
      ],
      cash: [],
    },
  } as never)
  const withClasses = (await openingOf(p, { classes: { 'US:QQQ': 'us_equity', 'US:BIG': 'us_equity' } })).text
  assert.match(withClasses, /^🧭 리밸런싱 제안 rb-2026-10-01-band · 종목 비중 한도 초과\(US:QQQ\)$/m)
  assert.match(withClasses, /^US:QQQ: 비중 12\.5% \/ 한도 10%$/m)
  assert.match(withClasses, /예상 세금 영향 \+35만 원/)
  assert.match(withClasses, /^할 일: 페이지에서 매매 계획을 검토하고 계획 승인$/m)
  // Without classes (or with an empty file) the weight is left out rather than measured against cash alone.
  for (const classes of [undefined, {}]) {
    assert.match((await openingOf(p, { classes })).text, /^US:QQQ: 한도 10% 초과$/m)
  }
})

test('Korean labels cover every sleeve, warning code, confidence and trigger kind', async () => {
  const sleeves = ['kr_equity', 'us_equity', 'bonds', 'gold', 'crypto', 'cash']
  const codes = ['wash_sale_block', 'near_long_term', 'unclassified', 'unpriced', 'transfer_needed', 'stale_account', 'turnover_capped', 'below_min_trade', 'cash_floor', 'no_sellable_lots', 'no_buy_price', 'no_buy_list', 'managed_account']
  const p = bandHold({
    triggers: [...sleeves.map((s) => `band:${s}`), 'yearend:2026-11-15', 'manual', 'free text trigger'],
    plan: { moves: [], instructions: [], warnings: codes.map((code) => ({ code, message: '' })), taxSummary: { estimatedTaxKrw: -5_000 } },
    harvest: undefined,
  } as never)
  const { text } = await openingOf(p)
  assert.match(text, /범위 이탈\(한국주식·미국주식·채권·금·암호화폐·현금\), 연말 점검, 수동 요청, free text trigger/)
  // A band line without a frozen move still names target and band.
  assert.match(text, /^채권: 목표 5% \(허용 2\.5–7\.5%\)$/m)
  for (const code of codes) assert.doesNotMatch(text.split('\n').find((l) => l.startsWith('⚠️'))!, new RegExp(`\\b${code}\\b`), code)
  assert.match(text, /⚠️ 경고 13건: /)
  // A tax effect under 5,000 rounds to zero, the way the English material rounds it.
  assert.match(text, /예상 세금 영향 0원/)
  for (const [confidence, ko] of [['low', '낮음'], ['medium', '보통'], ['high', '높음']]) {
    const m = monthlyChange({ outlook: { summary: 's', summaryKo: '요약', drivers: [], risks: [], whatWouldChangeMyView: [], sources: [], confidence } } as never)
    assert.match((await openingOf(m)).text, new RegExp(`^전망\\(신뢰도 ${ko}\\): 요약$`, 'm'))
  }
})

test('Korean opening: the next step follows the status and the plan', async () => {
  const steps = async (p: Proposal) => (await openingOf(p)).text.split('\n').find((l) => l.startsWith('할 일:')) ?? null
  assert.equal(await steps(bandHold({ plan: { moves: [], instructions: [], warnings: [], taxSummary: { estimatedTaxKrw: 0 } } } as never)), '할 일: 매매할 것이 없으니 페이지에서 종료')
  assert.equal(await steps(monthlyChange({ status: 'targets_approved' })), '할 일: 페이지에서 매매 계획을 검토하고 계획 승인')
  assert.equal(await steps(monthlyChange({ status: 'executing' })), '할 일: 지시대로 직접 주문하고 체결을 페이지에 기록')
  assert.equal(await steps(monthlyChange({ status: 'reconciled' })), '할 일: 페이지에서 종료')
  assert.equal(await steps(monthlyChange({ status: 'rejected' })), null)
})

test('Korean opening has no account label, instruction ticker or unrounded amount', async () => {
  for (const p of [proposal(), bandHold(), monthlyChange()]) {
    const { text } = await openingOf(p)
    assert.doesNotMatch(text, /Secret Broker|ACC-1|AAA|BBB|123456789|987654321|123,456,789|987,654,321/)
  }
})

test('Korean opening is only on created events and only while discord is pending', async () => {
  const { pendingEvents, markSent } = await import('../lib/rebalance/notify')
  const p = monthlyChange({ status: 'plan_approved' }, )
  const withStatus = proposal({ ...p, status: 'plan_approved' } as never, [{ at: T0.toISOString(), type: 'plan_approved', detail: '' }])
  const events = pendingEvents([withStatus], { version: 1, seeded: true, announced: {} }, T0)
  for (const e of events.filter((x) => x.kind !== 'created')) {
    assert.equal(e.discordOpening, null)
    assert.equal(e.discordOpeningQuotesModel, false)
  }
  const tgOnly = markSent({ version: 1, seeded: true, announced: {} }, ['rb-2026-10:created:new'], 'discord', T0)
  const created = pendingEvents([withStatus], tgOnly, T0).find((x) => x.kind === 'created')!
  assert.deepEqual(created.channels, ['telegram'])
  assert.equal(created.discordOpening, null)
})

test('Korean status lines: every status, a close without trades, and an expiry; Telegram stays English', async () => {
  const { pendingEvents } = await import('../lib/rebalance/notify')
  const seen = { 'rb-2026-10:created:new': { telegram: 'x', discord: 'x' } }
  const linesFor = (events: ProposalEvent[], status: string) =>
    pendingEvents([proposal({ status } as never, events)], { version: 1, seeded: true, announced: seen }, T0).filter((e) => e.kind === 'status_changed')
  const at = T0.toISOString()
  const full = linesFor(
    ['targets_approved', 'plan_approved', 'fill', 'reconciled', 'closed'].map((type) => ({ at, type, detail: '' }) as ProposalEvent),
    'closed',
  )
  assert.deepEqual(full.map((e) => e.discord), ['상태 변경 → 목표 승인됨', '상태 변경 → 계획 승인됨', '상태 변경 → 실행 중', '상태 변경 → 거래 대조 완료', '상태 변경 → 종료됨'])
  assert.deepEqual(linesFor([{ at, type: 'closed', detail: '' }], 'closed').map((e) => e.discord), ['상태 변경 → 거래 없이 종료됨'])
  assert.deepEqual(linesFor([{ at, type: 'rejected', detail: '' }], 'rejected').map((e) => e.discord), ['상태 변경 → 거절됨'])
  const expired = linesFor([{ at, type: 'expired', detail: '' }], 'expired')
  assert.equal(expired[0].discord, '상태 변경 → 만료됨 (승인 없이 기한이 지났습니다)')
  assert.equal(expired[0].telegram, '⌛ Rebalance rb-2026-10 expired without approval.')
})

// A trigger appended while the proposal was open is stored as `<key>: <label>`, and the same key can be appended
// again on later days. The opening reads each key once, groups the sleeves, and takes an appended band trigger's
// distance from its latest label, since no move was frozen for it.
test('Korean opening: appended triggers are read by key, once each, grouped in the first line', async () => {
  const p = bandHold({
    triggers: [
      'band:gold',
      'yearend:2026-11-15: year-end review from 2026-11-15',
      'band:kr_equity: kr_equity 0.5pp outside band',
      'band:gold: gold 0.1pp outside band',
      'band:kr_equity: kr_equity 0.8pp outside band',
      'harvest: harvestable loss at or above the threshold',
    ],
  } as never)
  const { text } = await openingOf(p)
  const first = text.split('\n')[0]
  assert.equal(first, '🧭 리밸런싱 제안 rb-2026-10-01-band · 범위 이탈(금·한국주식), 연말 점검, 손실 확정 기회')
  assert.doesNotMatch(text, /outside band|year-end review|harvestable loss/, 'no English label leaks into the message')
  assert.match(text, /^금: 현재 12\.43% \/ 목표 10% \(허용 8–12%\)$/m)
  assert.match(text, /^한국주식: 범위를 0\.8pp 벗어남\(제안 생성 후 추가\) \/ 목표 /m)
  assert.equal(text.split('\n').filter((l) => l.startsWith('금:')).length, 1, 'a key appended twice prints one line')
})

test('triggerKeyOf reads both stored shapes', async () => {
  const { triggerKeyOf } = await import('../lib/rebalance/notify')
  assert.equal(triggerKeyOf('band:gold'), 'band:gold')
  assert.equal(triggerKeyOf('band:kr_equity: kr_equity 0.8pp outside band'), 'band:kr_equity')
  assert.equal(triggerKeyOf('cap:KR:005930: weight above cap'), 'cap:KR:005930')
  assert.equal(triggerKeyOf('yearend:2026-11-15: year-end review from 2026-11-15'), 'yearend:2026-11-15')
  assert.equal(triggerKeyOf('harvest: harvestable loss at or above the threshold'), 'harvest')
  assert.equal(triggerKeyOf('free text trigger'), 'free text trigger')
})
