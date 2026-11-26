export type SalePosition = {
  id: string
  ticker: string
  accountLabel: string
  holdingQuantity: number
  quote: { date: string; usd: number } | null
  lots: {
    quantity: number
    costUsd: number | null
    costKrw: number | null
    term: 'short' | 'long' | null
  }[]
}

export type HoldingsForSale = {
  date: string
  fx: { date: string; rate: number } | null
  positions: SalePosition[]
  unreconciled: number
}

const shareScale = 1e8

export function positionQuantity(position: SalePosition) {
  const lotUnits = position.lots.reduce((sum, lot) => sum + Math.round(lot.quantity * shareScale), 0)
  const holdingUnits = position.holdingQuantity * shareScale
  return Math.min(Math.floor(holdingUnits + holdingUnits * Number.EPSILON), lotUnits) / shareScale
}

export function estimateHoldingSale(position: SalePosition, input: string, usdKrw: number | null) {
  const value = input.trim()
  if (!/^\d+(?:\.\d{1,8})?$/.test(value)) return null
  const quantity = Number(value)
  if (!(quantity > 0 && quantity <= positionQuantity(position))) return null

  let remaining = Math.round(quantity * shareScale)
  let lots = 0
  let short = 0
  let long = 0
  let krw = 0
  let usComplete = position.quote != null
  let krComplete = position.quote != null && usdKrw != null
  const unit = position.quote?.usd ?? 0
  for (const lot of position.lots) {
    if (!remaining) break
    const available = Math.round(lot.quantity * shareScale)
    if (available <= 0) continue
    const sold = Math.min(remaining, available)
    remaining -= sold
    lots += 1
    const proceeds = unit * sold / shareScale
    const fraction = sold / available
    if (lot.term && lot.costUsd != null && lot.costUsd > 0) {
      const gain = proceeds - lot.costUsd * fraction
      if (lot.term === 'long') long += gain
      else short += gain
    } else {
      usComplete = false
    }
    if (lot.term && lot.costKrw != null && lot.costKrw > 0 && usdKrw != null) {
      krw += proceeds * usdKrw - lot.costKrw * fraction
    } else {
      krComplete = false
    }
  }
  return {
    lots,
    proceedsUsd: position.quote ? unit * quantity : null,
    us: usComplete ? { shortUsd: Math.round(short * 100) / 100, longUsd: Math.round(long * 100) / 100 } : null,
    krw: krComplete ? Math.round(krw) : null,
  }
}
