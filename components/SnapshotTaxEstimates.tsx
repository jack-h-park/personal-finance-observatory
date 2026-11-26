'use client'

import { useState } from 'react'
import { Checkbox, Select } from '@/components/form'
import { Note, TextLink } from '@/components/ui'
import { INVESTMENT_TAX_YEARS, readInvestmentTaxYear, type InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import { InvestmentTaxReserve } from '@/components/InvestmentTaxReserve'
import { KrOverseasStockTax } from '@/components/KrOverseasStockTax'
import { localeFor } from '@/lib/format'
import type { RealizedTaxInputs } from '@/lib/application/realized-tax-inputs'
import type { Language } from '@/lib/i18n'
import { snapshotTax } from '@/lib/ui-copy/pages/snapshotTax'

export function SnapshotTaxEstimates({ language, defaultYear, recorded }: {
  language: Language
  defaultYear: InvestmentTaxYear
  recorded: RealizedTaxInputs | null
}) {
  const copy = snapshotTax[language]
  const [year, setYear] = useState(defaultYear)
  const [jurisdiction, setJurisdiction] = useState('')
  const [purpose, setPurpose] = useState('realized')
  const [manual, setManual] = useState(false)
  const isUs = jurisdiction === 'us'
  const useRealizedRecords = year === 2026 && purpose === 'realized' && !!jurisdiction
  const available = useRealizedRecords ? (isUs ? recorded?.us : recorded?.kr) : null
  const usd = new Intl.NumberFormat(localeFor(language), { style: 'currency', currency: 'USD' })
  const krw = new Intl.NumberFormat(localeFor(language), { style: 'currency', currency: 'KRW' })
  const auto = !!available?.lots && !manual
  const comparison = purpose === 'realized' ? copy.realizedComparison : copy.saleComparison

  const formKey = [year, purpose].join('-')

  return (
    <div className="space-y-3">
      <h3 className="text-body font-medium">{copy.estimateTitle}</h3>
      <p className="text-caption text-ink-2">{copy.estimateScope}</p>
      <div className="flex flex-wrap gap-3">
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-label">{copy.taxYear}</span>
          <Select
            value={year}
            onChange={event => { setYear(readInvestmentTaxYear(event.target.value) ?? defaultYear); setManual(false) }}
          >
            {INVESTMENT_TAX_YEARS.map(item => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-label">{copy.jurisdiction}</span>
          <Select className="max-w-full" value={jurisdiction} onChange={event => { setJurisdiction(event.target.value); setManual(false) }}>
            <option value="">{copy.jurisdiction}</option>
            <option value="us">{copy.us}</option>
            <option value="kr">{copy.kr}</option>
          </Select>
        </label>
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-label">{copy.purpose}</span>
          <Select className="max-w-full" value={purpose} onChange={event => { setPurpose(event.target.value); setManual(false) }}>
            <option value="realized">{copy.realized}</option>
            <option value="sale">{copy.sale}</option>
          </Select>
        </label>
      </div>
      {purpose === 'realized' && <TextLink href={`/realized?year=${year}`}>{copy.realizedHistory}</TextLink>}
      {useRealizedRecords && (
        <div className="space-y-2">
          <Note>
            {!recorded ? copy.recordedUnavailable : !available?.lots ? copy.recordedEmpty : (
              <>
                <span className="block font-medium">
                  {isUs ? copy.recordedUs(usd.format(recorded.us.shortUsd), usd.format(recorded.us.longUsd)) : copy.recordedKr(krw.format(recorded.kr.gainKrw))}
                </span>
                <span className="block">{copy.recordedCoverage(available.lots, available.skipped)}</span>
              </>
            )}
          </Note>
          {!!available?.lots && (
            <label className="flex min-h-6 items-center gap-2 text-label">
              <Checkbox checked={manual} onChange={event => setManual(event.target.checked)} />
              {copy.manualComparison}
            </label>
          )}
        </div>
      )}
      {jurisdiction === 'us' && <InvestmentTaxReserve key={formKey} language={language} year={year} comparison={comparison} recorded={auto ? recorded?.us : undefined} />}
      {jurisdiction === 'kr' && <KrOverseasStockTax key={formKey} language={language} year={year} comparison={comparison} recordedKrw={auto ? recorded?.kr.gainKrw : undefined} />}
    </div>
  )
}
