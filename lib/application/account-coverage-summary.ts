import type { AccountCoverageStatus, SupplementaryCoverageKind } from '@/lib/adapters/portfolio-db'

export type CoverageSummaryRow = { status: AccountCoverageStatus; historyGap?: { from: string; to: string } }
export type CoverageSummaryGroupId = 'investments' | 'bankCma' | 'other'
export type CoverageSummaryGroup = {
  id: CoverageSummaryGroupId
  rows: number
  statuses: Record<AccountCoverageStatus, number>
  historyGaps: number
}
export type CoverageSummary = { groups: CoverageSummaryGroup[] }

/** Counts supplied source rows, not economic accounts; no dates, thresholds, identity joins or I/O. */
export function summarizeAccountCoverage(input: {
  investmentRows: readonly CoverageSummaryRow[]
  supplementaryRows: readonly (CoverageSummaryRow & { kind: SupplementaryCoverageKind })[]
}): CoverageSummary {
  const bank = (row: { kind: SupplementaryCoverageKind }) => row.kind === 'deposit' || row.kind === 'cma'
  const count = (id: CoverageSummaryGroupId, rows: readonly CoverageSummaryRow[]): CoverageSummaryGroup => {
    const statuses = { current: 0, due_soon: 0, action_needed: 0, missing: 0, unconfirmed: 0 }
    let historyGaps = 0
    for (const row of rows) {
      statuses[row.status]++
      if (row.historyGap) historyGaps++
    }
    return { id, rows: rows.length, statuses, historyGaps }
  }
  return { groups: [
    count('investments', input.investmentRows),
    count('bankCma', input.supplementaryRows.filter(bank)),
    count('other', input.supplementaryRows.filter(row => !bank(row))),
  ] }
}
