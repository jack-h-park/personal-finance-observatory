import { estimateInvestmentTaxReserve, parseUsdCents, type ReserveScenario } from './investment-tax-reserve'
import { estimateKrOverseasStockTax, parseKrwWon } from './kr-overseas-stock-tax'

const year = 2027

type SaleScenario = { us: ReserveScenario; krwGain: string }
export type CreditAmounts = { eligibleTax: string; limit: string }
type CreditInput =
  | { authority: 'unknown' | 'none' }
  | { authority: 'us' | 'kr'; baseline: CreditAmounts; scenario: CreditAmounts }

export type CrossBorderSaleInput = {
  supported: boolean
  filing: string
  krwPerUsd: string
  baseline: SaleScenario
  scenario: SaleScenario
  credit: CreditInput
}

function parseFx(value: string) {
  const match = /^(\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.(\d{1,4}))?$/.exec(value.trim())
  if (!match) return null
  const rate = BigInt(match[1].replaceAll(',', '')) * 10_000n + BigInt((match[2] ?? '').padEnd(4, '0'))
  return rate > 0n ? rate : null
}

function limitedCredit(amounts: CreditAmounts, parse: (value: string) => bigint | null) {
  const eligible = parse(amounts.eligibleTax)
  const limit = parse(amounts.limit)
  if (eligible === null || limit === null || eligible < 0n || limit < 0n) return null
  return eligible < limit ? eligible : limit
}

/** A planning comparison using two domestic estimates and an independently determined credit basis. */
export function estimateCrossBorderSaleTax(input: CrossBorderSaleInput) {
  if (!input.supported) return { status: 'unavailable', reason: 'scope' } as const
  const rate = parseFx(input.krwPerUsd)
  if (rate === null) return { status: 'unavailable', reason: 'fx' } as const
  const us = estimateInvestmentTaxReserve({
    profile: 'supported', filing: input.filing, year,
    baseline: input.baseline.us, scenario: input.scenario.us,
  })
  if (us.status !== 'ready') return { status: 'unavailable', reason: 'us' } as const
  const kr = estimateKrOverseasStockTax(input.baseline.krwGain, input.scenario.krwGain, year)
  if (kr.status !== 'ready') return { status: 'unavailable', reason: 'kr' } as const

  // One common planning FX rate, applied to the USD subtotal and rounded to whole won.
  const toWon = (cents: bigint) => (cents * rate + 500_000n) / 1_000_000n
  const baseline = { us: us.baseline, kr: kr.baseline, grossKrw: toWon(us.baseline.total) + kr.baseline.total }
  const scenario = { us: us.scenario, kr: kr.scenario, grossKrw: toWon(us.scenario.total) + kr.scenario.total }
  const delta = { us: us.delta, kr: kr.delta, grossKrw: scenario.grossKrw - baseline.grossKrw }
  const gross = { status: 'ready', baseline, scenario, delta } as const
  const { credit } = input

  let beforeCredit = 0n
  let afterCredit = 0n
  if (credit.authority === 'unknown') {
    return { ...gross, credit: { status: 'unavailable', reason: 'unknown' } } as const
  }
  if ('baseline' in credit) {
    const parse = credit.authority === 'us' ? parseUsdCents : parseKrwWon
    const before = limitedCredit(credit.baseline, parse)
    const after = limitedCredit(credit.scenario, parse)
    if (before === null || after === null) return { ...gross, credit: { status: 'unavailable', reason: 'creditAmount' } } as const
    const baselineReceivingTax = credit.authority === 'us' ? us.baseline.regular : kr.baseline.national
    const scenarioReceivingTax = credit.authority === 'us' ? us.scenario.regular : kr.scenario.national
    if (before > baselineReceivingTax || after > scenarioReceivingTax) {
      return { ...gross, credit: { status: 'unavailable', reason: 'receivingTax' } } as const
    }
    beforeCredit = before
    afterCredit = after
  }

  function net(amounts: typeof baseline, creditAmount: bigint) {
    const usCreditCents = credit.authority === 'us' ? creditAmount : 0n
    const krCreditWon = credit.authority === 'kr' ? creditAmount : 0n
    const usNetCents = amounts.us.total - usCreditCents
    const krNetWon = amounts.kr.total - krCreditWon
    return { usCreditCents, krCreditWon, usNetCents, krNetWon, combinedKrw: toWon(usNetCents) + krNetWon }
  }
  const netBaseline = net(baseline, beforeCredit)
  const netScenario = net(scenario, afterCredit)
  return {
    ...gross,
    credit: {
      status: 'ready',
      baseline: netBaseline,
      scenario: netScenario,
      delta: {
        usCreditCents: netScenario.usCreditCents - netBaseline.usCreditCents,
        krCreditWon: netScenario.krCreditWon - netBaseline.krCreditWon,
        usNetCents: netScenario.usNetCents - netBaseline.usNetCents,
        krNetWon: netScenario.krNetWon - netBaseline.krNetWon,
        combinedKrw: netScenario.combinedKrw - netBaseline.combinedKrw,
      },
    },
  } as const
}
