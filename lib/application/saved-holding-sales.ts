import { estimateHoldingSales, saleShareUnits, type HoldingsForSale, type SaleLine } from '@/lib/domain/taxes/holding-sale'
import { estimateUsSaleComparison } from '@/lib/domain/taxes/investment-tax-reserve'
import { estimateKrRecordedStockTax } from '@/lib/domain/taxes/kr-overseas-stock-tax'
import type { InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import type { RealizedTaxInputs } from './realized-tax-inputs'

export type SavedSaleLine = SaleLine & { label: string }
export type SavedHoldingSale = { id: string; name: string; lines: SavedSaleLine[] }
export const SAVED_SALE_PREFIX = 'observatory.holdings-sale.v1.'

function readLine(value: unknown): SavedSaleLine | null {
  if (!value || typeof value !== 'object') return null
  const { positionId, label, quantity } = value as Partial<SavedSaleLine>
  if (typeof positionId !== 'string' || !positionId || typeof label !== 'string' ||
      typeof quantity !== 'string' || quantity !== quantity.trim() || !saleShareUnits(quantity)) return null
  return { positionId, label, quantity }
}

export function readSavedHoldingSale(raw: string): SavedHoldingSale | null {
  try {
    const data = JSON.parse(raw) as { version?: unknown; id?: unknown; name?: unknown; lines?: unknown }
    if (data.version !== 1 || typeof data.id !== 'string' || !data.id ||
        typeof data.name !== 'string' || !data.name.trim() || !Array.isArray(data.lines) || !data.lines.length) return null
    const lines = data.lines.map(readLine)
    return lines.every(line => line != null) ? { id: data.id, name: data.name, lines } : null
  } catch {
    return null
  }
}

export type SaleComparisonAssumptions = {
  us: Parameters<typeof estimateUsSaleComparison>[0]
  kr: { confirmed: boolean; adjustment: string }
}

export function compareHoldingSale(
  lines: SaleLine[],
  book: HoldingsForSale,
  ledger: RealizedTaxInputs | null,
  assumptions: SaleComparisonAssumptions | null,
  year: InvestmentTaxYear,
) {
  const sales = estimateHoldingSales(book.positions, lines, book.fx?.rate ?? null)
  const proceeds = sales.proceedsUsd
  const invalidLines = proceeds == null
  const grossUsd = proceeds == null ? null : Math.round(proceeds * 100) / 100
  const grossKrw = proceeds == null || !book.fx ? null : Math.round(proceeds * book.fx.rate)
  const us = ledger && assumptions && sales.us ? estimateUsSaleComparison(assumptions.us, ledger.us, sales.us, year) : null
  const kr = ledger && assumptions?.kr.confirmed && sales.krw != null
    ? estimateKrRecordedStockTax(ledger.kr.gainKrw, assumptions.kr.adjustment, year, sales.krw)
    : null
  const usdDelta = us?.status === 'ready' ? Number(us.delta.total) / 100 : null
  const krwDelta = kr?.status === 'ready' ? Number(kr.delta.total) : null
  return {
    grossUsd, grossKrw, invalidLines,
    missingBasis: { us: sales.us == null, kr: sales.krw == null },
    us: grossUsd != null && usdDelta != null ? { delta: usdDelta, after: (Math.round(grossUsd * 100) - Math.round(usdDelta * 100)) / 100 } : null,
    kr: grossKrw != null && krwDelta != null ? { delta: krwDelta, after: grossKrw - krwDelta } : null,
  }
}
