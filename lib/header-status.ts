import { createElement, type ReactNode } from 'react'
import { fmtNumber } from '@/lib/format'
import type { Severity } from '@/lib/tone'
import type { getPageCopy } from '@/lib/ui-copy'

/**
 * The page's one-line verdict in its header. When it reports a problem, `href`
 * points at the card that lists it (`#<card id>`).
 */
export type HeaderStatus = { severity: Severity; label: ReactNode; href?: string }

/**
 * One status for a header that has a linkable issue and a count of rows
 * converted at today's rate. The issue wins and carries the link; when both
 * are non-zero one label names both, so the header never shows an all-clear
 * beside a warning. The undated count alone has nowhere to link.
 */
function issueStatus(
  issue: number,
  undated: number,
  href: string,
  labels: { issue: () => ReactNode; undated: () => ReactNode; both: () => ReactNode },
  clear?: HeaderStatus,
): HeaderStatus | undefined {
  if (issue > 0) return { severity: 'attention', label: undated > 0 ? labels.both() : labels.issue(), href }
  if (undated > 0) return { severity: 'attention', label: labels.undated() }
  return clear
}

export function incomeHeaderStatus(copy: ReturnType<typeof getPageCopy<'income'>>, tickerless: number, undated: number): HeaderStatus {
  return issueStatus(
    tickerless,
    undated,
    '#income-tickerless',
    {
      issue: () => copy.tickerlessRows(fmtNumber(tickerless)),
      undated: () => copy.undatedRows(fmtNumber(undated)),
      both: () => copy.tickerlessAndUndated(fmtNumber(tickerless), fmtNumber(undated)),
    },
    { severity: 'ok', label: copy.tickerMapped },
  )!
}

/** `triageHref` is the page URL that opens the unclassified filter, keeping the source, currency and range. */
export function cashInflowHeaderStatus(
  copy: ReturnType<typeof getPageCopy<'cashInflow'>>,
  unclassified: number,
  undated: number,
  triageHref: string,
): HeaderStatus | undefined {
  // The hint explains how to classify a credit, so it rides on the pill that links to the triage card.
  const hinted = (label: string) => createElement('span', { title: copy.unclassifiedHint }, label)
  return issueStatus(unclassified, undated, `${triageHref}#cash-inflow-unclassified`, {
    issue: () => hinted(copy.unclassified(fmtNumber(unclassified))),
    undated: () => copy.undated(fmtNumber(undated)),
    both: () => hinted(copy.unclassifiedAndUndated(fmtNumber(unclassified), fmtNumber(undated))),
  })
}
