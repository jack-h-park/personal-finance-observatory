import type { StatementPeriodEvidence } from '@/lib/domain/assets/statement-periods'
import type { NetWorth } from '@/lib/net-worth'

type StatusRow = { status: string }
type AccountRow = StatusRow & { account?: string; statementPeriodEnd?: string | null; statementPeriodEvidence?: StatementPeriodEvidence }
type FileSummary = { fresh: number; stale: number; drift: number; missing: number }
export type CoverageReaders = {
  accounts: () => { rows: AccountRow[] }
  supplementary: () => { rows: StatusRow[] }
  checks: () => StatusRow[]
  files: () => { summary: FileSummary }
}

/** Dates describe observations, not proof that a complete period was supplied. */
export function dateRange(dates: (string | null | undefined)[]) {
  const known = dates.filter((date): date is string => Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date))).sort()
  return { oldest: known[0] ?? null, newest: known.at(-1) ?? null, undated: dates.length - known.length }
}

function read<T>(reader: () => T): T | null {
  try { return reader() } catch { return null }
}
function counts(rows: StatusRow[] | undefined) {
  if (!rows?.length) return null
  return {
    current: rows.filter(row => row.status === 'current').length,
    dueSoon: rows.filter(row => row.status === 'due_soon').length,
    actionNeeded: rows.filter(row => row.status === 'action_needed').length,
    missing: rows.filter(row => row.status === 'missing' || row.status === 'unconfirmed').length,
  }
}

/** Read each signal independently; missing evidence must never become a green zero. */
export function collectAssetCoverage(summary: NetWorth, readers: CoverageReaders) {
  const accounts = read(readers.accounts), supplementary = read(readers.supplementary)
  const checks = read(readers.checks), files = read(readers.files)
  const nonzero = summary.cash.filter(row => row.balance !== 0)
  const statementEvidence = accounts?.rows.map(row => ({ account: row.account ?? null, ...(row.statementPeriodEvidence ?? { state: 'unconfirmed' as const, periodEnd: null, sources: [] }) })) ?? null
  return {
    cash: { ...dateRange(nonzero.map(row => row.asOfDate)), nonzero: nonzero.length, zero: summary.cash.length - nonzero.length },
    accounts: counts(accounts?.rows),
    supplementary: counts(supplementary?.rows),
    statementPeriods: accounts?.rows.length ? dateRange(accounts.rows.map(row => row.statementPeriodEvidence?.state === 'declared' ? row.statementPeriodEvidence.periodEnd : null)) : null,
    statementEvidence,
    statementPeriodCounts: statementEvidence?.length ? { declared: statementEvidence.filter(row => row.state === 'declared').length, conflicting: statementEvidence.filter(row => row.state === 'conflicting').length, unconfirmed: statementEvidence.filter(row => row.state === 'unconfirmed').length } : null,
    failedChecks: checks?.length ? checks.filter(row => row.status !== 'pass').length : null,
    files: files?.summary ?? null,
  }
}
export type AssetCoverageReview = ReturnType<typeof collectAssetCoverage>

export type DataStatus = { state: 'problem' | 'attention' | 'ok' | 'unknown'; count: number }

/**
 * The review as one status for a one-line link: the worst signal and how many items carry it.
 *
 * Needs action: an account or supplementary source marked action needed or missing, a failed
 * validation check, a missing file, a conflicting statement period. To check: a source due
 * soon, a stale or changed file. An unconfirmed statement period counts as neither; most
 * statements declare no period, and the coverage panel says so. With no signal readable the
 * status is unknown rather than a green zero, the same rule `collectAssetCoverage` keeps.
 */
export function dataStatus(review: AssetCoverageReview): DataStatus {
  const { accounts, supplementary, files, failedChecks, statementPeriodCounts } = review
  if (!accounts && !supplementary && !files && failedChecks == null) return { state: 'unknown', count: 0 }
  const problem =
    (accounts?.actionNeeded ?? 0) + (accounts?.missing ?? 0) +
    (supplementary?.actionNeeded ?? 0) + (supplementary?.missing ?? 0) +
    (failedChecks ?? 0) + (files?.missing ?? 0) + (statementPeriodCounts?.conflicting ?? 0)
  if (problem) return { state: 'problem', count: problem }
  const attention = (accounts?.dueSoon ?? 0) + (supplementary?.dueSoon ?? 0) + (files?.stale ?? 0) + (files?.drift ?? 0)
  if (attention) return { state: 'attention', count: attention }
  return { state: 'ok', count: 0 }
}
