import { live, type TaxHistoryStoreV1 } from '@/lib/domain/taxes/history'

const categories = ['general-income', 'passive-income', 'capital-gains'] as const
type Category = (typeof categories)[number]

type ForeignCreditFact = {
  taxReturnId: string
  evidenceId: string
  sha256: string
  page: number
  year: number
  authority: 'us' | 'kr'
  category: Category
  eligibleMinor: string | null
  limitMinor: string | null
  appliedMinor: string | null
}

export type ForeignCreditRecord = Pick<ForeignCreditFact, 'page' | 'year' | 'authority' | 'category' |
  'eligibleMinor' | 'limitMinor' | 'appliedMinor'> & { id: string; source: string }

function amount(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^(0|[1-9]\d{0,14})$/.test(value))
}

export function readForeignCreditFacts(data: unknown): ForeignCreditFact[] {
  const store = data as { version?: unknown; facts?: unknown } | null
  if (store?.version !== 1 || !Array.isArray(store.facts)) throw new Error('Invalid foreign credit evidence')
  return store.facts.map((value: unknown) => {
    const row = value as Partial<ForeignCreditFact> | null
    if (!row || typeof row.taxReturnId !== 'string' || !row.taxReturnId ||
        typeof row.evidenceId !== 'string' || !row.evidenceId ||
        typeof row.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(row.sha256) ||
        typeof row.page !== 'number' || !Number.isSafeInteger(row.page) || row.page < 1 ||
        typeof row.year !== 'number' || !Number.isSafeInteger(row.year) || row.year < 1900 || row.year > 2200 ||
        (row.authority !== 'us' && row.authority !== 'kr') || !row.category || !categories.includes(row.category) ||
        !amount(row.eligibleMinor) || !amount(row.limitMinor) || !amount(row.appliedMinor)) {
      throw new Error('Invalid foreign credit fact')
    }
    return row as ForeignCreditFact
  })
}

/** Return facts describe a filed year's reported treatment. The calculator's inputs have a different scope. */
export function projectForeignCreditRecords(history: TaxHistoryStoreV1, facts: ForeignCreditFact[]): ForeignCreditRecord[] {
  const units = new Map(live(history.taxUnits).map(row => [row.id, row]))
  const returns = new Map(live(history.returns).map(row => [row.id, row]))
  const obligations = new Map(live(history.obligations).map(row => [row.id, row]))
  const evidence = new Map(live(history.evidence).map(row => [row.id, row]))
  return facts.flatMap(fact => {
    const filed = returns.get(fact.taxReturnId)
    const obligation = filed && obligations.get(filed.obligationId)
    const basis = obligation?.effectiveBasis
    const source = evidence.get(fact.evidenceId)
    const authority = fact.authority === 'us' ? 'US:federal' : 'KR:national'
    const currency = fact.authority === 'us' ? 'USD' : 'KRW'
    if (filed?.status !== 'accepted' || obligation?.taxYear !== fact.year || obligation.authority !== authority ||
        units.get(obligation.taxUnitId)?.year !== fact.year || obligation.currency !== currency || source?.sha256 !== fact.sha256 || !filed.evidenceIds.includes(source.id) ||
        basis?.kind !== 'return' || basis.id !== filed.id || basis.recordRevision !== filed.recordRevision ||
        !basis.evidenceIds.length || !basis.evidenceIds.every(id => evidence.has(id))) return []
    return [{
      id: [filed.id, source.id, fact.page, fact.category].join(':'),
      source: `/taxes/evidence/${encodeURIComponent(source.id)}`,
      page: fact.page, year: fact.year, authority: fact.authority, category: fact.category,
      eligibleMinor: fact.eligibleMinor, limitMinor: fact.limitMinor, appliedMinor: fact.appliedMinor,
    }]
  }).sort((a, b) => b.year - a.year || a.page - b.page)
}
