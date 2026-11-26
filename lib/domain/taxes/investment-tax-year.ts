export const INVESTMENT_TAX_YEARS = [2026, 2027] as const
export type InvestmentTaxYear = (typeof INVESTMENT_TAX_YEARS)[number]

export const STANDALONE_ESTIMATE_YEAR: InvestmentTaxYear = 2027

export function readInvestmentTaxYear(value: string | null | undefined): InvestmentTaxYear | undefined {
  return INVESTMENT_TAX_YEARS.find(year => String(year) === value)
}
