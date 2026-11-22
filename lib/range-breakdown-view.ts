import type { PositionSnapshotRow, RealizedGainRow } from '@/lib/adapters/portfolio-db'
import type { TotalAssetsPoint } from '@/lib/net-worth'
import { costBasisGap, rangeBreakdown, topDrivers, type Unpriced } from '@/lib/range-breakdown'
import {
  investmentResultBetween,
  totalAssetsChangeBetween,
  type ClassDriver,
  type InvestmentPoint,
  type InvestmentResult,
  type TotalAssetsChange,
} from '@/lib/total-assets-change'

const STOCK_MARKETS = ['KR', 'US']
const CRYPTO_MARKETS = ['CRYPTO']

export type RangeBreakdownView = {
  change: TotalAssetsChange | null
  investment: InvestmentResult | null
  gap: number | null
  byClass: ClassDriver[]
  stocks: ReturnType<typeof topDrivers> | null
  crypto: ReturnType<typeof topDrivers> | null
  unpriced: Unpriced[]
  /** Per `market:ticker` row key, the market its position page is under (see positionLinkMarket). */
  linkMarkets: Record<string, string>
}

/**
 * The market whose position page a breakdown row links to. Rows are keyed by
 * the LOT market, while the position page matches holdings by the holding's
 * market: a Toss US security keyed KR:<ticker> is held as US:<ticker>. When the
 * row's own market holds nothing now but exactly one other market holds the
 * ticker, the link goes there; otherwise it stays on the row's market.
 */
export function positionLinkMarket(market: string, ticker: string, held: { market: string; ticker: string }[]): string {
  const markets = new Set(held.filter((row) => row.ticker === ticker).map((row) => row.market))
  if (markets.has(market)) return market
  return markets.size === 1 ? [...markets][0] : market
}

/**
 * Everything the /net-worth breakdown panel shows for a selected period, from
 * the two snapped dates and what the adapters read. `from` and `to` are plotted
 * snapshot dates (resolveRangeSelection). The security sections are null when
 * either date is not covered by per-security records: the table is missing, or
 * the date held stocks or crypto but has no rows (written before the table
 * existed). The header's investment result is then the snapshot-level one;
 * otherwise it is the breakdown's own, so it adds up to the bars below it.
 */
export function rangeBreakdownView(input: {
  from: string
  to: string
  totalPoints: TotalAssetsPoint[]
  investmentPoints: InvestmentPoint[]
  /** Rows at `from` and `to`, or null when the database has no position_snapshots table. */
  snapshots: PositionSnapshotRow[] | null
  /** Realized gains sold after `from` and on or before `to`. */
  realized: RealizedGainRow[]
  /** Current holdings' market and ticker, to point each row's link at a position page that exists. */
  held?: { market: string; ticker: string }[]
  topN?: number
}): RangeBreakdownView {
  const { from, to, totalPoints, investmentPoints, snapshots, realized, held = [], topN = 8 } = input
  const change = totalAssetsChangeBetween(totalPoints, from, to)
  const byClass = change?.byClass ?? []
  const kpiInvestment = investmentResultBetween(investmentPoints, from, to)

  const covered = (date: string) => {
    if (snapshots === null) return false
    if (snapshots.some((row) => row.date === date)) return true
    const point = totalPoints.find((p) => p.date === date)
    return !point || (!point.stocks && !point.crypto)
  }
  if (!covered(from) || !covered(to)) {
    return { change, investment: kpiInvestment, gap: null, byClass, stocks: null, crypto: null, unpriced: [], linkMarkets: {} }
  }

  const rows = snapshots ?? []
  const stocks = rangeBreakdown({ from, to, rows, realized, markets: STOCK_MARKETS })
  const crypto = rangeBreakdown({ from, to, rows, realized, markets: CRYPTO_MARKETS })
  const marketEffect = stocks.marketEffectTotal + crypto.marketEffectTotal
  const realizedTotal = [...stocks.securities, ...crypto.securities].reduce((sum, d) => sum + d.realized, 0)
  // Only a period ending today can differ by cost basis: today's KPI uses the
  // broker's average cost, past snapshots and this breakdown use lot cost.
  const endsToday = totalPoints[totalPoints.length - 1]?.date === to
  const linkMarkets = Object.fromEntries(
    [...stocks.securities, ...crypto.securities].map((d) => [`${d.market}:${d.ticker}`, positionLinkMarket(d.market, d.ticker, held)]),
  )
  return {
    change,
    investment: { unrealized: marketEffect - realizedTotal, realized: realizedTotal, total: marketEffect },
    gap: endsToday ? costBasisGap(marketEffect, kpiInvestment?.total ?? null) : null,
    byClass,
    stocks: topDrivers(stocks.securities, topN),
    crypto: topDrivers(crypto.securities, topN),
    unpriced: [...stocks.unpriced, ...crypto.unpriced],
    linkMarkets,
  }
}
