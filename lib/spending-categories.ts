import type { SpendingRank, SpendingViewRow } from '@/lib/domain/spending-view'

/**
 * One category list for /spending. USD purchases carry issuer or reference
 * labels in English and KRW purchases carry BankSalad labels in Korean, so the
 * same kind of spending arrived under two names and was ranked twice. Each
 * source label below maps to one key; the names a reader sees live in
 * `lib/ui-copy/pages/spending.ts` (`categoryNames`).
 *
 * The source labels are data and must match the feeds exactly (after trimming).
 * A label not listed here passes through unchanged, so a new feed label shows
 * up under its own name instead of disappearing.
 */
export const SPENDING_CATEGORY_KEYS = [
  'food', 'shopping', 'housing', 'household', 'transport', 'health',
  'travel', 'entertainment', 'beauty', 'education', 'finance', 'giving',
] as const
export type SpendingCategoryKey = (typeof SPENDING_CATEGORY_KEYS)[number]

export const SPENDING_CATEGORY_SOURCES: Record<SpendingCategoryKey, readonly string[]> = {
  // Groceries joins food: BankSalad has no separate groceries label, so splitting it would skew KRW.
  food: ['식비', '카페/간식', 'Dining & Drinks', 'Groceries'],
  shopping: ['온라인쇼핑', '패션/쇼핑', 'Shopping'],
  housing: ['주거/통신', '주거비', 'Utilities'],
  // The US issuers' Home is furnishings and supplies, not rent.
  household: ['생활', 'Home'],
  transport: ['교통', 'Auto & Transport'],
  health: ['의료/건강', 'Health'],
  travel: ['Travel'],
  entertainment: ['문화/여가', 'Entertainment'],
  beauty: ['뷰티/미용'],
  education: ['자녀/육아', 'Education'],
  finance: ['금융'],
  giving: ['Charity & Donations'],
}

const BY_SOURCE = new Map<string, SpendingCategoryKey>(
  SPENDING_CATEGORY_KEYS.flatMap((key) => SPENDING_CATEGORY_SOURCES[key].map((label) => [label, key] as const)),
)

export function isSpendingCategoryKey(value: string): value is SpendingCategoryKey {
  return (SPENDING_CATEGORY_KEYS as readonly string[]).includes(value)
}

/** The key for a source label, the label itself when it is not mapped, or undefined for none. */
export function canonicalSpendingCategory(label: string | undefined): string | undefined {
  if (label === undefined) return undefined
  const trimmed = label.trim()
  return BY_SOURCE.get(trimmed) ?? trimmed
}

/** The rows with each category replaced by its key, so rankings, filters and the table use one list. */
export function withCanonicalCategories(rows: SpendingViewRow[]): SpendingViewRow[] {
  return rows.map((row) => (row.category === undefined ? row : { ...row, category: canonicalSpendingCategory(row.category) }))
}

export type CategoryShare = { key: string; amountMinor: number; count: number; pct: number }

/**
 * Shares of purchases (before refunds, as the rankings are): the `top`
 * categories, then everything else as `rest`, then `uncategorized`. Empty when
 * there were no purchases.
 */
export function categoryShareItems(
  combined: { categories: SpendingRank[]; uncategorized: { amountMinor: number; count: number } },
  top: number,
): CategoryShare[] {
  const total = combined.categories.reduce((sum, row) => sum + row.amountMinor, 0) + combined.uncategorized.amountMinor
  if (total <= 0) return []
  const share = (key: string, amountMinor: number, count: number) => ({ key, amountMinor, count, pct: (amountMinor / total) * 100 })
  const leading = combined.categories.slice(0, top).map((row) => share(row.name, row.amountMinor, row.count))
  const rest = combined.categories.slice(top)
  const restItem = rest.length
    ? [share('rest', rest.reduce((sum, row) => sum + row.amountMinor, 0), rest.reduce((sum, row) => sum + row.count, 0))]
    : []
  const uncategorized = combined.uncategorized.count
    ? [share('uncategorized', combined.uncategorized.amountMinor, combined.uncategorized.count)]
    : []
  return [...leading, ...restItem, ...uncategorized]
}
