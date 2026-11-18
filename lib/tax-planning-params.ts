import type { MasterPlanStrategyKey } from '@/lib/tax-planning'
import type { FilingScenario, TaxPolicy } from '@/lib/tax-policy'

const MASTER_STRATEGIES: readonly MasterPlanStrategyKey[] = ['EARLIEST_LT', 'STAGED', 'WAIT_US_ONLY', 'ACCELERATE_LOSSES']
const EXECUTION_MONTHS = [12, 18, 24, 36, 48]

export type PlanningInputs = {
  scenario: FilingScenario
  objective: 'minimize-tax'
  targetCashKrw: 0
  annualTargetCashKrw: number
  horizonYears: number
  master: MasterPlanStrategyKey
  executionMonths: number
}

function amount(value: string | undefined) {
  if (!value) return 0
  const parsed = Number(value.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function horizon(value: string | undefined, policyYears: number | undefined) {
  const parsed = value ? Number(value) : Number(policyYears ?? 5)
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 5, 1), 10)
}

/**
 * The one place /tax-planning turns URL parameters into planner inputs. The
 * scenario, objective and single-sale target are not readable from the URL:
 * the page has no control for them, so they come from the policy or are fixed.
 */
export function planningInputs(params: Record<string, string | undefined>, policy: TaxPolicy): PlanningInputs {
  const master = MASTER_STRATEGIES.find((key) => key === params.master) ?? 'STAGED'
  const pace = Number(params.pace)
  return {
    scenario: policy.activeScenario,
    objective: 'minimize-tax',
    targetCashKrw: 0,
    annualTargetCashKrw: amount(params.annualTarget),
    horizonYears: horizon(params.horizon, policy.planningHorizonYears),
    master,
    executionMonths: EXECUTION_MONTHS.includes(pace) ? pace : 24,
  }
}
