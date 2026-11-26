'use client'

import { useState } from 'react'
import { Select } from '@/components/form'
import { TextLink } from '@/components/ui'
import { INVESTMENT_TAX_YEARS, readInvestmentTaxYear, type InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import { InvestmentTaxReserve } from '@/components/InvestmentTaxReserve'
import { KrOverseasStockTax } from '@/components/KrOverseasStockTax'
import type { Language } from '@/lib/i18n'
import { snapshotTax } from '@/lib/ui-copy/pages/snapshotTax'

export function SnapshotTaxEstimates({ language, defaultYear }: { language: Language; defaultYear: InvestmentTaxYear }) {
  const copy = snapshotTax[language]
  const [year, setYear] = useState(defaultYear)
  const [jurisdiction, setJurisdiction] = useState('')
  const [purpose, setPurpose] = useState('realized')
  const comparison = purpose === 'realized' ? copy.realizedComparison : copy.saleComparison

  return (
    <div className="space-y-3">
      <h3 className="text-body font-medium">{copy.estimateTitle}</h3>
      <p className="text-caption text-ink-2">{copy.estimateScope}</p>
      <div className="flex flex-wrap gap-3">
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-label">{copy.taxYear}</span>
          <Select
            value={year}
            onChange={event => setYear(readInvestmentTaxYear(event.target.value) ?? defaultYear)}
          >
            {INVESTMENT_TAX_YEARS.map(item => <option key={item} value={item}>{item}</option>)}
          </Select>
        </label>
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-label">{copy.jurisdiction}</span>
          <Select className="max-w-full" value={jurisdiction} onChange={event => setJurisdiction(event.target.value)}>
            <option value="">{copy.jurisdiction}</option>
            <option value="us">{copy.us}</option>
            <option value="kr">{copy.kr}</option>
          </Select>
        </label>
        <label className="block min-w-0 max-w-full">
          <span className="mb-1 block text-label">{copy.purpose}</span>
          <Select className="max-w-full" value={purpose} onChange={event => setPurpose(event.target.value)}>
            <option value="realized">{copy.realized}</option>
            <option value="sale">{copy.sale}</option>
          </Select>
        </label>
      </div>
      {purpose === 'realized' && <TextLink href={`/realized?year=${year}`}>{copy.realizedHistory}</TextLink>}
      {jurisdiction === 'us' && <InvestmentTaxReserve key={`${year}-${purpose}`} language={language} year={year} comparison={comparison} />}
      {jurisdiction === 'kr' && <KrOverseasStockTax key={`${year}-${purpose}`} language={language} year={year} comparison={comparison} />}
    </div>
  )
}
