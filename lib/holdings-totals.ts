import type { Holding } from '@/lib/adapters/portfolio-db'

type Values = Pick<Holding, 'base_cost' | 'total_cost_krw' | 'base_market_value' | 'base_unrealized_gl'>

function completeSum(rows: readonly Values[], read: (row: Values) => number | null): number | null {
  if (!rows.length) return null
  let sum = 0
  for (const row of rows) {
    const value = read(row)
    if (value == null || !Number.isFinite(value)) return null
    sum += value
  }
  return sum
}

export function holdingsTotals(rows: readonly Values[]) {
  return {
    cost: completeSum(rows, (row) => row.base_cost ?? row.total_cost_krw),
    marketValue: completeSum(rows, (row) => row.base_market_value),
    unrealized: completeSum(rows, (row) => row.base_unrealized_gl),
  }
}
