import React, {type ReactNode} from 'react'
import {getPageCopy} from '@/lib/ui-copy'
import type {Language} from '@/lib/i18n'
import {
  portfolioToday,
  type AccountCoverage,
  type AccountCoverageStatus,
  type CoverageAction,
  type CoverageArtifact,
  type CoverageDetail,
} from '@/lib/adapters/portfolio-db'
import {maskAccountLabel} from '@/lib/account-label'
import {fmtDate} from '@/lib/format'

export type CoverageCopy = ReturnType<typeof getPageCopy<'dataOps'>>['coverage']

/** An artifact code as reader copy. The account inside a KR certificate is masked here, not in the adapter. */
export function coverageArtifactLabel(artifact: CoverageArtifact, c: CoverageCopy): string {
  switch (artifact.code) {
    case 'KR_CERTIFICATE':
      return c.artifact.KR_CERTIFICATE(artifact.brokerage, maskAccountLabel(artifact.account))
    case 'US_HOLDINGS_AND_TRANSACTIONS_CSV':
      return c.artifact.US_HOLDINGS_AND_TRANSACTIONS_CSV(artifact.brokerage)
    default:
      return c.artifact[artifact.code] ?? artifact.code
  }
}

export function coverageActionLabel(action: CoverageAction, c: CoverageCopy): string {
  switch (action.code) {
    case 'KR_CERTIFICATE':
      return c.action.KR_CERTIFICATE(action.brokerage, maskAccountLabel(action.account))
    case 'US_HOLDINGS_AND_TRANSACTIONS':
      return c.action.US_HOLDINGS_AND_TRANSACTIONS(action.brokerage)
    default:
      return c.action[action.code] ?? action.code
  }
}

export function coverageDetailLabel(detail: CoverageDetail, c: CoverageCopy): string {
  switch (detail.code) {
    case 'UNCONFIRMED_PERIOD':
      return c.detail.UNCONFIRMED_PERIOD(detail.lastTransaction ? fmtDate(detail.lastTransaction) : null)
    default:
      return c.detail[detail.code] ?? detail.code
  }
}

export function AccountUpdateAction({status, language, confirmation, children}: {
  status: AccountCoverageStatus
  language: Language
  confirmation: string
  children?: ReactNode
}) {
  const copy = getPageCopy('accountUpdates', language)
  if (status === 'current') return copy.noAction
  if (status === 'due_soon') return copy.noActionSoon
  if (status === 'unconfirmed') return confirmation
  return children
}

export function InvestmentUpdateAction({row, language}: {row: AccountCoverage; language: Language}) {
  const copy = getPageCopy('accountUpdates', language)
  const coverage = getPageCopy('dataOps', language).coverage
  // One entry per artifact still owed: each stale source of a multi-source
  // account, or the account itself. The artifact is rendered from its code.
  const pending = row.sources.length > 1
    ? row.sources
      .filter(source => !['current','due_soon'].includes(source.status))
      .map(source => ({...source, artifactText: coverageArtifactLabel(source.artifact, coverage)}))
    : [{...row, artifactText: row.artifacts.map(artifact => coverageArtifactLabel(artifact, coverage)).join(' + ')}]
  const actionStatus = row.sources.length > 1 && row.status === 'unconfirmed' ? 'action_needed' : row.status
  return <AccountUpdateAction status={actionStatus} language={language} confirmation={coverageActionLabel(row.action, coverage)}>
    {pending.map((source, index) => <div key={index} className="mb-2 last:mb-0">
      <div className="font-medium text-ink">{source.artifactText}</div>
      {source.status === 'unconfirmed' ? <div>{copy.confirmPeriod}</div> : source.method === 'mcp' || source.method === 'api'
        ? <div className="mt-1 text-label text-ink-3">{copy.regenerate(source.artifactText)}</div>
        : <>
          <div className="mt-1 text-label text-info">{copy.downloadRange(source.downloadFrom ? fmtDate(source.downloadFrom) : null, fmtDate(portfolioToday()))}</div>
          <div className="mt-1 text-label text-ink-3">{source.method === 'manual' ? copy.saveAction(source.destination) : copy.inboxAction}</div>
        </>}
      {source.missingDisposals?.length ? <div className="mt-1 text-label text-danger">{copy.missingDisposals(source.missingDisposals.join(', '))}</div> : null}
    </div>)}
  </AccountUpdateAction>
}
