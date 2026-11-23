/**
 * Chart and swatch colours, in one place.
 *
 * Every value is a theme token, so a colour follows the light and dark themes.
 * No 'use client': server pages (net worth) and client charts read the same
 * maps, so a class keeps its colour across pages. The total-assets chart and
 * the allocation shares used to keep their own copies, and the net-worth copy
 * had to spell crypto's colour out by hand because charts.tsx is a client
 * module.
 */
import { marketTone, type Tone } from '@/lib/tone'

/** A tone as a chart colour (an SVG stroke or fill cannot take a Tailwind class). */
export const TONE_VAR: Record<Tone, string> = {
  neutral: 'var(--text-tertiary)',
  info: 'var(--accent-info)',
  success: 'var(--accent-success)',
  warning: 'var(--accent-warning)',
  danger: 'var(--accent-danger)',
}

const CURRENCY_MARKET: Record<string, string> = { KRW: 'KR', USD: 'US' }

/**
 * A market's colour on a chart, derived from the same rule that colours its
 * badge — so a new market cannot end up green in a table and orange in a chart.
 * Currency codes map to the market that trades in them.
 */
export function marketColor(key: string) {
  return TONE_VAR[marketTone(CURRENCY_MARKET[key] ?? key)]
}

/**
 * One fixed colour per asset class. The keys are the union of the total-assets
 * chart's classes (`stocks`, `pensions`) and the allocation classes
 * (`us_equity`, `kr_equity`, `bonds`, `pension`, `unclassified`); the two
 * spellings of pension share one colour.
 */
export const ASSET_CLASS_COLOR: Record<
  'stocks' | 'us_equity' | 'kr_equity' | 'bonds' | 'gold' | 'crypto' | 'pensions' | 'pension' | 'cash' | 'unclassified',
  string
> = {
  stocks: 'var(--brand-blue)',
  us_equity: 'var(--brand-blue)',
  kr_equity: 'var(--brand-cyan)',
  bonds: 'var(--accent-info)',
  gold: 'var(--brand-pink)',
  crypto: marketColor('CRYPTO'),
  pensions: 'var(--brand-purple)',
  pension: 'var(--brand-purple)',
  cash: 'var(--accent-success)',
  unclassified: 'var(--text-tertiary)',
}

/** One fixed colour per account wrapper. */
export const WRAPPER_COLOR: Record<'taxable' | 'isa' | 'pension', string> = {
  taxable: 'var(--brand-blue)',
  isa: 'var(--brand-cyan)',
  pension: 'var(--brand-purple)',
}

/**
 * The two parts of a security's change over a selected period on /net-worth:
 * money put in (or taken out), and what the market did. Neither is a status, so
 * neither takes a tone; the side of the axis carries the sign.
 */
export const RANGE_SEGMENT_COLOR: Record<'moneyIn' | 'marketEffect', string> = {
  moneyIn: 'var(--text-tertiary)',
  marketEffect: 'var(--brand-blue)',
}

/** The children's accounts, drawn as their own band on the total-assets chart. */
export const CHILDREN_COLOR = 'var(--brand-cyan)'

/**
 * One fixed colour per cash-inflow category. Counted categories take brand
 * hues, not status tones, so a chart of income never reads as a warning.
 * Unclassified money waits on a decision, so it is the warning tone (amber
 * counts what waits on a decision; red is for faults).
 */
/**
 * /spending category shares, by rank rather than by category, since the
 * leading categories differ from period to period. The rest of the
 * categories are grey and uncategorized purchases are amber: a to-do.
 */
export const SPENDING_SHARE_COLORS = [
  'var(--brand-blue)',
  'var(--brand-cyan)',
  'var(--brand-purple)',
  'var(--brand-pink)',
  'color-mix(in srgb, var(--brand-blue) 50%, var(--bg-card))',
  'color-mix(in srgb, var(--brand-cyan) 50%, var(--bg-card))',
] as const

export function spendingShareColor(key: string, index: number): string {
  if (key === 'uncategorized') return TONE_VAR.warning
  if (key === 'rest') return 'var(--text-tertiary)'
  return SPENDING_SHARE_COLORS[index % SPENDING_SHARE_COLORS.length]
}

export const CASH_INFLOW_CATEGORY_COLOR: Record<
  'salary' | 'bonus' | 'expense' | 'dividend' | 'interest' | 'other' | 'reimbursement' | 'unclassified',
  string
> = {
  // Earned income is one family: salary, then lighter shades of the same blue,
  // so its parts stack as one band and the other categories stand apart.
  salary: 'var(--brand-blue)',
  bonus: 'color-mix(in srgb, var(--brand-blue) 55%, var(--bg-card))',
  expense: 'color-mix(in srgb, var(--brand-blue) 28%, var(--bg-card))',
  dividend: 'var(--brand-cyan)',
  interest: 'var(--brand-purple)',
  other: 'var(--text-tertiary)',
  reimbursement: 'var(--brand-pink)',
  unclassified: TONE_VAR.warning,
}
