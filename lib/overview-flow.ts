import type { SpendingWindow } from '@/lib/domain/spending-window'

/**
 * The Overview's income-and-spending card: the periods it offers, and the value
 * it renders. Income is counted cash inflow over the window (/cash-inflow);
 * spending is net purchases over the same months (/spending).
 */
export const FLOW_RANGES = ['12m', 'ytd', 'lastYear', '24m'] as const
export type FlowRange = (typeof FLOW_RANGES)[number]

/** The `flow` query parameter; anything absent or unknown is the last 12 months. */
export function resolveFlowRange(value: string | undefined): FlowRange {
  return FLOW_RANGES.find((range) => range === value) ?? '12m'
}

export type SpendingRead =
  | { status: 'disabled' }
  | { status: 'unavailable' }
  /** `asOf` is the published snapshot's date; a local ledger has none. */
  | { status: 'available'; window: SpendingWindow; asOf?: string; reviewIncomplete?: boolean }

export type OverviewFlow = {
  range: FlowRange
  window: { start: string; end: string; months: number }
  /** null when cash inflow holds no records at all. */
  income: number | null
  /** null unless spending is available. */
  spending: SpendingWindow | null
  spendingState: 'available' | 'noActivity' | 'notPublished' | 'unreadable'
  /** The snapshot's publication date: spending stops there while income runs to today. */
  spendingAsOf: string | null
  spendingReviewIncomplete: boolean
}

export function overviewFlow(input: {
  range: FlowRange
  window: { start: string; end: string; months: number }
  inflow: { rangeTotal: number; hasRecords: boolean }
  spending: SpendingRead
}): OverviewFlow {
  const { spending } = input
  const spendingState =
    spending.status === 'disabled' ? 'notPublished'
    : spending.status === 'unavailable' ? 'unreadable'
    : spending.window.native.USD.netMinor == null && spending.window.native.KRW.netMinor == null ? 'noActivity'
    : 'available'
  return {
    range: input.range,
    window: { start: input.window.start, end: input.window.end, months: input.window.months },
    income: input.inflow.hasRecords ? input.inflow.rangeTotal : null,
    spending: spending.status === 'available' ? spending.window : null,
    spendingState,
    spendingAsOf: spending.status === 'available' ? spending.asOf ?? null : null,
    spendingReviewIncomplete: spending.status === 'available' && spending.reviewIncomplete === true,
  }
}

/** /spending offers 12 and 24 months; link the smallest one that holds the window. */
export function spendingHref(range: FlowRange): string {
  return range === '12m' || range === 'ytd' ? '/spending?period=12' : '/spending?period=24'
}

/**
 * An Overview link with every control in its query, so changing one (a trend
 * range, a flow period) keeps the others where they were.
 */
export function overviewHref(state: { trend: string; scope: string; metric: string; view: string; flow: FlowRange }): string {
  return `/?trend=${state.trend}&scope=${state.scope}&metric=${state.metric}&view=${state.view}&flow=${state.flow}`
}
