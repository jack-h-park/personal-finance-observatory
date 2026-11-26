import { GOLD_ETF_TICKERS } from '@/lib/gold-trend'
import type { RealizedLotView } from '@/lib/realized-lots'

const goldFunds = new Set<string>(GOLD_ETF_TICKERS)

export type RealizedTaxInputs = {
  us: { shortUsd: number; longUsd: number; lots: number; skipped: number }
  kr: { gainKrw: number; lots: number; skipped: number }
}

export function summarizeRealizedTaxInputs(rows: RealizedLotView[], year: number): RealizedTaxInputs {
  let shortCents = 0
  let longCents = 0
  let krw = 0
  const us = { shortUsd: 0, longUsd: 0, lots: 0, skipped: 0 }
  const kr = { gainKrw: 0, lots: 0, skipped: 0 }
  for (const row of rows) {
    if (row.sold_year !== String(year) || row.superseded_by) continue

    // Filed rows can replace replay rows without a verified account match or
    // enough asset detail to apply either calculator's rates.
    const ticker = row.ticker.trim().toUpperCase()
    const usListedSecurity = row.basis === 'replay' && ticker !== '' && row.market === 'US' && row.currency === 'USD' &&
      row.asset_class === 'security' && row.account_wrapper === 'taxable' &&
      !row.collectible && !goldFunds.has(ticker)
    const term = row.tax_term?.trim().toLowerCase()
    const usd = row.gain_usd
    // Replay can carry a zero cost for transfers without a known basis.
    const usdCost = row.cost_usd
    if (usListedSecurity && usdCost != null && Number.isFinite(usdCost) && usdCost > 0 && usd != null && Number.isFinite(usd) && (term === 'short-term' || term === 'long-term')) {
      if (term === 'short-term') shortCents += Math.round(usd * 100)
      else longCents += Math.round(usd * 100)
      us.lots += 1
    } else {
      us.skipped += 1
    }

    if (row.market !== 'US') continue
    const cost = row.acquisition_cost_krw
    const proceeds = row.proceeds_krw
    if (usListedSecurity && cost != null && Number.isFinite(cost) && cost > 0 &&
      proceeds != null && Number.isFinite(proceeds)) {
      krw += proceeds - cost
      kr.lots += 1
    } else {
      kr.skipped += 1
    }
  }
  return {
    us: { ...us, shortUsd: shortCents / 100, longUsd: longCents / 100 },
    kr: { ...kr, gainKrw: Math.round(krw) },
  }
}
