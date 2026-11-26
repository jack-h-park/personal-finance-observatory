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

export type SaleLine = { positionId: string; quantity: string }

function shareUnits(input: string) {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(input.trim())
  if (!match) return 0
  const units = Number(match[1] + (match[2] ?? '').padEnd(8, '0'))
  return Number.isSafeInteger(units) && units > 0 ? units : 0
}

function valueLots(position: SalePosition, units: number, usdKrw: number | null, offset: number) {
  let remaining = units
  let lots = 0
  let shortUsd = 0
  let longUsd = 0
  let krw = 0
  let missingDate = false
  const missingBasis = { us: false, kr: false }
  const unit = position.quote?.usd ?? 0
  for (const lot of position.lots) {
    if (!remaining) break
    const available = Math.round(lot.quantity * shareScale)
    if (available <= 0) continue
    const skipped = Math.min(offset, available)
    offset -= skipped
    const sold = Math.min(remaining, available - skipped)
    if (!sold) continue
    remaining -= sold
    lots += 1
    const proceeds = unit * sold / shareScale
    const fraction = sold / available

    if (!lot.term) missingDate = true
    if (lot.costUsd != null && lot.costUsd > 0) {
      const gain = proceeds - lot.costUsd * fraction
      if (lot.term === 'long') longUsd += gain
      else shortUsd += gain
    } else {
      missingBasis.us = true
    }
    if (lot.costKrw != null && lot.costKrw > 0) {
      if (usdKrw != null) krw += proceeds * usdKrw - lot.costKrw * fraction
    } else {
      missingBasis.kr = true
    }
  }
  return {
    lots, missingBasis, missingDate,
    proceedsUsd: position.quote ? unit * units / shareScale : null,
    us: position.quote && !missingDate && !missingBasis.us ? { shortUsd, longUsd } : null,
    krw: position.quote && usdKrw != null && !missingDate && !missingBasis.kr ? krw : null,
  }
}

function roundUsd(amount: { shortUsd: number; longUsd: number } | null) {
  return amount && { shortUsd: Math.round(amount.shortUsd * 100) / 100, longUsd: Math.round(amount.longUsd * 100) / 100 }
}

export function estimateHoldingSale(position: SalePosition, input: string, usdKrw: number | null) {
  const units = shareUnits(input)
  if (!units || units / shareScale > positionQuantity(position)) return null
  const { lots, proceedsUsd, us, krw } = valueLots(position, units, usdKrw, 0)
  return { lots, proceedsUsd, us: roundUsd(us), krw: krw == null ? null : Math.round(krw) }
}

export function estimateHoldingSales(positions: SalePosition[], lines: SaleLine[], usdKrw: number | null) {
  const byId = new Map(positions.map(position => [position.id, position]))
  const quantities = lines.map(line => shareUnits(line.quantity))
  const totals = new Map<string, number>()
  lines.forEach((line, index) => totals.set(line.positionId, (totals.get(line.positionId) ?? 0) + quantities[index]))

  const offsets = new Map<string, number>()
  const rows = lines.map((line, index) => {
    const position = byId.get(line.positionId)
    const units = quantities[index]
    const total = totals.get(line.positionId) ?? 0
    const error = !position ? 'position' : !units ? 'quantity' : total / shareScale > positionQuantity(position) ? 'balance' : null
    if (!position || error) return { position, error, estimate: null }

    // Lines for the same account and ticker share FIFO inventory in input order.
    const offset = offsets.get(position.id) ?? 0
    const estimate = valueLots(position, units, usdKrw, offset)
    offsets.set(position.id, offset + units)
    return {
      position, error,
      estimate: { ...estimate, us: roundUsd(estimate.us), krw: estimate.krw == null ? null : Math.round(estimate.krw) },
    }
  })
  const usComplete = rows.length > 0 && rows.every(row => row.estimate?.us != null)
  const krComplete = rows.length > 0 && rows.every(row => row.estimate?.krw != null)
  const totalUsd = { shortUsd: 0, longUsd: 0 }
  let totalKrw = 0
  if (usComplete || krComplete) {
    // Value each position's total once so splitting a sale across lines does
    // not introduce different rounding at a tax input's cent or won boundary.
    for (const position of positions) {
      const units = totals.get(position.id)
      if (!units) continue
      const value = valueLots(position, units, usdKrw, 0)
      totalUsd.shortUsd += value.us?.shortUsd ?? 0
      totalUsd.longUsd += value.us?.longUsd ?? 0
      totalKrw += value.krw ?? 0
    }
  }
  return { rows, us: usComplete ? roundUsd(totalUsd) : null, krw: krComplete ? Math.round(totalKrw) : null }
}
