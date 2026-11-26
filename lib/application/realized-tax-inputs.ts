import { GOLD_ETF_TICKERS } from '@/lib/gold-trend'
import { formGainUsd, type RealizedLotView } from '@/lib/realized-lots'

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

    const usListedSecurity = row.market === 'US' && row.currency === 'USD' &&
      row.asset_class === 'security' && row.account_wrapper === 'taxable' &&
      !row.collectible && !goldFunds.has(row.ticker.toUpperCase())
    const term = row.tax_term?.trim().toLowerCase()
    const usd = row.basis === 'replay' ? row.gain_usd : formGainUsd(row)
    if (usListedSecurity && usd != null && Number.isFinite(usd) && (term === 'short-term' || term === 'long-term')) {
      if (term === 'short-term') shortCents += Math.round(usd * 100)
      else longCents += Math.round(usd * 100)
      us.lots += 1
    } else {
      us.skipped += 1
    }

    if (row.market !== 'US') continue
    const cost = row.acquisition_cost_krw
    const proceeds = row.proceeds_krw
    // US filing adjustments may not be the acquisition basis for Korea.
    if (usListedSecurity && row.basis === 'replay' && cost != null && Number.isFinite(cost) &&
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
