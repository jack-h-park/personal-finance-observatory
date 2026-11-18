import type { PositionDetail, WashSaleReview } from '@/lib/adapters/portfolio-db'

/**
 * The wash-sale review narrowed to the position on the page. Windows exist
 * only for US stocks, so any other market gets none; the dates stay, since the
 * banner's footnote reads them.
 */
export function washSaleForTicker(review: WashSaleReview, market: string, ticker: string): WashSaleReview {
  return {
    ...review,
    windows: market === 'US' ? review.windows.filter((w) => w.ticker === ticker) : [],
  }
}

export type AccountRow = {
  id: string
  brokerage: string | null
  account: string
  currency: string
  quantity: number
  native_cost: number
  native_market_value: number | null
  native_unrealized_gl: number | null
  lot_count: number
  long_count: number
  short_count: number
  lot_cost_krw: number
}

/**
 * One row per account holding: what the account holds, and the open tax lots
 * behind it. A lot belongs to the holding with the same brokerage and account,
 * so one account name at two brokers stays two rows.
 */
export function accountRows(holdings: PositionDetail['holdings'], lots: PositionDetail['lots']): AccountRow[] {
  return holdings.map((holding) => {
    const own = lots.filter((lot) => lot.account === holding.account && lot.brokerage === holding.brokerage)
    return {
      id: `${holding.brokerage}:${holding.account}`,
      brokerage: holding.brokerage,
      account: holding.account,
      currency: holding.currency,
      quantity: holding.quantity,
      native_cost: holding.native_cost,
      native_market_value: holding.native_market_value,
      native_unrealized_gl: holding.native_unrealized_gl,
      lot_count: own.length,
      long_count: own.filter((lot) => lot.tax_term === 'Long-term').length,
      short_count: own.filter((lot) => lot.tax_term === 'Short-term').length,
      lot_cost_krw: own.reduce((sum, lot) => sum + Number(lot.cost_basis_krw ?? 0), 0),
    }
  })
}
