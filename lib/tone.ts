/**
 * Meaning → tone, in one place.
 *
 * Every page used to answer this question for itself. `marketTone` was the
 * exception that proved the rule: before it existed, 27 call sites spelled the
 * market colour as `market === 'US' ? 'info' : 'success'`, so the moment a
 * third market appeared it was drawn in Korea's green. The same shape had
 * spread again — nine inline `value >= 0 ? 'success' : 'danger'` ternaries,
 * four copies of the long/short bucket rule, seven page-local `*Tone`
 * functions (two of them byte-identical), and six local `Record<_, Tone>`
 * maps. They are collected here so a status can only mean one colour.
 */
/**
 * The five tones every badge, metric and chart colour is drawn from. Owned here,
 * not by components/ui.tsx, so this module imports nothing from a component and
 * components/ui.tsx can import from it without a cycle.
 */
export const TONES = ['neutral', 'info', 'success', 'warning', 'danger'] as const
export type Tone = (typeof TONES)[number]

/**
 * Badge tone for a market code.
 *
 * Moved here from components/ui.tsx, which re-exports it so existing imports
 * keep working.
 */
export function marketTone(market: string): Tone {
  if (market === 'US') return 'info'
  if (market === 'KR') return 'success'
  return 'warning'
}

/**
 * Gain or loss. Zero counts as a gain, matching every call site this replaces.
 *
 * Colour alone is not a sufficient signal — see `<Signed>` in components/ui,
 * which pairs this with an explicit + or − so the two directions are still
 * distinguishable without colour vision.
 */
export function signTone(value: number | null | undefined): Tone {
  return Number(value ?? 0) >= 0 ? 'success' : 'danger'
}

/**
 * A change between two readings: up is success, down is danger, and no change
 * (or no reading) is neutral. Unlike `signTone`, zero is not a gain here: a
 * drift of nothing should not read as good news.
 */
export function deltaTone(value: number | null | undefined): Tone {
  if (value == null) return 'neutral'
  if (value > 0) return 'success'
  if (value < 0) return 'danger'
  return 'neutral'
}

/**
 * The text colour for a gain or loss, where a full `<Signed>` does not fit —
 * a chart caption, a delta inside a sentence.
 */
export function signClass(value: number | null | undefined) {
  return signTone(value) === 'success' ? 'text-success' : 'text-danger'
}

/**
 * The text and background class for a tone, where a status colours a plain
 * figure or a bar rather than a Badge. Static, so Tailwind sees every class.
 * Neutral text is body ink, as in MetricField; neutral fill is tertiary ink.
 */
const TONE_TEXT_CLASS: Record<Tone, string> = {
  neutral: 'text-ink',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

export function toneTextClass(tone: Tone) {
  return TONE_TEXT_CLASS[tone]
}

const TONE_BG_CLASS: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function toneBgClass(tone: Tone) {
  return TONE_BG_CLASS[tone]
}

/**
 * The auto-refresh status dot: paused (warning), a refresh in flight (info,
 * pulsing) or running (a softened success). Keyed by state rather than tone,
 * because the pulse and the softened fill belong to the state.
 */
export const REFRESH_DOT_CLASS: Record<'paused' | 'refreshing' | 'live', string> = {
  paused: 'bg-warning',
  refreshing: 'bg-info motion-safe:animate-pulse',
  live: 'bg-success/70',
}

/**
 * A tax lot's holding period: long-term is the outcome worth having.
 *
 * Two spellings reach here: the lot engine's `long`/`short` and the broker
 * export's `Long-term`/`Short-term` (the /lots table). Reading only `long`
 * drew every /lots long-term badge in the short-term colour.
 */
const LONG_TERM_BUCKETS: ReadonlySet<string> = new Set(['long', 'Long-term'])

export function bucketTone(bucket: string | null | undefined): Tone {
  return bucket != null && LONG_TERM_BUCKETS.has(bucket) ? 'success' : 'warning'
}

/**
 * Whether a holding's cost basis can be relied on.
 *
 * Lived in PortfolioTables beside its label map; the labels stay with the page
 * that words them, the colour comes here with the other meaning-to-tone rules.
 */
export const COST_BASIS_STATUS_TONE: Record<string, Tone> = {
  ready: 'success',
  missing_cost: 'danger',
  estimated: 'warning',
  unpriced: 'neutral',
}

/**
 * One severity scale for every status.
 *
 * A status that says how much something needs the reader — a run, a source's
 * freshness, an account's coverage, a triage priority — is first mapped to one
 * of these five steps, and the step alone picks the colour. Two statuses that
 * mean the same thing can then no longer be drawn in different colours, and
 * `quiet` (nothing to do) is distinct from `info` (worth knowing).
 */
export const SEVERITIES = ['quiet', 'info', 'ok', 'attention', 'problem'] as const
export type Severity = (typeof SEVERITIES)[number]

const SEVERITY_TONE: Record<Severity, Tone> = {
  quiet: 'neutral',
  info: 'info',
  ok: 'success',
  attention: 'warning',
  problem: 'danger',
}

export function severityTone(severity: Severity): Tone {
  return SEVERITY_TONE[severity]
}

/**
 * The severity a table gives `value`, or `fallback` (quiet unless stated) for
 * a value the table does not know. Own keys only, so `constructor` and friends
 * are unknown values rather than prototype members.
 */
export function severityOf(
  table: Record<string, Severity>,
  value: string | null | undefined,
  fallback: Severity = 'quiet',
): Severity {
  return value != null && Object.hasOwn(table, value) ? table[value] : fallback
}

/** The tone of a status read through one of the severity tables below. */
export function statusTone(table: Record<string, Severity>, value: string | null | undefined): Tone {
  return severityTone(severityOf(table, value))
}

/** Triage priority (data-ops and reconciliation action queues). */
export const PRIORITY_SEVERITY: Record<string, Severity> = {
  high: 'problem',
  medium: 'attention',
  low: 'info',
}

/** A daily-briefing action: how soon it wants doing. */
export const BRIEFING_SEVERITY: Record<string, Severity> = {
  'act-now': 'problem',
  'this-week': 'attention',
  fyi: 'quiet',
}

/** A data source's freshness. Drift reads as stale: both mean "older than it should be". */
export const FRESHNESS_SEVERITY: Record<string, Severity> = {
  fresh: 'ok',
  stale: 'attention',
  drift: 'attention',
  missing: 'problem',
}

/**
 * A refresh run or one of its steps. An unknown status is quiet; the /health
 * page-local rule this replaces drew it as danger, which made a status the
 * page had never heard of look like a failure.
 */
export const RUN_SEVERITY: Record<string, Severity> = {
  success: 'ok',
  degraded: 'attention',
  running: 'info',
  failed: 'problem',
}

/** Per-account statement coverage. Unconfirmed is a question to answer, not a failure. */
export const COVERAGE_SEVERITY: Record<string, Severity> = {
  current: 'ok',
  due_soon: 'attention',
  unconfirmed: 'attention',
  action_needed: 'problem',
  missing: 'problem',
}

/**
 * How many of something there is, as a named state: `some` above zero, `none`
 * otherwise (zero, a negative, null or NaN). A count, or an amount such as tax
 * due, reads its colour through one of the `Record<CountState, Severity>`
 * tables below with `countTone`, so no page writes `count ? 'warning' :
 * 'success'` and no two pages can disagree on which way round it goes.
 */
export type CountState = 'none' | 'some'

export function countState(count: number | null | undefined): CountState {
  return Number(count ?? 0) > 0 ? 'some' : 'none'
}

export function countTone(table: Record<CountState, Severity>, count: number | null | undefined): Tone {
  return severityTone(table[countState(count)])
}

/** Items waiting for a look (suggestions, drift, stale inputs): none is fine, any needs attention. */
export const TO_REVIEW_SEVERITY: Record<CountState, Severity> = { none: 'ok', some: 'attention' }

/** Items that are wrong (missing files, missing cost, accounts needing action): any is a problem. */
export const FAULT_SEVERITY: Record<CountState, Severity> = { none: 'ok', some: 'problem' }

/** Values standing on an estimate: none is unremarkable, not good news; any needs attention. */
export const CAVEAT_SEVERITY: Record<CountState, Severity> = { none: 'quiet', some: 'attention' }

/** Tax a plan or scenario would owe: none is the outcome worth having. */
export const TAX_DUE_SEVERITY: Record<CountState, Severity> = { none: 'ok', some: 'attention' }

/**
 * A yes/no check, keyed by what it found rather than by the boolean, so the
 * call site names the state (`ok ? 'clear' : 'needs_review'`) and a flipped
 * branch reads wrong in words, not only in colour.
 */
export const REVIEW_SEVERITY: Record<'clear' | 'needs_review', Severity> = {
  clear: 'ok',
  needs_review: 'attention',
}

/** A figure that moved since a saved plan: a change wants attention, no change is quiet. */
export const CHANGE_SEVERITY: Record<'changed' | 'unchanged', Severity> = {
  changed: 'attention',
  unchanged: 'quiet',
}

/** An open wash-sale window: ending soon (three days or fewer) or still blocking a buy. */
export const WASH_SALE_SEVERITY: Record<'ending' | 'blocked', Severity> = {
  ending: 'attention',
  blocked: 'problem',
}

/** An inventory account's identity: expected and included is informational, anything else needs a look. */
export const INVENTORY_IDENTITY_SEVERITY: Record<'expected' | 'unexpected', Severity> = {
  expected: 'info',
  unexpected: 'attention',
}

/**
 * A validation check's result: a pass, or a failure read by its severity.
 * Look a check up through `checkResultKey`; a bare severity (a listed issue,
 * which has already failed) can be looked up as it is.
 */
export const CHECK_RESULT_SEVERITY: Record<string, Severity> = {
  pass: 'ok',
  warning: 'attention',
  error: 'problem',
}

/** The two severities a list of issues can have: a card's count badge, and the header pill that links to it. */
export type IssueSeverity = Extract<Severity, 'attention' | 'problem'>

/**
 * A list of issues, by its worst item: any error (a failed error check, a
 * missing source) makes it a problem; warnings alone need attention. Keyed like
 * `CHECK_RESULT_SEVERITY`'s failures, so the call site names what it found
 * (`errors ? 'error' : 'warning'`) and a header pill and the card it links to
 * read one table.
 */
export const ISSUE_SEVERITY: Record<'warning' | 'error', IssueSeverity> = {
  warning: 'attention',
  error: 'problem',
}

/** The `CHECK_RESULT_SEVERITY` key for a check. */
export function checkResultKey(check: { status: string; severity: string }): string {
  return check.status === 'pass' ? 'pass' : check.severity
}

/**
 * An income row's ticker mapping. Look a status up through
 * `mappingStatusKey`, which folds every status naming `tickerless` into one.
 */
export const MAPPING_STATUS_SEVERITY: Record<string, Severity> = {
  tickerless: 'attention',
  mapped: 'ok',
}

/** The `MAPPING_STATUS_SEVERITY` key for a mapping status. */
export function mappingStatusKey(status: string): string {
  return status.includes('tickerless') ? 'tickerless' : 'mapped'
}

/** Whether a position's evidence file is linked to a lot. */
export const EVIDENCE_LINK_SEVERITY: Record<string, Severity> = {
  linked: 'ok',
  unlinked: 'attention',
}

/** Where an asset class sits against its rebalance band. */
export const DRIFT_BAND_SEVERITY: Record<string, Severity> = {
  within: 'ok',
  below: 'attention',
  above: 'attention',
}

/** A proposal instruction's recorded fill. Skipped is a decision, not a fault. */
export const FILL_STATUS_SEVERITY: Record<string, Severity> = {
  executed: 'ok',
  skipped: 'quiet',
}

/** The tax-planning decision card: no target set yet, a tie between scenarios, or a recommendation. */
export const TAX_DECISION_SEVERITY: Record<string, Severity> = {
  explore: 'attention',
  tie: 'quiet',
  recommendation: 'ok',
}

/** A saved tax plan. An active plan is the one with sales still to make. Draft and archived are quiet. */
export const TAX_PLAN_STATUS_SEVERITY: Record<string, Severity> = {
  active: 'attention',
  completed: 'ok',
  reviewed: 'info',
  draft: 'quiet',
  archived: 'quiet',
}

/**
 * Category colours.
 *
 * These are not severities: a sell is not worse than a dividend. They are named
 * maps so a category picks its colour here rather than in a page-local
 * function. The fallback for values a map does not list is the caller's third
 * argument; each map's doc says which fallback reproduces the rule it replaced.
 */
export function categoryTone(
  map: Record<string, Tone>,
  value: string | null | undefined,
  fallback: Tone = 'neutral',
): Tone {
  return value != null && Object.hasOwn(map, value) ? map[value] : fallback
}

/** A ledger row's kind: money in, money out. Fallback `info` for everything else. */
export const TRANSACTION_TYPE_TONE: Record<string, Tone> = {
  DIVIDEND: 'success',
  SELL: 'warning',
}

/** An event on a position's timeline. Fallback `info`. */
export const POSITION_EVENT_TONE: Record<string, Tone> = {
  dividend: 'success',
  sell: 'warning',
  taxLot: 'neutral',
}

/**
 * A daily-briefing trade. `split` is deliberately absent: it is not a trade,
 * so it falls through to the default `neutral`.
 */
export const TRADE_SIDE_TONE: Record<string, Tone> = {
  bought: 'success',
  opened: 'success',
  sold: 'danger',
  closed: 'danger',
}

/** A pension wrapper's US tax treatment. Fallback `neutral`. */
export const WRAPPER_TREATMENT_TONE: Record<string, Tone> = {
  taxable: 'info',
  undecided: 'warning',
  deferred: 'neutral',
  exempt_within_limit: 'neutral',
}

/** A data-map file's inventory status. Fallback `danger` (missing, or anything unrecognised). */
export const INVENTORY_STATUS_TONE: Record<string, Tone> = {
  used: 'success',
  derived: 'neutral',
  archive: 'neutral',
  unused: 'info',
  drift: 'warning',
}

/** A data-map file's retention class. Fallback `warning` (anything that needs a decision). */
export const RETENTION_TONE: Record<string, Tone> = {
  active: 'success',
  fallback: 'info',
  derived: 'neutral',
  archive: 'neutral',
}

/**
 * A reconciliation break. Fallback `info` (a cost break). Look a status up
 * through `reconciliationStatusKey`, which folds every one-sided status
 * (`holding_only`, `lot_only`, any future `*_only`) into `one_sided`.
 */
export const RECONCILIATION_STATUS_TONE: Record<string, Tone> = {
  one_sided: 'warning',
  quantity_break: 'danger',
}

/** The `RECONCILIATION_STATUS_TONE` key for a break status. */
export function reconciliationStatusKey(status: string): string {
  return status.includes('only') ? 'one_sided' : status
}

/** A tax-evidence report on /health. Fallback `success` (the 1099s). */
export const TAX_REPORT_TONE: Record<string, Tone> = {
  us_gain_loss_pdf: 'info',
}

/** A rebalance row's suggested action. Fallback `warning` (Add or Reduce: something to do). */
export const REBALANCE_ACTION_TONE: Record<string, Tone> = {
  Hold: 'success',
}

/** A proposal instruction's kind. `transfer` falls through to the default `neutral`. */
export const INSTRUCTION_KIND_TONE: Record<string, Tone> = {
  sell: 'warning',
  buy: 'info',
}

/** The tax tier a sell was picked from. The other tiers fall through to the default `neutral`. */
export const SELL_TIER_TONE: Record<string, Tone> = {
  loss: 'success',
  short_term: 'warning',
}

/** A sale year's filing profile. Fallback `info` (one jurisdiction). */
export const FILING_PROFILE_TONE: Record<string, Tone> = {
  US_AND_KR: 'warning',
}

/** A planned sale's role in the plan. Fallback `neutral`. */
export const PLAN_ROLE_TONE: Record<string, Tone> = {
  loss: 'danger',
  gain: 'info',
  mixed: 'warning',
  neutral: 'neutral',
}

/**
 * The tax-opportunity panel shows a scenario's input and result when a target
 * is set, and the loss-harvest inventory when it is not. These two maps are
 * keyed by that mode; the result splits a target scenario by whether it owes tax.
 */
export const PLANNING_INPUT_TONE: Record<string, Tone> = {
  target: 'neutral',
  harvest: 'success',
}

export const PLANNING_RESULT_TONE: Record<string, Tone> = {
  harvest: 'info',
  tax_due: 'warning',
  no_tax: 'success',
}

/**
 * Triage priority.
 *
 * Anything that is not high or medium reads as informational, not as a muted
 * afterthought — this keeps the two identical page-local copies' behaviour,
 * including their `info` fallback. Changing that is a design decision, not a
 * consolidation one.
 */
export function priorityTone(priority: string | null | undefined): Tone {
  return severityTone(severityOf(PRIORITY_SEVERITY, priority, 'info'))
}
