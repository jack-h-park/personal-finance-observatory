import ordinary from '@/examples/annual-tax-estimate.synthetic.json'
import qdcg from '@/examples/annual-tax-qdcg.synthetic.json'
import { calculateAnnualComponents } from '@/lib/domain/taxes/annual/calculate'
import { validateAnnualEstimateInput, type AnnualEstimateInput } from '@/lib/domain/taxes/annual/contracts'
import { calculateKoreanTaxReference } from '@/lib/domain/taxes/annual/kr-general-reference'
import { getAnnualRulePack } from '@/lib/domain/taxes/annual/rules'

export const HYPOTHETICAL_EXAMPLES = ['us-ordinary', 'us-single', 'us-qdcg-distributions', 'us-qdcg-schedule', 'us-zero', 'kr-national', 'kr-local', 'kr-fractional', 'missing-input', 'unsupported-method', 'currency-mismatch', 'unsupported-year'] as const
export type HypotheticalExample = typeof HYPOTHETICAL_EXAMPLES[number]

/** Invented selection only. Never load policy, history, evidence or an operating profile. */
export function getHypotheticalTaxPreview(selection: unknown) {
  if (typeof selection !== 'string' || !HYPOTHETICAL_EXAMPLES.includes(selection as HypotheticalExample)) {
    return { status: 'unavailable' as const, reason: 'selection' as const }
  }
  const id = selection as HypotheticalExample
  const input = structuredClone(id.startsWith('us-qdcg') ? qdcg : ordinary) as AnnualEstimateInput
  input.id = `hypothetical-${id}`
  const amount = (minor: string, currency: 'USD' | 'KRW' = 'USD') => ({ minor, currency, origin: 'synthetic' as const, reason: 'Invented planning input; not an operating financial fact', sourceRefs: [] })
  input.requestedComponents.push('us.niit')
  input.amounts.niitMagi = amount('30000000')
  input.amounts.netInvestmentIncome = amount('2000000')
  if (id === 'us-qdcg-schedule') {
    input.qdcgWorksheet!.state = 'schedule-d-reviewed'
    input.qdcgWorksheet!.reason = 'Invented eligible ordinary Schedule D branch, no special-rate gains or adjustments'
    delete input.amounts.capitalGainDistributions
    input.amounts.netLongTermGain = amount('800000')
    input.amounts.netCapitalGain = amount('800000')
  }
  if (id === 'us-single') { input.filingStatus = 'single'; input.taxUnit = { id: 'hypothetical-single-unit', kind: 'individual', ownerIds: ['example-a'] } }
  if (id === 'us-zero') for (const key of Object.keys(input.amounts) as (keyof typeof input.amounts)[]) input.amounts[key] = amount('0')
  if (id.startsWith('kr-')) {
    input.authority = id === 'kr-local' ? 'KR:local' : 'KR:national'
    input.currency = 'KRW'; input.filingStatus = 'individual'
    input.taxUnit = { id: 'hypothetical-kr-unit', kind: 'individual', ownerIds: ['example-a'] }
    input.regularTaxMethod = { ...input.regularTaxMethod, state: 'general-reviewed', reason: 'Invented general-rate eligibility; not a real tax profile' }
    input.requestedComponents = [id === 'kr-local' ? 'kr.local.calculated' : 'kr.global.calculated']
    input.amounts = { taxableBase: amount(id === 'kr-fractional' ? '1' : '30000000', 'KRW') }
  }
  for (const value of Object.values(input.amounts)) value.reason = 'Invented planning input; not an operating financial fact'
  if (id === 'missing-input') delete input.amounts.taxableIncome
  if (id === 'unsupported-method') input.specialMethod.state = 'unsupported'
  if (id === 'currency-mismatch') input.amounts.taxableIncome!.currency = 'KRW'
  // Deliberately invalid demonstration; validation must reject rather than project 2025 rules forward.
  const candidate = id === 'unsupported-year' ? { ...input, taxYear: 2026 } : input
  try {
    const validated = validateAnnualEstimateInput(candidate)
    const result = calculateAnnualComponents(validated)
    const reference = validated.authority.startsWith('KR:') ? calculateKoreanTaxReference(validated) : null
    const pack = getAnnualRulePack(validated.taxYear, validated.rulePackId)
    const ids = new Set([...result.components.flatMap(c => c.sourceRefs), ...(reference?.sourceRefs ?? [])])
    return { status: 'ready' as const, id, input: validated, result, reference, sources: pack.sources.filter(s => ids.has(s.id)) }
  } catch {
    return { status: 'unavailable' as const, reason: id === 'currency-mismatch' ? 'currency' as const : id === 'unsupported-year' ? 'year' as const : 'contract' as const }
  }
}
