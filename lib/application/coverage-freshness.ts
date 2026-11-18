import type { AccountCoverageStatus } from '@/lib/adapters/portfolio-db'

const states: ReadonlySet<string> = new Set(['current', 'due_soon', 'action_needed', 'missing', 'unconfirmed'] satisfies AccountCoverageStatus[])

/** Read explicit additive metadata only. Never infer from dates, legacy status or gap flags. */
export function readCoverageFreshness(value: unknown): AccountCoverageStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const field = Object.getOwnPropertyDescriptor(value, 'freshnessStatus')
  const state: unknown = field && 'value' in field ? field.value : undefined
  return typeof state === 'string' && states.has(state) ? state as AccountCoverageStatus : null
}
