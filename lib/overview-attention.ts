import { positionBreaksCapped } from '@/lib/header-status'

export type AttentionKind = 'work_queue' | 'over_cap' | 'market_gap' | 'monthly_change'

export type AttentionItem = { kind: AttentionKind; count: number; href: string; capped: boolean }

const HREF: Record<AttentionKind, string> = {
  work_queue: '/data-ops#data-ops-priority-work',
  over_cap: '/rebalance',
  market_gap: '/rebalance',
  monthly_change: '/net-worth#net-worth-history',
}

/**
 * The Overview's needs-attention strip: counts only, each linking to the page
 * that lists the items, in the order a reader should act. Zero counts drop
 * out, so an empty list means the strip is hidden. The work-queue count is the
 * /data-ops queue total, a lower bound when its position-break row is capped.
 */
export function attentionItems(input: {
  queue: readonly { kind: string; count: number }[]
  overCap: number
  marketActions: readonly { action: 'Add' | 'Reduce' | 'Hold' }[]
  /** Months of the last year whose change beyond investing is flagged (lib/non-investment-change.ts). */
  flaggedMonths?: number
}): AttentionItem[] {
  const queueTotal = input.queue.reduce((sum, row) => sum + row.count, 0)
  const capped = input.queue.some((row) => row.kind === 'position_breaks' && positionBreaksCapped(row.count))
  const items: AttentionItem[] = [
    { kind: 'work_queue', count: queueTotal, href: HREF.work_queue, capped },
    { kind: 'over_cap', count: input.overCap, href: HREF.over_cap, capped: false },
    { kind: 'market_gap', count: input.marketActions.filter((gap) => gap.action !== 'Hold').length, href: HREF.market_gap, capped: false },
    { kind: 'monthly_change', count: input.flaggedMonths ?? 0, href: HREF.monthly_change, capped: false },
  ]
  return items.filter((item) => item.count > 0)
}
