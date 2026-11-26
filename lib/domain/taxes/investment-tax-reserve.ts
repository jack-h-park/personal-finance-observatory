import { STANDALONE_ESTIMATE_YEAR, type InvestmentTaxYear } from './investment-tax-year'

export const RESERVE_RULES = {
  revenueProcedure: {
    2026: 'https://www.irs.gov/irb/2025-45_IRB',
    2027: 'https://www.irs.gov/irb/2026-48_irb',
  },
  capitalGainLaw: 'https://uscode.house.gov/us/usc/t26/s1/',
  niitGuide: 'https://www.irs.gov/individuals/net-investment-income-tax',
} as const

// Rev. Proc. 2025-32 sections 4.01 and 4.03; Rev. Proc. 2026-35 sections 3.01 and 3.03.
const filingRules = {
  2026: {
    single: { ceilings: [12400, 50400, 105700, 201775, 256225, 640600], zero: 49450, fifteen: 545500, niit: 200000 },
    mfj: { ceilings: [24800, 100800, 211400, 403550, 512450, 768700], zero: 98900, fifteen: 613700, niit: 250000 },
  },
  2027: {
    single: { ceilings: [12800, 52025, 109125, 208325, 264550, 661375], zero: 51050, fifteen: 563200, niit: 200000 },
    mfj: { ceilings: [25600, 104050, 218250, 416650, 529100, 793650], zero: 102100, fifteen: 633600, niit: 250000 },
  },
}
const ordinaryRates = [1000n, 1200n, 2200n, 2400n, 3200n, 3500n, 3700n]
export const reserveFields = ['taxable', 'preferential', 'magi', 'nii'] as const
type Scenario = Record<(typeof reserveFields)[number], string>
type FilingRules = (typeof filingRules)[InvestmentTaxYear]['single' | 'mfj']

const min = (left: bigint, right: bigint) => left < right ? left : right
const positive = (amount: bigint) => amount < 0n ? 0n : amount
const usd = (dollars: number) => BigInt(dollars) * 100n
const roundCents = (numerator: bigint) => (numerator + 5000n) / 10000n

function parseUsd(text: string) {
  const match = /^(\d{1,12}|\d{1,3}(?:,\d{3}){1,3})(?:\.(\d{1,2}))?$/.exec(text.trim())
  return match ? BigInt(match[1].replaceAll(',', '')) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}

function ordinaryNumerator(taxable: bigint, ceilings: number[]) {
  let prior = 0n
  let numerator = 0n
  for (const [index, rate] of ordinaryRates.entries()) {
    const upper = index < ceilings.length ? min(taxable, usd(ceilings[index])) : taxable
    numerator += (upper - prior) * rate
    if (upper === taxable) break
    prior = upper
  }
  return numerator
}

function calculate([taxable, preferential, magi, nii]: bigint[], rules: FilingRules) {
  const ordinary = taxable - preferential
  const zero = min(preferential, positive(usd(rules.zero) - ordinary))
  const fifteen = min(preferential - zero, positive(usd(rules.fifteen) - ordinary - zero))
  const twenty = preferential - zero - fifteen
  const preferentialNumerator = ordinaryNumerator(ordinary, rules.ceilings) + fifteen * 1500n + twenty * 2000n
  const regular = roundCents(min(preferentialNumerator, ordinaryNumerator(taxable, rules.ceilings)))
  const niit = roundCents(min(nii, positive(magi - usd(rules.niit))) * 380n)
  return { regular, niit, total: regular + niit }
}

/** Rate-schedule estimate for two user-supplied scenarios. No filing or record is read. */
export function estimateInvestmentTaxReserve(input: { profile: string; filing: string; baseline: Scenario; scenario: Scenario; year?: InvestmentTaxYear }) {
  if (input.profile !== 'supported') return { status: 'unavailable', reason: 'profile' } as const
  if (input.filing !== 'single' && input.filing !== 'mfj') return { status: 'unavailable', reason: 'filing' } as const
  const rules = filingRules[input.year ?? STANDALONE_ESTIMATE_YEAR][input.filing]
  const baselineAmounts = reserveFields.map(key => parseUsd(input.baseline[key]))
  const scenarioAmounts = reserveFields.map(key => parseUsd(input.scenario[key]))
  if (!baselineAmounts.every(amount => amount !== null) || !scenarioAmounts.every(amount => amount !== null)) {
    return { status: 'unavailable', reason: 'amount' } as const
  }
  if (baselineAmounts[1] > baselineAmounts[0] || scenarioAmounts[1] > scenarioAmounts[0]) {
    return { status: 'unavailable', reason: 'preferential' } as const
  }
  const baseline = calculate(baselineAmounts, rules)
  const scenario = calculate(scenarioAmounts, rules)
  return {
    status: 'ready', baseline, scenario,
    delta: { regular: scenario.regular - baseline.regular, niit: scenario.niit - baseline.niit, total: scenario.total - baseline.total },
  } as const
}
