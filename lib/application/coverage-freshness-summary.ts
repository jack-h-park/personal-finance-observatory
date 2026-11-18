import type { AccountCoverageStatus, SupplementaryCoverageKind } from '@/lib/adapters/portfolio-db'
import { readCoverageFreshness } from './coverage-freshness'

export type SupplementaryFreshnessGroup = {
  id: 'bankCma' | 'other'
  rows: number
  statuses: Record<AccountCoverageStatus, number>
  unavailable: number
  historyGaps: number
}

/** Explicit supplementary source metadata only; no status/date fallback or new completeness judgment. */
export function summarizeSupplementaryFreshness(rows: readonly {
  kind: SupplementaryCoverageKind
  freshnessStatus?: unknown
  historyGap?: { from: string; to: string }
}[]): SupplementaryFreshnessGroup[] {
  const groups: SupplementaryFreshnessGroup[] = ['bankCma', 'other'].map(id => ({
    id: id as SupplementaryFreshnessGroup['id'], rows: 0,
    statuses: { current: 0, due_soon: 0, action_needed: 0, missing: 0, unconfirmed: 0 }, unavailable: 0, historyGaps: 0,
  }))
  for (const row of rows) {
    const group = groups[row.kind === 'deposit' || row.kind === 'cma' ? 0 : 1]
    group.rows++
    const state = readCoverageFreshness(row)
    if (state === null) group.unavailable++
    else group.statuses[state]++
    if (row.historyGap) group.historyGaps++
  }
  return groups
}
