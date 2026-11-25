export const KR_OVERSEAS_STOCK_RULES = {
  year: 2027,
  deductionKrw: 2_500_000n,
  nationalRatePercent: 20n,
  localRatePercent: 2n,
  sources: {
    national: 'https://www.law.go.kr/LSW/lsInfoP.do?efYd=20270101&lsiSeq=280405',
    local: 'https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsId=001649&lsJoLnkSeq=1000899162&print=print',
    guidance: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=8800&mi=12274',
  },
} as const

export const krStockTaxRows = ['taxable', 'national', 'local', 'total'] as const
type Amounts = Record<(typeof krStockTaxRows)[number], bigint>
type Estimate =
  | { status: 'unavailable' }
  | { status: 'ready'; baseline: Amounts; scenario: Amounts; delta: Amounts }

function parseKrw(value: string): bigint | null {
  const text = value.trim()
  if (!/^-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(text)) return null
  const digits = text.replaceAll(',', '')
  if (digits.replace(/^-/, '').length > 15) return null
  return BigInt(digits)
}

function estimateAnnualTax(netGain: bigint): Amounts {
  const rules = KR_OVERSEAS_STOCK_RULES
  const afterDeduction = netGain - rules.deductionKrw
  const taxable = afterDeduction > 0n ? afterDeduction : 0n
  // Round each planning estimate to the nearest won, half up.
  const national = (taxable * rules.nationalRatePercent + 50n) / 100n
  const local = (taxable * rules.localRatePercent + 50n) / 100n
  return { taxable, national, local, total: national + local }
}

export function estimateKrOverseasStockTax(baselineInput: string, scenarioInput: string): Estimate {
  const baselineGain = parseKrw(baselineInput)
  const scenarioGain = parseKrw(scenarioInput)
  if (baselineGain === null || scenarioGain === null) return { status: 'unavailable' }

  const baseline = estimateAnnualTax(baselineGain)
  const scenario = estimateAnnualTax(scenarioGain)
  return {
    status: 'ready',
    baseline,
    scenario,
    delta: {
      taxable: scenario.taxable - baseline.taxable,
      national: scenario.national - baseline.national,
      local: scenario.local - baseline.local,
      total: scenario.total - baseline.total,
    },
  }
}
