'use client'

import { useMemo, useState } from 'react'
import { Checkbox, Input, Select } from '@/components/form'
import { Note, TextLink } from '@/components/ui'
import { INVESTMENT_TAX_YEARS, readInvestmentTaxYear, type InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import { estimateHoldingSale, positionQuantity, type HoldingsForSale } from '@/lib/domain/taxes/holding-sale'
import { InvestmentTaxReserve } from '@/components/InvestmentTaxReserve'
import { KrOverseasStockTax } from '@/components/KrOverseasStockTax'
import { localeFor } from '@/lib/format'
import type { RealizedTaxInputs } from '@/lib/application/realized-tax-inputs'
import type { Language } from '@/lib/i18n'
import { snapshotTax } from '@/lib/ui-copy/pages/snapshotTax'

export function SnapshotTaxEstimates({ language, defaultYear, recorded, saleYear, sales, saleRecorded }: {
  language: Language
  defaultYear: InvestmentTaxYear
  recorded: RealizedTaxInputs | null
  saleYear?: InvestmentTaxYear
  sales: HoldingsForSale | null
  saleRecorded: RealizedTaxInputs | null
}) {
  const copy = snapshotTax[language]
  const [year, setYear] = useState(defaultYear)
  const [jurisdiction, setJurisdiction] = useState('')
  const [purpose, setPurpose] = useState('realized')
  const [manual, setManual] = useState(false)
  const [positionId, setPositionId] = useState('')
  const [quantity, setQuantity] = useState('')
  const isUs = jurisdiction === 'us'
  const sale = purpose === 'sale' && year === saleYear
  const useRealizedRecords = !!jurisdiction && (sale || (year === 2026 && purpose === 'realized'))
  const ledger = sale ? saleRecorded : recorded
  const available = useRealizedRecords ? (isUs ? ledger?.us : ledger?.kr) : null
  const position = sale ? sales?.positions.find(item => item.id === positionId) : undefined
  const fxRate = sales?.fx?.rate ?? null
  const proposed = useMemo(() => position ? estimateHoldingSale(position, quantity, fxRate) : null, [position, quantity, fxRate])
  const proposedForJurisdiction = isUs ? proposed?.us : proposed?.krw
  const locale = localeFor(language)
  const usd = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })
  const krw = new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW' })
  const fx = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 })
  const shares = new Intl.NumberFormat(locale, { maximumFractionDigits: 8 })
  const auto = !manual && (sale ? ledger != null && proposedForJurisdiction != null : !!available?.lots)
  const showForm = !sale || manual || auto
  const comparison = purpose === 'realized' ? copy.realizedComparison : copy.saleComparison
  // The sale-mode manual baseline includes YTD gains. Clear the pre-gain
  // automatic inputs when switching to that differently defined baseline.
  const formKey = [year, purpose, sale && manual].join('-')

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
      {(purpose === 'realized' || sale) && <TextLink href={`/realized?year=${year}`}>{copy.realizedHistory}</TextLink>}
      {useRealizedRecords && (
        <div className="space-y-2">
          <Note>
            {!ledger ? (sale ? copy.saleLedgerUnavailable : copy.recordedUnavailable) : !available?.lots ? (sale ? copy.saleLedgerEmpty(available?.skipped ?? 0) : copy.recordedEmpty) : (
              <>
                <span className="block font-medium">
                  {isUs ? copy.recordedUs(usd.format(ledger.us.shortUsd), usd.format(ledger.us.longUsd)) : copy.recordedKr(krw.format(ledger.kr.gainKrw))}
                </span>
                <span className="block">{copy.recordedCoverage(available.lots, available.skipped)}</span>
              </>
            )}
          </Note>
          {(sale || !!available?.lots) && (
            <label className="flex min-h-6 items-center gap-2 text-label">
              <Checkbox checked={manual} onChange={event => setManual(event.target.checked)} />
              {copy.manualComparison}
            </label>
          )}
        </div>
      )}
      {sale && !manual && jurisdiction && (
        <div className="space-y-3 rounded-md border border-line-subtle p-4">
          <p className="text-body text-ink-2" id="snapshot-sale-scope">
            {sales ? copy.saleScope(sales.date) : copy.saleUnavailable}
          </p>
          {sales?.positions.length === 0 && <Note>{copy.saleEmpty}</Note>}
          {!!sales?.unreconciled && <Note>{copy.saleUnreconciled(sales.unreconciled)}</Note>}
          {!!sales?.positions.length && (
            <div className="flex flex-wrap gap-4">
              <label className="block min-w-0 flex-1 basis-64">
                <span className="mb-1 block text-label">{copy.position}</span>
                <Select className="w-full" value={positionId} aria-describedby="snapshot-sale-scope" onChange={event => {
                  setPositionId(event.target.value)
                  setQuantity('')
                }}>
                  <option value="">{copy.choosePosition}</option>
                  {sales.positions.map(item => (
                    <option key={item.id} value={item.id}>{[item.ticker, item.accountLabel].filter(Boolean).join(' · ')}</option>
                  ))}
                </Select>
              </label>
              {position && (
                <label className="block min-w-0 flex-1 basis-48">
                  <span className="mb-1 block text-label">{copy.saleQuantity}</span>
                  <Input className="w-full tabular-nums" inputMode="decimal" value={quantity} size="md"
                    aria-describedby="snapshot-sale-quantity"
                    aria-invalid={!!quantity && proposed == null}
                    onChange={event => setQuantity(event.target.value)}
                  />
                </label>
              )}
            </div>
          )}
          {position && (
            <div className="space-y-2" aria-live="polite">
              <p id="snapshot-sale-quantity" className="text-body text-ink-2">{copy.saleQuantityHint(shares.format(positionQuantity(position)))}</p>
              <p className="text-body text-ink-2">{position.quote ? copy.quote(usd.format(position.quote.usd), position.quote.date) : copy.quoteMissing}</p>
              {!isUs && <p className="text-body text-ink-2">{sales?.fx ? copy.fx(fx.format(sales.fx.rate), sales.fx.date) : copy.fxMissing}</p>}
              {!!quantity && (proposed == null ? <Note>{copy.saleInvalid}</Note> : (
                <>
                  {proposed.proceedsUsd != null && <p className="text-body tabular-nums">{copy.saleProceeds(usd.format(proposed.proceedsUsd), proposed.lots)}</p>}
                  {isUs && proposed.us && <p className="text-body tabular-nums">{copy.proposedUs(usd.format(proposed.us.shortUsd), usd.format(proposed.us.longUsd))}</p>}
                  {!isUs && proposed.krw != null && <p className="text-body tabular-nums">{copy.proposedKr(krw.format(proposed.krw))}</p>}
                  {proposedForJurisdiction == null && <Note>{copy.saleMissingBasis}</Note>}
                </>
              ))}
            </div>
          )}
        </div>
      )}
      {!!jurisdiction && (
        <div hidden={!showForm}>
          {isUs ? (
            <InvestmentTaxReserve key={formKey} language={language} year={year} comparison={comparison}
              recorded={auto ? ledger?.us : undefined} proposed={auto && sale ? proposed?.us ?? undefined : undefined} />
          ) : (
            <KrOverseasStockTax key={formKey} language={language} year={year} comparison={comparison}
              recordedKrw={auto ? ledger?.kr.gainKrw : undefined} proposedKrw={auto && sale ? proposed?.krw ?? undefined : undefined} />
          )}
        </div>
      )}
    </div>
  )
}
