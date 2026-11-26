import { STANDALONE_ESTIMATE_YEAR, type InvestmentTaxYear } from './investment-tax-year'
import { qualifiedScheduleDGain } from './qualified-stock-gain'

export const RESERVE_RULES = {
  revenueProcedure: {
    2026: 'https://www.irs.gov/irb/2025-45_IRB',
    2027: 'https://www.irs.gov/irb/2026-48_irb',
  },
  capitalGainLaw: 'https://uscode.house.gov/us/usc/t26/s1/',
  qualifiedGainWorksheet: 'https://www.irs.gov/instructions/i1040gi',
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
export type ReserveScenario = Record<(typeof reserveFields)[number], string>
export type PreferentialWorksheet =
  | { kind: 'schedule-d'; qualifiedDividends: string; netLongTermGain: string; netCapitalGain: string }
  | { kind: 'distributions-only'; qualifiedDividends: string; capitalGainDistributions: string }

type EstimateScenario = ReserveScenario | (Omit<ReserveScenario, 'preferential'> & { worksheet: PreferentialWorksheet })
type FilingRules = (typeof filingRules)[InvestmentTaxYear]['single' | 'mfj']

const min = (left: bigint, right: bigint) => left < right ? left : right
const positive = (amount: bigint) => amount < 0n ? 0n : amount
const usd = (dollars: number) => BigInt(dollars) * 100n
const roundCents = (numerator: bigint) => (numerator + 5000n) / 10000n

export function parseUsdCents(text: string) {
  const match = /^(\d{1,12}|\d{1,3}(?:,\d{3}){1,3})(?:\.(\d{1,2}))?$/.exec(text.trim())
  return match ? BigInt(match[1].replaceAll(',', '')) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null
}

function parseSignedUsd(text: string) {
  const value = text.trim()
  const digits = parseUsdCents(value.replace(/^[+-]/, ''))
  return digits == null || !value.startsWith('-') ? digits : -digits
}

function worksheetPreferential(worksheet: PreferentialWorksheet): bigint | null {
  const dividends = parseUsdCents(worksheet.qualifiedDividends)
  if (dividends === null) return null

  if (worksheet.kind === 'distributions-only') {
    const distributions = parseUsdCents(worksheet.capitalGainDistributions)
    return distributions === null ? null : dividends + distributions
  }

  const long = parseSignedUsd(worksheet.netLongTermGain)
  const total = parseSignedUsd(worksheet.netCapitalGain)
  return long === null || total === null ? null : dividends + qualifiedScheduleDGain(long, total)
}

function parseScenarioAmounts(scenario: EstimateScenario) {
  const taxable = parseUsdCents(scenario.taxable)
  const magi = parseUsdCents(scenario.magi)
  const nii = parseUsdCents(scenario.nii)
  const preferential = 'worksheet' in scenario ? worksheetPreferential(scenario.worksheet) : parseUsdCents(scenario.preferential)
  if (taxable === null || preferential === null || magi === null || nii === null) return null
  return [taxable, 'worksheet' in scenario ? min(preferential, taxable) : preferential, magi, nii]
}

/** Ordinary capital-gain comparison with fixed deductions and NIIT treatment. */
export function scenarioWithRecordedGains(
  baseline: ReserveScenario,
  recorded: { shortUsd: number; longUsd: number },
  adjustment: { short: string; long: string },
): ReserveScenario | null {
  const [taxable, preferential, magi, nii] = reserveFields.map(key => parseUsdCents(baseline[key]))
  const extraShort = parseSignedUsd(adjustment.short.trim() || '0')
  const extraLong = parseSignedUsd(adjustment.long.trim() || '0')
  if (taxable == null || preferential == null || magi == null || nii == null || extraShort == null || extraLong == null) return null

  // A zero ordinary base can hide unused deductions or preferential income.
  if (taxable <= preferential) return null

  const short = BigInt(Math.round(recorded.shortUsd * 100)) + extraShort
  const long = BigInt(Math.round(recorded.longUsd * 100)) + extraLong
  const net = short + long
  // A net loss requires the annual loss allowance and NIIT adjustments.
  if (net < 0n) return null
  const eligible = qualifiedScheduleDGain(long, net)
  const dollars = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
  return { taxable: dollars(taxable + net), preferential: dollars(preferential + eligible), magi: dollars(magi + net), nii: dollars(nii + net) }
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
export function estimateInvestmentTaxReserve(input: { profile: string; filing: string; baseline: EstimateScenario; scenario: EstimateScenario; year?: InvestmentTaxYear }) {
  if (input.profile === 'special-method') return { status: 'unavailable', reason: 'specialMethod' } as const
  if (input.profile !== 'supported') return { status: 'unavailable', reason: 'profile' } as const
  if (input.filing !== 'single' && input.filing !== 'mfj') return { status: 'unavailable', reason: 'filing' } as const
  const rules = filingRules[input.year ?? STANDALONE_ESTIMATE_YEAR][input.filing]
  const baselineAmounts = parseScenarioAmounts(input.baseline)
  const scenarioAmounts = parseScenarioAmounts(input.scenario)
  if (!baselineAmounts || !scenarioAmounts) {
    return { status: 'unavailable', reason: 'amount' } as const
  }
  if (baselineAmounts[1] > baselineAmounts[0] || scenarioAmounts[1] > scenarioAmounts[0]) {
    return { status: 'unavailable', reason: 'preferential' } as const
  }
  const baseline = calculate(baselineAmounts, rules)
  const scenario = calculate(scenarioAmounts, rules)
  return {
    status: 'ready', baseline, scenario,
    preferential: { baseline: baselineAmounts[1], scenario: scenarioAmounts[1] },
    delta: { regular: scenario.regular - baseline.regular, niit: scenario.niit - baseline.niit, total: scenario.total - baseline.total },
  } as const
}
