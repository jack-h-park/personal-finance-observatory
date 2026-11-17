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
