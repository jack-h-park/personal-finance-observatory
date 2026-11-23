import type { SpendingViewRow } from '@/lib/domain/spending-view'

/**
 * The /spending Transactions tab: which ledger rows it lists and in what order.
 * The totals above it count purchases, refunds and fees only, so by default the
 * list does too; card payments, own-account transfers and other rows are a
 * toggle away and their count is shown.
 */
export const SPENDING_ROW_KINDS: readonly SpendingViewRow['kind'][] = ['purchase', 'refund', 'fee']

export type TransactionOptions = { kinds: 'spending' | 'all'; sort: 'recent' | 'largest' }

export function resolveTransactionOptions(params: { kinds?: string; sort?: string }): TransactionOptions {
  return {
    kinds: params.kinds === 'all' ? 'all' : 'spending',
    sort: params.sort === 'largest' ? 'largest' : 'recent',
  }
}

/** Money out as positive: a purchase reads positive and a refund negative, as the spending totals do. */
export function spendingAmountMinor(row: SpendingViewRow): number {
  return -row.amountMinor
}

/**
 * The rows to list and how many the kind filter hid. Newest first by activity
 * date, or largest first by the KRW amount spent (`krw` gives a row's KRW
 * amount, null without a rate; those rows go last, newest first).
 */
export function visibleTransactions(
  rows: SpendingViewRow[],
  options: TransactionOptions,
  krw: (row: SpendingViewRow) => number | null,
): { rows: SpendingViewRow[]; hidden: number } {
  const shown = options.kinds === 'all' ? rows : rows.filter((row) => SPENDING_ROW_KINDS.includes(row.kind))
  const recent = (a: SpendingViewRow, b: SpendingViewRow) => b.activityDate.localeCompare(a.activityDate) || a.id.localeCompare(b.id)
  const sorted = [...shown].sort((a, b) => {
    if (options.sort === 'recent') return recent(a, b)
    const left = krw(a)
    const right = krw(b)
    if (left === null || right === null) return left === right ? recent(a, b) : left === null ? 1 : -1
    // KRW amounts are signed as stored (money out negative), so the amount spent is the negation.
    return (-right) - (-left) || recent(a, b)
  })
  return { rows: sorted, hidden: rows.length - shown.length }
}
