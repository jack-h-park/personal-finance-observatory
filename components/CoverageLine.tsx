import Link from 'next/link'
import { HelpPopover } from '@/components/HelpPopover'
import { dataStatus, type AssetCoverageReview } from '@/lib/application/asset-coverage'
import type { Language } from '@/lib/i18n'
import type { NetWorth } from '@/lib/net-worth'
import { severityTone, toneBgClass, type Severity } from '@/lib/tone'
import { getPageCopy } from '@/lib/ui-copy'

const STATE_SEVERITY: Record<ReturnType<typeof dataStatus>['state'], Severity> = { problem: 'problem', attention: 'attention', ok: 'ok', unknown: 'quiet' }

/**
 * What a total covers and how its source data stands, in one line: "own assets · N excluded ·
 * liabilities not deducted", the full boundary sentence behind an info popover, and a link to
 * the data status on /health with the worst signal ("3 need action").
 *
 * It replaces a collapsible panel of twelve dates and counts and five caveat paragraphs, all
 * in one weight, that sat above the total and answered an operator's question on a page read
 * for the figure. The panel itself lives on /health now (`#health-asset-coverage`).
 */
export function CoverageLine({ summary, language, review }: { summary: NetWorth; language: Language; review: AssetCoverageReview | null }) {
  const copy = getPageCopy('assetCoverage', language)
  const omitted = summary.coverage?.omittedAssetCount ?? 0
  const status = review ? dataStatus(review) : { state: 'unknown' as const, count: 0 }
  const label = status.state === 'problem' || status.state === 'attention' ? copy.dataStates[status.state](status.count) : copy.dataStates[status.state]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-ink-3">
      <span className="inline-flex items-center">
        {copy.boundaryShort(omitted)}
        <HelpPopover language={language} label={copy.boundaryHelp} align="left">
          {copy.boundary(omitted)}
        </HelpPopover>
      </span>
      <Link href="/health#health-asset-coverage" className="inline-flex min-h-6 items-center gap-1.5 underline-offset-4 hover:underline">
        <span aria-hidden className={`h-2 w-2 rounded-full ${toneBgClass(severityTone(STATE_SEVERITY[status.state]))}`} />
        <span>{copy.dataStatus}</span>
        <span className="font-medium text-ink-2">{label}</span>
        <span aria-hidden>›</span>
      </Link>
    </div>
  )
}
