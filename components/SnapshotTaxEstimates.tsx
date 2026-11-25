'use client'

import { useState } from 'react'
import { Select } from '@/components/form'
import { InvestmentTaxReserve } from '@/components/InvestmentTaxReserve'
import { KrOverseasStockTax } from '@/components/KrOverseasStockTax'
import type { Language } from '@/lib/i18n'
import { snapshotTax } from '@/lib/ui-copy/pages/snapshotTax'

export function SnapshotTaxEstimates({ language }: { language: Language }) {
  const copy = snapshotTax[language]
  const [jurisdiction, setJurisdiction] = useState('')
  const [purpose, setPurpose] = useState('realized')
  const comparison = purpose === 'realized' ? copy.realizedComparison : copy.saleComparison

  return (
    <div className="space-y-3">
      <h3 className="text-body font-medium">{copy.estimateTitle}</h3>
      <p className="text-caption text-ink-2">{copy.estimateScope}</p>
      <div className="flex flex-wrap gap-3">
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
      {jurisdiction === 'us' && <InvestmentTaxReserve key={purpose} language={language} comparison={comparison} />}
      {jurisdiction === 'kr' && <KrOverseasStockTax key={purpose} language={language} comparison={comparison} />}
    </div>
  )
}
