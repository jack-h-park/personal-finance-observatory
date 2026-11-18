import Link from 'next/link'
import { DataTable } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Card, EmptyState, FormError, HeroAside, MetricField, MetricHeroCard, Note, Panel, Signed, TextLink, marketTone } from '@/components/ui'
import { getOperationalHealth, getRebalanceReview } from '@/lib/adapters/portfolio-db'
import { EMPTY_VALUE, fmtNumber, fmtPct, fmtPctRange } from '@/lib/format'
import { createMoneyFormatter } from '@/lib/currency'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { getGlossary } from '@/lib/glossary'
import { getLanguage } from '@/lib/i18n-server'
import { getPageCopy } from '@/lib/ui-copy'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { CardRow, KpiBand } from '@/components/layout'
import { PositionCell } from '@/components/PositionCell'
import { SubmitButton } from '@/components/SubmitButton'
import { MARKET_GAP_HOLD_PCT, SHORT_TERM_WATCH_PCT } from '@/lib/rebalance-policy'
import { dbAvailable, portfolioToday } from '@/lib/adapters/portfolio-db'
import { getRebalanceInput } from '@/lib/adapters/rebalance-input'
import { getAllocationPolicy, rebalanceWrappers } from '@/lib/rebalance/allocation-policy'
import { computeAllocation, type Allocation, type SleeveRow } from '@/lib/rebalance/allocation'
import { getInstrumentClasses, type InstrumentClasses } from '@/lib/rebalance/instrument-classes'
import { listProposals, type Proposal, type ProposalStatus } from '@/lib/rebalance/proposal-store'
import { isProposalErrorCode, PROPOSAL_STATUS_TONE } from '@/lib/rebalance/proposal-actions'
import { fmtDateShort } from '@/lib/format'
import { createManualProposal } from './actions'
import { DRIFT_BAND_SEVERITY, REBALANCE_ACTION_TONE, TO_REVIEW_SEVERITY, categoryTone, countTone, statusTone } from '@/lib/tone'
import { rebalanceLinkedIssues } from '@/lib/header-status'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/rebalance')

// Matches OPEN_STATUSES in lib/rebalance/proposal-store.ts: a reconciled proposal awaiting its close is listed with
// the past ones (its page still closes it) and does not hold the open slot.
const OPEN: ProposalStatus[] = ['draft', 'targets_approved', 'plan_approved', 'executing']

/** The allocation by sleeve, or why there is none. Never throws: the market-gap view below must still render. */
function loadAllocation(): { state: 'ok'; allocation: Allocation } | { state: 'missing' | 'invalid' | 'classes_unreadable' | 'no_data' } {
  const policyState = getAllocationPolicy()
  if (policyState.error) return { state: 'invalid' }
  if (!policyState.policy) return { state: 'missing' }
  let classes: InstrumentClasses
  try {
    classes = getInstrumentClasses()
  } catch (error) {
    console.error('[rebalance] instrument classes:', error)
    return { state: 'classes_unreadable' }
  }
  if (!dbAvailable()) return { state: 'no_data' }
  try {
    const input = getRebalanceInput(portfolioToday(), undefined, rebalanceWrappers(policyState.policy))
    return { state: 'ok', allocation: computeAllocation(input, policyState.policy, classes) }
  } catch (error) {
    console.error('[rebalance] allocation:', error)
    return { state: 'no_data' }
  }
}

function loadProposals(): Proposal[] | null {
  try {
    return listProposals()
  } catch (error) {
    console.error('[rebalance] proposals:', error)
    return null
  }
}

export default async function RebalancePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const language = await getLanguage()
  const money = createMoneyFormatter(await getCurrencyPreferences())
  const copy = getPageCopy('rebalance', language)
  const glossary = getGlossary(language)
  const rebalance = getRebalanceReview()
  const operational = getOperationalHealth()
  const freshnessIssues = operational.staleItems.length
  const holdWatch = rebalanceLinkedIssues(copy, { watch: rebalance.watchCandidates.length, freshness: freshnessIssues })
  const largestGap = rebalance.marketGaps.reduce((max, row) => Math.max(max, Math.abs(row.gapPct)), 0)
  // Positions already held in each under-target market, read by the Add rows of the gap table.
  const addCandidates = new Map<string, number>()
  for (const row of rebalance.addContext) addCandidates.set(row.market, row.candidateCount)
  const proposalCopy = getPageCopy('rebalanceProposal', language)
  const allocationState = loadAllocation()
  const proposals = loadProposals()
  const openProposal = proposals?.find((p) => OPEN.includes(p.status)) ?? null
  const pastProposals = proposals?.filter((p) => p !== openProposal) ?? []
  const errorMessage = isProposalErrorCode(params.error) ? proposalCopy.errors[params.error] : null
  const ac = copy.allocation
  const pc = copy.proposals

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/rebalance', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle(rebalance.policy.marketTargets.map((row) => `${row.market} ${fmtPct(row.targetPct, { digits: 0 })}`).join(' / '), fmtNumber(rebalance.policy.positionCapPct))}
        status={holdWatch.status}
        actions={<TextLink href="/rebalance/settings">{copy.settingsLink}</TextLink>}
        autoRefresh={false}
      />

      {errorMessage && <FormError title={proposalCopy.errorTitle} messages={[errorMessage]} />}

      <CardRow columns="hero">
        <MetricHeroCard
          id="rebalance-lead"
          title={copy.largestMarketGap}
          info={glossary.marketGap.description}
          eyebrow={copy.primarySignal}
          value={fmtPct(largestGap)}
          hint={copy.marketGapHint}
        >
          <KpiBand>
            <MetricField
              label={copy.baseMarketValue}
              value={money(rebalance.totals.base_market_value)}
              hint={copy.baseMarketValueHint}
            />
            <MetricField
              label={copy.reduceCandidates}
              value={fmtNumber(rebalance.reduceCandidates.length)}
              hint={copy.reduceCandidatesHint}
              tone={countTone(TO_REVIEW_SEVERITY, rebalance.reduceCandidates.length)}
            />
            <MetricField
              label={copy.watchBeforeAction}
              value={fmtNumber(rebalance.watchCandidates.length + freshnessIssues)}
              hint={copy.watchBeforeActionHint}
              tone={countTone(TO_REVIEW_SEVERITY, rebalance.watchCandidates.length + freshnessIssues)}
            />
          </KpiBand>
        </MetricHeroCard>

        <HeroAside title={copy.executionRisk} info={copy.executionRiskInfo} note={copy.decisionOrder}>
          <MetricField
            label={copy.taxSensitive}
            value={fmtNumber(rebalance.taxSensitive.length)}
            hint={copy.taxSensitiveHint}
            tone={countTone(TO_REVIEW_SEVERITY, rebalance.taxSensitive.length)}
            size="metric"
          />
          <MetricField
            label={copy.freshnessIssuesLabel}
            value={fmtNumber(freshnessIssues)}
            info={glossary.freshness.description}
            hint={copy.freshnessIssuesHint}
            tone={countTone(TO_REVIEW_SEVERITY, freshnessIssues)}
          />
        </HeroAside>
      </CardRow>

      <Card id="rebalance-hold-watch" title={copy.holdWatch} issues={holdWatch.issues}>
        {rebalance.watchCandidates.length === 0 && freshnessIssues === 0 ? (
          <EmptyState ok>{copy.noBlockers}</EmptyState>
        ) : (
          <div className="space-y-4">
            {freshnessIssues > 0 && (
              <Panel text="caption-2">
                <div className="font-medium text-warning">{copy.staleInputs(freshnessIssues)}</div>
                <Link href="/health" className="mt-1 inline-flex min-h-6 items-center text-label font-medium text-info hover:underline">
                  {copy.openHealth}
                </Link>
              </Panel>
            )}
            {rebalance.watchCandidates.length > 0 && (
              <DataTable
                rows={rebalance.watchCandidates}
                columns={[
                  { key: 'ticker', label: copy.columns.position, render: (r) => <PositionCell market={r.market} ticker={r.ticker} name={r.name} /> },
                  { key: 'base_cost', label: copy.columns.baseCost, align: 'right', render: (r) => money(r.base_cost) },
                  { key: 'native_cost', label: copy.columns.nativeCost, align: 'right', render: (r) => money(r.native_cost, r.currency) },
                  { key: 'reason', label: copy.columns.reason, render: (r) => copy.reasons[r.reasonCode] },
                ]}
              />
            )}
          </div>
        )}
      </Card>

      <CardRow>
        <Card title={copy.marketTargetGaps}>
          <DataTable
            minWidth="30rem"
            rows={rebalance.marketGaps}
            columns={[
              { key: 'market', label: copy.columns.market, render: (r) => <Badge tone={marketTone(r.market)}>{r.market}</Badge> },
              { key: 'currentPct', label: copy.columns.current, align: 'right', render: (r) => fmtPct(r.currentPct) },
              { key: 'targetPct', label: copy.columns.target, align: 'right', render: (r) => fmtPct(r.targetPct) },
              { key: 'gapValue', label: copy.columns.gap, align: 'right', render: (r) => <Signed value={r.gapValue} format={(m) => money(m, 'KRW')} /> },
              { key: 'action', label: copy.columns.action, render: (r) => <Badge tone={categoryTone(REBALANCE_ACTION_TONE, r.action, 'warning')}>{copy.actions[r.action] ?? r.action}</Badge> },
              {
                key: 'existingPositions',
                label: copy.columns.existingPositions,
                align: 'right',
                render: (r) => {
                  const count = r.action === 'Add' ? addCandidates.get(r.market) : undefined
                  return count == null ? EMPTY_VALUE : fmtNumber(count)
                },
              },
            ]}
          />
          <Note spacing="above-2">
            {copy.guardrails(
              fmtPct(MARKET_GAP_HOLD_PCT, { digits: 0 }),
              fmtPct(rebalance.policy.positionCapPct, { digits: 0 }),
              fmtPct(SHORT_TERM_WATCH_PCT, { digits: 0 }),
            )}
          </Note>
          {rebalance.policy.marketSplitSource === 'allocation_policy' ? (
            <Note>{copy.marketSource.derived}</Note>
          ) : (
            <Note>
              {copy.marketSource.fallback} <TextLink href="/rebalance/settings">{copy.settingsLink}</TextLink>
            </Note>
          )}
        </Card>

        <Card
          title={ac.title}
          info={ac.info}
          action={
            allocationState.state === 'ok' && allocationState.allocation.unclassified.length > 0 ? (
              <Badge tone="warning">{ac.unclassified(allocationState.allocation.unclassified.length)}</Badge>
            ) : undefined
          }
        >
          {allocationState.state === 'ok' ? (
            <DataTable
              minWidth="28rem"
              rows={allocationState.allocation.sleeves}
              getRowKey={(r: SleeveRow) => r.sleeve}
              columns={[
                { key: 'sleeve', label: ac.sleeve, render: (r: SleeveRow) => <span className="font-medium text-ink">{proposalCopy.sleeves[r.sleeve]}</span> },
                { key: 'pct', label: ac.current, align: 'right', render: (r: SleeveRow) => fmtPct(r.pct) },
                { key: 'target', label: ac.target, align: 'right', render: (r: SleeveRow) => fmtPct(r.target) },
                { key: 'band', label: ac.band, align: 'right', render: (r: SleeveRow) => fmtPctRange(r.lower, r.upper, 1) },
                { key: 'status', label: ac.status, render: (r: SleeveRow) => <Badge tone={statusTone(DRIFT_BAND_SEVERITY, r.status)}>{ac.statuses[r.status]}</Badge> },
              ]}
            />
          ) : allocationState.state === 'missing' ? (
            <EmptyState>
              <span className="block">{ac.notConfigured}</span>
              <TextLink href="/rebalance/settings">{ac.configure}</TextLink>
            </EmptyState>
          ) : allocationState.state === 'invalid' ? (
            <EmptyState>
              <span className="block text-warning">{ac.policyInvalid}</span>
              <TextLink href="/rebalance/settings">{ac.configure}</TextLink>
            </EmptyState>
          ) : allocationState.state === 'classes_unreadable' ? (
            <EmptyState>
              <span className="block text-warning">{proposalCopy.classesUnreadable}</span>
              <TextLink href="/rebalance/settings">{ac.configure}</TextLink>
            </EmptyState>
          ) : (
            <EmptyState>{ac.noData}</EmptyState>
          )}
        </Card>
      </CardRow>

      <CardRow>
        <Card title={copy.reduceCandidates}>
          {rebalance.reduceCandidates.length === 0 ? (
            <EmptyState ok>{copy.noPositionAboveCap}</EmptyState>
          ) : (
            <DataTable
              rows={rebalance.reduceCandidates}
              columns={[
                { key: 'ticker', label: copy.columns.position, render: (r) => <PositionCell market={r.market} ticker={r.ticker} name={r.name} /> },
                { key: 'currentPct', label: copy.columns.currentPct, align: 'right', render: (r) => fmtPct(r.currentPct) },
                { key: 'capGapPct', label: copy.columns.overCap, align: 'right', render: (r) => fmtPct(r.capGapPct) },
                { key: 'capGapValue', label: copy.columns.gapValue, align: 'right', render: (r) => money(r.capGapValue) },
                { key: 'base_unrealized_gl', label: copy.columns.baseGl, align: 'right', render: (r) => (r.base_unrealized_gl == null ? EMPTY_VALUE : money(r.base_unrealized_gl)) },
                { key: 'short_term_ratio', label: copy.columns.shortPct, align: 'right', render: (r) => fmtPct(r.short_term_ratio) },
              ]}
            />
          )}
        </Card>

        <Card title={copy.taxSensitiveWatchlist}>
          {rebalance.taxSensitive.length === 0 ? (
            <EmptyState ok>{copy.noHighShortTerm}</EmptyState>
          ) : (
            <DataTable
              rows={rebalance.taxSensitive}
              columns={[
                { key: 'ticker', label: copy.columns.position, render: (r) => <PositionCell market={r.market} ticker={r.ticker} name={r.name} /> },
                { key: 'base_market_value', label: copy.columns.baseMarket, align: 'right', render: (r) => (r.base_market_value == null ? EMPTY_VALUE : money(r.base_market_value)) },
                { key: 'short_term_ratio', label: copy.columns.shortPct, align: 'right', render: (r) => fmtPct(r.short_term_ratio) },
                { key: 'short_term_qty', label: copy.columns.shortQty, align: 'right', render: (r) => fmtNumber(r.short_term_qty, 4) },
                { key: 'reason', label: copy.columns.reason, render: (r) => copy.reasons[r.reasonCode] },
              ]}
            />
          )}
        </Card>
      </CardRow>

      <CardRow>
        <Card title={copy.outsidePolicy}>
          {rebalance.untargetedMarkets.length === 0 ? (
            <EmptyState ok>{copy.everyMarketTargeted}</EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-line-subtle">
                {rebalance.untargetedMarkets.map((row) => (
                  <li key={row.market} className="flex items-center gap-3 py-2 text-caption">
                    <Badge tone={marketTone(row.market)}>{row.market}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium tabular-nums text-ink">{money(row.currentValue)}</div>
                      <div className="text-label text-ink-3">{copy.ofPortfolioNoTarget(fmtPct(row.currentPctOfPortfolio))}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <Note spacing="above-2">
                {copy.outsidePolicyNote(rebalance.policy.marketTargets.map((row) => row.market).join('/'))}
              </Note>
            </>
          )}
        </Card>

        <Card title={pc.title} info={pc.info}>
          <div className="space-y-4">
            <Panel bordered={false} text="label-note">{proposalCopy.disclaimer}</Panel>
            {proposals === null ? (
              <EmptyState>{pc.unreadable}</EmptyState>
            ) : openProposal ? (
              <div className="rounded-md border border-line-subtle px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-label text-ink-3">{pc.open}</span>
                    <Link href={`/rebalance/proposals/${encodeURIComponent(openProposal.id)}`} className="font-mono text-caption font-medium text-info hover:underline">
                      {openProposal.id}
                    </Link>
                  </div>
                  <Badge tone={PROPOSAL_STATUS_TONE[openProposal.status]}>{proposalCopy.statuses[openProposal.status]}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-label">
                  <div><dt className="text-ink-3">{pc.kind}</dt><dd className="text-ink">{proposalCopy.kinds[openProposal.kind]}</dd></div>
                  <div><dt className="text-ink-3">{pc.created}</dt><dd className="tabular-nums text-ink">{fmtDateShort(openProposal.createdAt, language)}</dd></div>
                  <div><dt className="text-ink-3">{pc.expires}</dt><dd className="tabular-nums text-ink">{fmtDateShort(openProposal.expiresAt, language)}</dd></div>
                </dl>
              </div>
            ) : (
              <div className="space-y-2">
                <Note size="caption">{pc.none}</Note>
                {allocationState.state === 'ok' && (
                  <form action={createManualProposal} className="space-y-1">
                    <SubmitButton variant="solid">{pc.create}</SubmitButton>
                    <Note>{pc.createNote}</Note>
                  </form>
                )}
              </div>
            )}
            {proposals !== null && (
              <div>
                <div className="mb-1 text-label font-medium text-ink-2">{pc.past}</div>
                {pastProposals.length === 0 ? (
                  <Note>{pc.noPast}</Note>
                ) : (
                  <ul className="divide-y divide-line-subtle">
                    {pastProposals.slice(0, 12).map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-1.5 text-label">
                        <Link href={`/rebalance/proposals/${encodeURIComponent(p.id)}`} className="font-mono font-medium text-info hover:underline">
                          {p.id}
                        </Link>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-ink-3">{fmtDateShort(p.createdAt, language)}</span>
                          <Badge tone={PROPOSAL_STATUS_TONE[p.status]}>{proposalCopy.statuses[p.status]}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Card>
      </CardRow>
    </>
  )
}
