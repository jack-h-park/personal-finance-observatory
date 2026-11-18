import fs from 'node:fs'
import path from 'node:path'
import { config } from '@/config'
import { bandEdges, computeAllocation } from './allocation'
import type { EngineWarningCode } from './engine'
import type { InstrumentClasses } from './instrument-classes'
import type { Proposal } from './proposal-store'

export type NotifyChannel = 'telegram' | 'discord'
export type NotifyEvent = {
  /** `${proposalId}:${kind}:${detail}`, stable across runs. */
  id: string
  proposalId: string
  kind: 'created' | 'status_changed' | 'reminder' | 'reconcile_mismatch' | 'llm_failed'
  /** Status name, count or reason code. */
  detail: string
  /** The channels this event has not yet been sent on. */
  channels: NotifyChannel[]
  telegram: string | null
  discord: string | null
  threadTitle: string | null
  /**
   * `created` only: the proposal's facts for the thread opening, no instructions. The cron wrapper puts the
   * control plane's shared opening contract in front of it when that contract is available.
   */
  threadMaterial: string | null
  /** `created` only: threadMaterial plus this repo's own writing instructions; the fallback when the contract is not. */
  threadPrompt: string | null
  /**
   * `created` only: the Korean thread opening, rendered from the proposal's data alone (no model at send time). The
   * cron wrapper delivers it verbatim when the control plane supports `--body-file`; threadMaterial/threadPrompt
   * are the fallback when it does not.
   */
  discordOpening: string | null
  /**
   * `created` only: true when discordOpening quotes Korean text a model wrote with the proposal (outlook.summaryKo,
   * an idea's whyKo), so the delivered footer can say the text was pre-written by a model.
   */
  discordOpeningQuotesModel: boolean
}
/**
 * What the Korean opening needs beyond the proposals: the site's absolute origin for the page link (bare path when
 * absent or not http(s)), and the instrument classes for a cap trigger's position weight (left out when absent).
 */
export type NotifyOptions = { baseUrl?: string | null; classes?: InstrumentClasses | null }
/** eventId -> ISO time it was sent, per channel. Host-owned, never pushed. */
export type NotifyState = { version: 1; seeded: boolean; announced: Record<string, { telegram?: string; discord?: string }> }

const DAY_MS = 86_400_000
export const REMINDER_DAYS = 3
const STATUS_EVENTS = ['targets_approved', 'plan_approved', 'reconciled', 'rejected', 'expired', 'closed'] as const

const pagePath = (id: string) => `/rebalance/proposals/${id}`

/** The marker the control plane's hand-off script requires before it delivers a composed message. */
const HANDOFF_MARKER = '<<<HANDOFF>>>'

const SUMMARY_MAX = 1_500
const WHY_MAX = 200

/** Cut to `limit` characters, marking the cut so the reader knows it is partial. */
const cut = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text)

/** A KRW figure to the nearest 10,000, as the tax line has always been rounded. */
const round10k = (value: number) => Math.round(value / 10_000) * 10_000

/**
 * The proposal's facts for a thread opening: id, kind and triggers, the decision and sleeve changes, the outlook in
 * full (capped), every idea and question, the harvest figures when there are any, instruction counts, the plan's
 * tax effect and warning counts. No account labels, and no amounts beyond the rounded tax and harvest figures.
 */
function threadMaterial(p: Proposal): string {
  const counts = (items: string[]) => {
    const n: Record<string, number> = {}
    for (const item of items) n[item] = (n[item] ?? 0) + 1
    return Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
  }
  // A sleeve entry without both ends (a partial or hand-edited record) is left out rather than printed as "undefined%".
  const sleeves = Object.entries(p.targetChange.sleeves)
    .filter(([, c]) => Number.isFinite(c?.from) && Number.isFinite(c?.to))
    .map(([sleeve, c]) => `${sleeve} ${c?.from}% -> ${c?.to}%`)
    .join('; ')
  const ideas = Array.isArray(p.ideas) ? p.ideas : []
  const questions = Array.isArray(p.questionsForMaintainer) ? p.questionsForMaintainer : []
  const lines = [
    `Proposal ${p.id} (${p.kind}); triggers: ${p.triggers.join(', ') || 'none'}.`,
    `Decision: ${p.targetChange.decision}${sleeves ? ` (${sleeves})` : ''}.`,
    p.outlook ? `Outlook (${p.outlook.confidence} confidence): ${cut(p.outlook.summary, SUMMARY_MAX)}` : 'Outlook: none.',
  ]
  if (ideas.length) {
    lines.push('Ideas to research (never traded automatically):')
    for (const idea of ideas) {
      const security = idea.market ? `${idea.market}:${idea.ticker}` : idea.ticker
      lines.push(`- ${security} (${idea.sleeve}) — ${cut(String(idea.why ?? ''), WHY_MAX)}`)
    }
  } else {
    lines.push('Ideas: none.')
  }
  if (questions.length) {
    lines.push('Questions for the maintainer:')
    for (const q of questions) lines.push(`- ${q}`)
  }
  if (p.harvest && p.harvest.totalLossKrw > 0) {
    lines.push(
      `Loss harvest scenario (not in the plan; the engine never sells for it): selling every harvestable loss lot would realize about ${round10k(p.harvest.totalLossKrw)} KRW of losses, a tax effect of about ${round10k(p.harvest.taxEffectKrw)} KRW for the year.`,
    )
  }
  lines.push(
    `Instructions by kind: ${counts(p.plan.instructions.map((i) => i.kind))}.`,
    `Estimated tax effect of the plan: about ${round10k(p.plan.taxSummary.estimatedTaxKrw)} KRW.`,
    `Warnings by code: ${counts(p.plan.warnings.map((w) => w.code))}.`,
    `Page: ${pagePath(p.id)}`,
  )
  return lines.join('\n')
}

/** The fallback opening prompt: the material, then this repo's own writing instructions. */
function threadPrompt(p: Proposal): string {
  return [
    threadMaterial(p),
    'Write a short opening (≤ 1,200 chars) for the maintainer: what this proposal suggests and why, what to check first, and that approval happens on the page. Do not invent figures. This is not advice.',
    // The control plane's run-handoff.sh delivers only output carrying this marker and
    // drops the rest, posting a "couldn't compose" stand-in instead. Same wording as its
    // own nudge prompts.
    `Prefix the whole message with the exact marker ${HANDOFF_MARKER} on its own line; output nothing else.`,
  ].join('\n')
}

// ── The Korean thread messages ───────────────────────────────────────────────
//
// A rebalancing proposal's Discord thread messages are Korean, rendered here from the proposal's own data with a
// fixed template: no model composes any sentence at send time. Where the opening quotes text a model wrote with
// the proposal (outlook.summaryKo, an idea's whyKo), the line is left out when that Korean text is missing; the
// English is never printed in its place. Telegram lines stay English. See docs/rebalancing.md § Operations (the notify flow).

const SLEEVE_KO: Record<string, string> = {
  kr_equity: '한국주식',
  us_equity: '미국주식',
  bonds: '채권',
  gold: '금',
  crypto: '암호화폐',
  cash: '현금',
}
const CONFIDENCE_KO: Record<string, string> = { low: '낮음', medium: '보통', high: '높음' }
const WARNING_KO: Record<EngineWarningCode, string> = {
  wash_sale_block: 'wash sale 차단',
  near_long_term: '장기 보유 전환 임박',
  unclassified: '미분류 종목',
  unpriced: '가격 없는 종목',
  transfer_needed: '계좌 간 이체 필요',
  stale_account: '오래된 계좌 데이터',
  turnover_capped: '회전율 한도 적용',
  below_min_trade: '최소 거래금액 미달',
  cash_floor: '현금 하한 도달',
  no_sellable_lots: '매도 가능 로트 없음',
  no_buy_price: '매수 가격 없음',
  no_buy_list: '매수 목록 없음',
  managed_account: '위탁 운용 계좌',
}
const KIND_KO: Record<string, string> = { monthly: '월간 점검', trigger: '조건 발생', manual: '수동 요청' }
const STATUS_KO: Record<string, string> = {
  targets_approved: '목표 승인됨',
  plan_approved: '계획 승인됨',
  executing: '실행 중',
  reconciled: '거래 대조 완료',
  closed: '종료됨',
  rejected: '거절됨',
  expired: '만료됨',
}
const IDEAS_MAX = 5

const sleeveKo = (sleeve: string) => SLEEVE_KO[sleeve] ?? sleeve

/**
 * The key of one stored trigger entry. The trigger a proposal was created for is stored as its bare key
 * (`band:gold`); one appended while the proposal was open is stored as `<key>: <label>`
 * (`band:kr_equity: kr_equity 0.8pp outside band`), and the same key can be appended more than once.
 */
const TRIGGER_KEY = /^(band:[a-z_]+|cap:[A-Za-z]+:[^:\s]+|yearend:\d{4}-\d{2}-\d{2}|harvest|monthly|manual)(?=:\s|$)/
export function triggerKeyOf(entry: string): string {
  const m = TRIGGER_KEY.exec(entry)
  return m ? m[1] : entry
}

/** The proposal's trigger keys, each once, in the order they first appeared. */
function triggerKeys(p: Proposal): string[] {
  return [...new Set(p.triggers.map(triggerKeyOf))]
}

/** The label of the latest appended entry for a key (the text after `<key>: `), or null. */
function latestTriggerLabel(p: Proposal, key: string): string | null {
  for (let i = p.triggers.length - 1; i >= 0; i--) {
    const entry = p.triggers[i]
    if (entry.startsWith(`${key}: `)) return entry.slice(key.length + 2)
  }
  return null
}

/**
 * The trigger keys in Korean for the opening's first line, grouped so several sleeves read as one item:
 * `범위 이탈(금·한국주식), 연말 점검, 손실 확정 기회`. Groups keep the order their first key appeared in;
 * an unknown key prints raw.
 */
function triggersKo(keys: string[]): string {
  const groups = new Map<string, string[]>()
  const add = (group: string, item?: string) => {
    const items = groups.get(group) ?? []
    if (item && !items.includes(item)) items.push(item)
    groups.set(group, items)
  }
  for (const key of keys) {
    if (key.startsWith('band:')) add('범위 이탈', sleeveKo(key.slice(5)))
    else if (key.startsWith('cap:')) add('종목 비중 한도 초과', key.slice(4))
    else if (key.startsWith('yearend:')) add('연말 점검')
    else if (key === 'harvest') add('손실 확정 기회')
    else if (key === 'monthly') add('월간 점검')
    else if (key === 'manual') add('수동 요청')
    else add(key)
  }
  return [...groups.entries()].map(([group, items]) => (items.length ? `${group}(${items.join('·')})` : group)).join(', ')
}

/** Percent with at most one decimal and no trailing ".0": 10, 12.5. */
const pct1 = (value: number) => String(Math.round(value * 10) / 10)

/** KRW in 만 원, rounded the way the English material rounds (round10k), with thousands separators. */
function manwon(value: number, signed = false): string {
  const units = Math.round(round10k(value) / 10_000)
  if (units === 0) return '0원'
  const text = `${Math.abs(units).toLocaleString('en-US')}만 원`
  if (units < 0) return `-${text}`
  return signed ? `+${text}` : text
}

/** Position weight of one instrument in the frozen snapshot, with the classes given; null when it cannot be told. */
function capWeight(p: Proposal, market: string, ticker: string, classes: InstrumentClasses | null | undefined): number | null {
  // An empty classes file classifies nothing, and every share would then be measured against cash alone.
  if (!classes || Object.keys(classes).length === 0 || !p.inputSnapshot || !p.policyAtCreation) return null
  try {
    const allocation = computeAllocation(p.inputSnapshot, p.policyAtCreation, classes)
    if (!(allocation.totalKrw > 0)) return null
    let value = 0
    let found = false
    for (const positions of Object.values(allocation.positionsBySleeve)) {
      for (const pos of positions) {
        if (pos.market !== market || pos.ticker !== ticker) continue
        value += pos.valueKrw ?? pos.costKrw
        found = true
      }
    }
    return found ? (value / allocation.totalKrw) * 100 : null
  } catch {
    return null
  }
}

/** The figures line for one band or cap trigger, from the data frozen at creation; null for other triggers. */
function triggerFigures(p: Proposal, key: string, classes: InstrumentClasses | null | undefined): string | null {
  if (key.startsWith('band:')) {
    const sleeve = key.slice(5)
    const t = p.policyAtCreation?.targets?.[sleeve as keyof NonNullable<Proposal['policyAtCreation']>['targets']]
    if (!t || !Number.isFinite(t.target) || !Number.isFinite(t.band)) return null
    const { lower, upper } = bandEdges(t.target, t.band)
    // Two decimals: a share just past an edge (2.01% against a 2% upper edge) must not read as inside it.
    const move = Array.isArray(p.plan?.moves) ? p.plan.moves.find((m) => m.sleeve === sleeve) : undefined
    let now = ''
    if (move && Number.isFinite(move.fromPct)) now = `현재 ${move.fromPct.toFixed(2)}% / `
    else {
      // A trigger appended after creation has no frozen move; its own label says how far out it was.
      const pp = /(\d+(?:\.\d+)?)pp outside band/.exec(latestTriggerLabel(p, key) ?? '')
      if (pp) now = `범위를 ${pp[1]}pp 벗어남(제안 생성 후 추가) / `
    }
    return `${sleeveKo(sleeve)}: ${now}목표 ${pct1(t.target)}% (허용 ${pct1(lower)}–${pct1(upper)}%)`
  }
  if (key.startsWith('cap:')) {
    const rest = key.slice(4)
    const at = rest.indexOf(':')
    const cap = p.policyAtCreation?.bounds?.positionCapPct
    if (at < 0 || !Number.isFinite(cap)) return null
    const weight = capWeight(p, rest.slice(0, at), rest.slice(at + 1), classes)
    return weight == null ? `${rest}: 한도 ${pct1(cap as number)}% 초과` : `${rest}: 비중 ${weight.toFixed(1)}% / 한도 ${pct1(cap as number)}%`
  }
  return null
}

/** What the maintainer does next, by the proposal's status and plan; null once there is nothing left to do. */
function nextStepKo(p: Proposal): string | null {
  const trades = p.plan.instructions.some((i) => i.kind === 'buy' || i.kind === 'sell')
  const warned = p.plan.warnings.length > 0
  switch (p.status) {
    case 'draft':
      if (p.targetChange.decision === 'change') return '페이지에서 목표 변경을 검토하고 목표 승인'
      if (trades) return '페이지에서 매매 계획을 검토하고 계획 승인'
      return warned ? '경고 확인 후 페이지에서 종료' : '매매할 것이 없으니 페이지에서 종료'
    case 'targets_approved':
      return trades ? '페이지에서 매매 계획을 검토하고 계획 승인' : '매매할 것이 없으니 페이지에서 종료'
    case 'plan_approved':
    case 'executing':
      return '지시대로 직접 주문하고 체결을 페이지에 기록'
    case 'reconciled':
      return '페이지에서 종료'
    default:
      return null
  }
}

/** The proposal's page: absolute when a usable http(s) origin is given, else the bare path. */
function pageUrl(id: string, baseUrl: string | null | undefined): string {
  const base = (baseUrl ?? '').trim()
  return /^https?:\/\/\S+$/.test(base) ? `${base.replace(/\/+$/, '')}${pagePath(id)}` : pagePath(id)
}

/**
 * The Korean thread opening, from the proposal's data only. No account labels, no instruction tickers, and no
 * amounts beyond the rounded tax and harvest figures (the same ones threadMaterial carries). Empty lines are left
 * out rather than printed blank.
 */
function discordOpening(p: Proposal, opts: NotifyOptions): { text: string; quotesModel: boolean } {
  const keys = triggerKeys(p)
  const triggers = keys.length ? triggersKo(keys) : (KIND_KO[p.kind] ?? p.kind)
  const lines: (string | null)[] = []
  let quotesModel = false
  lines.push(`🧭 리밸런싱 제안 ${p.id} · ${triggers}`)
  const decision = p.targetChange.decision === 'change' ? '목표 변경' : '유지'
  lines.push(`판단: ${decision} · 매매 지시 ${p.plan.instructions.length}건 · 예상 세금 영향 ${manwon(p.plan.taxSummary.estimatedTaxKrw, true)}`)
  for (const key of keys) lines.push(triggerFigures(p, key, opts.classes))
  if (p.targetChange.decision === 'change') {
    const changes = Object.entries(p.targetChange.sleeves)
      .filter(([, c]) => Number.isFinite(c?.from) && Number.isFinite(c?.to))
      .map(([sleeve, c]) => `${sleeveKo(sleeve)} ${pct1(c!.from)}% → ${pct1(c!.to)}%`)
    if (changes.length) lines.push(`목표 변경: ${changes.join(' · ')}`)
  }
  const summaryKo = typeof p.outlook?.summaryKo === 'string' ? p.outlook.summaryKo.trim() : ''
  if (p.outlook && summaryKo) {
    lines.push(`전망(신뢰도 ${CONFIDENCE_KO[p.outlook.confidence] ?? p.outlook.confidence}): ${summaryKo}`)
    quotesModel = true
  }
  const ideas = Array.isArray(p.ideas) ? p.ideas : []
  if (ideas.length) {
    lines.push('아이디어(자동 매매 없음):')
    for (const idea of ideas.slice(0, IDEAS_MAX)) {
      const security = idea.market ? `${idea.market}:${idea.ticker}` : idea.ticker
      const whyKo = typeof idea.whyKo === 'string' ? idea.whyKo.trim() : ''
      if (whyKo) quotesModel = true
      lines.push(`- ${security} (${sleeveKo(idea.sleeve)})${whyKo ? ` — ${whyKo}` : ''}`)
    }
    if (ideas.length > IDEAS_MAX) lines.push(`- 외 ${ideas.length - IDEAS_MAX}건은 페이지에서`)
  }
  const warnings = p.plan.warnings
  if (warnings.length) {
    const byCode = new Map<string, number>()
    for (const w of warnings) byCode.set(w.code, (byCode.get(w.code) ?? 0) + 1)
    const parts = [...byCode].map(([code, n]) => `${WARNING_KO[code as EngineWarningCode] ?? code} ${n}`)
    lines.push(`⚠️ 경고 ${warnings.length}건: ${parts.join(' · ')}`)
  }
  if (p.harvest && p.harvest.totalLossKrw > 0) {
    lines.push(`참고 · 손실 확정 시나리오(계획에 없음): 손실 약 ${manwon(p.harvest.totalLossKrw)} 확정 시 올해 세금 약 ${manwon(p.harvest.taxEffectKrw, true)}`)
  }
  const questions = Array.isArray(p.questionsForMaintainer) ? p.questionsForMaintainer.length : 0
  if (questions) lines.push(`질문 ${questions}개 — 페이지에서 답변할 수 있습니다`)
  const step = nextStepKo(p)
  if (step) lines.push(`할 일: ${step}`)
  lines.push(pageUrl(p.id, opts.baseUrl))
  return { text: lines.filter((l): l is string => Boolean(l)).join('\n'), quotesModel }
}

/** A status change for the proposal's thread, in Korean. A close that never traded says so. */
function statusLineKo(p: Proposal, status: string): string {
  if (status === 'closed' && !p.events.some((e) => e.type === 'reconciled')) return '상태 변경 → 거래 없이 종료됨'
  if (status === 'expired') return '상태 변경 → 만료됨 (승인 없이 기한이 지났습니다)'
  return `상태 변경 → ${STATUS_KO[status] ?? status}`
}

function threadTitle(p: Proposal): string {
  const d = new Date(p.createdAt)
  return `⏳ ${d.getUTCMonth() + 1}/${d.getUTCDate()} · Rebalance ${p.id}`
}

function ev(p: Proposal, kind: NotifyEvent['kind'], detail: string, channels: NotifyChannel[], rest: Partial<NotifyEvent>): NotifyEvent {
  return {
    id: `${p.id}:${kind}:${detail}`,
    proposalId: p.id,
    kind,
    detail,
    channels,
    telegram: null,
    discord: null,
    threadTitle: null,
    threadMaterial: null,
    threadPrompt: null,
    discordOpening: null,
    discordOpeningQuotesModel: false,
    ...rest,
  }
}

/** Every event the proposals imply, with the channels each is meant for, before the state filters them. */
function allEvents(proposals: Proposal[], now: Date, announcedMismatch: (id: string) => number, opts: NotifyOptions = {}): NotifyEvent[] {
  const out: NotifyEvent[] = []
  for (const p of proposals) {
    const opening = discordOpening(p, opts)
    out.push(
      ev(p, 'created', 'new', ['telegram', 'discord'], {
        telegram: `🧭 Rebalance proposal ${p.id} (${p.kind}) is ready for review — ${p.plan.instructions.length} instructions, decision ${p.targetChange.decision}. Discuss in its Discord thread; approve on ${pagePath(p.id)}.`,
        threadTitle: threadTitle(p),
        threadMaterial: threadMaterial(p),
        threadPrompt: threadPrompt(p),
        discordOpening: opening.text,
        discordOpeningQuotesModel: opening.quotesModel,
      }),
    )
    if (p.kind === 'monthly' && p.llm?.status === 'failed') {
      out.push(
        ev(p, 'llm_failed', p.llm.reason ?? 'unknown', ['telegram'], {
          telegram: `⚠️ Rebalance ${p.id}: LLM step failed (${p.llm.reason ?? 'unknown'}); targets held, engine plan only.`,
        }),
      )
    }
    const seen = new Set<string>()
    for (const e of p.events) {
      const status = (STATUS_EVENTS as readonly string[]).includes(e.type) ? e.type : e.type === 'fill' ? 'executing' : null
      if (!status || seen.has(status)) continue
      seen.add(status)
      const expired = status === 'expired'
      out.push(
        ev(p, 'status_changed', status, expired ? ['telegram', 'discord'] : ['discord'], {
          discord: statusLineKo(p, status),
          telegram: expired ? `⌛ Rebalance ${p.id} expired without approval.` : null,
        }),
      )
    }
    if (p.status === 'draft' && now.getTime() - Date.parse(p.createdAt) >= REMINDER_DAYS * DAY_MS) {
      out.push(
        ev(p, 'reminder', 'draft3d', ['discord'], {
          discord: `알림: 이 제안은 ${REMINDER_DAYS}일째 초안 상태입니다. ${p.expiresAt.slice(0, 10)}에 만료됩니다. ${pageUrl(p.id, opts.baseUrl)}`,
        }),
      )
    }
    const missing = p.reconciliation?.missing.length ?? 0
    if (missing > announcedMismatch(p.id)) {
      out.push(
        ev(p, 'reconcile_mismatch', String(missing), ['telegram'], {
          telegram: `⚠️ Rebalance ${p.id}: ${missing} recorded fill(s) have no matching transaction yet.`,
        }),
      )
    }
  }
  return out
}

const empty = (): NotifyState => ({ version: 1, seeded: false, announced: {} })

/** The highest missing count already announced on telegram for a proposal. */
function maxAnnouncedMismatch(state: NotifyState, proposalId: string): number {
  const prefix = `${proposalId}:reconcile_mismatch:`
  let max = 0
  for (const [id, sent] of Object.entries(state.announced)) {
    if (id.startsWith(prefix) && sent.telegram) max = Math.max(max, Number(id.slice(prefix.length)) || 0)
  }
  return max
}

/** The events with at least one channel still unsent; `channels` lists only those. Pure: changes no state. */
export function pendingEvents(proposals: Proposal[], state: NotifyState, now: Date, opts: NotifyOptions = {}): NotifyEvent[] {
  const out: NotifyEvent[] = []
  for (const e of allEvents(proposals, now, (id) => maxAnnouncedMismatch(state, id), opts)) {
    const sent = state.announced[e.id] ?? {}
    const channels = e.channels.filter((c) => !sent[c])
    if (!channels.length) continue
    out.push({
      ...e,
      channels,
      telegram: channels.includes('telegram') ? e.telegram : null,
      discord: channels.includes('discord') ? e.discord : null,
      threadTitle: channels.includes('discord') ? e.threadTitle : null,
      threadMaterial: channels.includes('discord') ? e.threadMaterial : null,
      threadPrompt: channels.includes('discord') ? e.threadPrompt : null,
      discordOpening: channels.includes('discord') ? e.discordOpening : null,
      discordOpeningQuotesModel: channels.includes('discord') ? e.discordOpeningQuotesModel : false,
    })
  }
  return out
}

/** Marks everything the proposals imply right now as already announced on both channels, so a first run is silent. */
export function seedState(proposals: Proposal[], now: Date): NotifyState {
  const at = now.toISOString()
  const announced: NotifyState['announced'] = {}
  for (const e of allEvents(proposals, now, () => 0)) announced[e.id] = { telegram: at, discord: at }
  return { version: 1, seeded: true, announced }
}

/** Records the events as sent on `channel`. With `proposals`, entries of proposals that no longer exist are dropped. */
export function markSent(state: NotifyState, eventIds: string[], channel: NotifyChannel, now: Date, proposals?: Proposal[]): NotifyState {
  const announced = { ...state.announced }
  for (const id of eventIds) announced[id] = { ...announced[id], [channel]: now.toISOString() }
  if (proposals) {
    const live = new Set(proposals.map((p) => p.id))
    for (const id of Object.keys(announced)) {
      const owner = [...live].find((l) => id.startsWith(`${l}:`))
      if (!owner) delete announced[id]
    }
  }
  return { version: 1, seeded: state.seeded, announced }
}

/** A missing file is null (not seeded yet); an unreadable one throws, so a run fails instead of re-announcing everything. */
export function readNotifyState(filePath: string = config.stockRebalanceNotifyStatePath): NotifyState | null {
  if (!fs.existsSync(filePath)) return null
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<NotifyState>
  if (raw === null || typeof raw !== 'object' || raw.version !== 1 || raw.announced === null || typeof raw.announced !== 'object') {
    throw new Error(`Notify state unreadable: ${path.basename(filePath)}`)
  }
  return { version: 1, seeded: raw.seeded === true, announced: { ...raw.announced } }
}

/** Written to a temporary file and renamed, so a reader never sees half a file. */
export function writeNotifyState(state: NotifyState, filePath: string = config.stockRebalanceNotifyStatePath): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`)
  fs.renameSync(temporaryPath, filePath)
}

export { empty as emptyNotifyState }
