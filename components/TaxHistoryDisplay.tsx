import { TextLink } from '@/components/ui'
import type { Money } from '@/lib/domain/taxes/history'
import { formatMoney } from '@/lib/domain/taxes/reconcile'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'

export function RecordedSettlementPrincipal({ language, currency, minor }: Money & { language: Language }) {
  const copy = getPageCopy('taxHistory', language)
  return (
    <>
      <span className="whitespace-nowrap tabular-nums">{formatMoney({ currency, minor })}</span>
      {minor === '0' && <div className="mt-1 text-caption text-ink-2">{copy.settledZeroNote}</div>}
    </>
  )
}

export function EmptyCashHistory({
  language, unitId, year, authority,
}: {
  language: Language
  unitId: string
  year?: string
  authority?: string
}) {
  const copy = getPageCopy('taxHistory', language)
  const filters = new URLSearchParams({ unit: unitId })
  if (year) filters.set('year', year)
  if (authority) filters.set('authority', authority)
  return (
    <div className="space-y-2 p-4">
      <p className="text-body text-ink-2">{copy.emptyCash}</p>
      <TextLink href={`/taxes?${filters}`}>{copy.reviewYear}</TextLink>
    </div>
  )
}

export function TaxEvidenceLink({ language, evidenceId }: { language: Language; evidenceId: string }) {
  const copy = getPageCopy('taxHistory', language)
  return (
    <TextLink className="mt-2 break-all underline" href={`/taxes/evidence/${encodeURIComponent(evidenceId)}`}>
      {copy.openEvidence} · {evidenceId}
    </TextLink>
  )
}
