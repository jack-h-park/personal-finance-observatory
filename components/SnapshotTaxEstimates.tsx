'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Checkbox, Input, Select } from '@/components/form'
import { Button, Note, TextLink } from '@/components/ui'
import { INVESTMENT_TAX_YEARS, readInvestmentTaxYear, type InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import { estimateHoldingSales, positionQuantity, type HoldingsForSale, type SaleLine } from '@/lib/domain/taxes/holding-sale'
import { InvestmentTaxReserve } from '@/components/InvestmentTaxReserve'
import { SavedSaleComparisons } from '@/components/SavedSaleComparisons'
import { savedSales } from '@/lib/ui-copy/pages/savedSales'
import type { SavedSaleLine } from '@/lib/application/saved-holding-sales'
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
  const [lines, setLines] = useState<(SaleLine & { id: number; label?: string })[]>([{ id: 0, positionId: '', quantity: '' }])
  const nextLine = useRef(1)
  const pendingFocus = useRef<number | null>(null)
  const linePrefix = useId()
  useEffect(() => {
    if (pendingFocus.current == null) return
    document.getElementById(`${linePrefix}-position-${pendingFocus.current}`)?.focus()
    pendingFocus.current = null
  }, [lines, linePrefix])
  const editLine = (id: number, changes: Partial<SaleLine>) =>
    setLines(current => current.map(line => line.id === id ? { ...line, ...changes } : line))
  const isUs = jurisdiction === 'us'
  const sale = purpose === 'sale' && year === saleYear
  const useRealizedRecords = !!jurisdiction && (sale || (year === 2026 && purpose === 'realized'))
  const ledger = sale ? saleRecorded : recorded
  const available = useRealizedRecords ? (isUs ? ledger?.us : ledger?.kr) : null
  const proposed = useMemo(() => sale && sales ? estimateHoldingSales(sales.positions, lines, sales.fx?.rate ?? null) : null, [sale, sales, lines])
  const draft = proposed && proposed.rows.every(row => !row.error) ? lines.map((line, index) => {
    const position = proposed.rows[index].position
    return { positionId: line.positionId, quantity: line.quantity.trim(),
      label: position ? [position.ticker, position.accountLabel].filter(Boolean).join(' · ') : '' }
  }) : null
  const loadSale = (saved: SavedSaleLine[]) => {
    const restored = saved.map(line => ({ ...line, id: nextLine.current++ }))
    pendingFocus.current = restored[0].id
    setManual(false)
    if (!jurisdiction) setJurisdiction('us')
    setLines(restored)
  }
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
          {sales && proposed && sales.positions.length > 0 && (
            <>
              {!isUs && <p className="text-body text-ink-2">{sales.fx ? copy.fx(fx.format(sales.fx.rate), sales.fx.date) : copy.fxMissing}</p>}
              {lines.map((line, index) => {
                const { position, error, estimate } = proposed.rows[index]
                const positionControl = `${linePrefix}-position-${line.id}`
                const quantityHelp = `${linePrefix}-quantity-help-${line.id}`
                const quantityError = error === 'balance' && position ? copy.saleOverdraw(shares.format(positionQuantity(position))) :
                  error === 'quantity' && line.quantity.trim() ? copy.saleInvalid : null
                return (
                  <fieldset key={line.id} className="min-w-0 space-y-2 rounded-md border border-line p-3">
                    <legend className="px-1 text-label">{copy.saleLine(index + 1)}</legend>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="block min-w-0 flex-1 basis-64">
                        <span className="mb-1 block text-label">{copy.position}</span>
                        <Select id={positionControl} className="w-full" value={line.positionId} aria-describedby="snapshot-sale-scope"
                          onChange={event => editLine(line.id, { positionId: event.target.value, quantity: '' })}>
                          <option value="">{copy.choosePosition}</option>
                          {!position && line.positionId && <option value={line.positionId} disabled>
                            {savedSales[language].unavailablePosition(line.label ?? '')}
                          </option>}
                          {sales.positions.map(item => (
                            <option key={item.id} value={item.id}>{[item.ticker, item.accountLabel].filter(Boolean).join(' · ')}</option>
                          ))}
                        </Select>
                      </label>
                      {position && (
                        <label className="block min-w-0 flex-1 basis-36">
                          <span className="mb-1 block text-label">{copy.saleQuantity}</span>
                          <Input className="w-full tabular-nums" inputMode="decimal" value={line.quantity} size="md"
                            aria-describedby={quantityHelp}
                            aria-invalid={!!quantityError}
                            onChange={event => editLine(line.id, { quantity: event.target.value })}
                          />
                        </label>
                      )}
                      {lines.length > 1 && (
                        <Button type="button" variant="ghost" aria-label={copy.removeSaleLine(index + 1)} onClick={() => {
                          pendingFocus.current = (lines[index + 1] ?? lines[index - 1]).id
                          setLines(current => current.filter(item => item.id !== line.id))
                        }}>{copy.removeSale}</Button>
                      )}
                    </div>
                    {!position && line.positionId && <Note>{savedSales[language].unavailablePosition(line.label ?? '')}</Note>}
                    {position && (
                      <div className="space-y-1.5" aria-live="polite">
                        <div id={quantityHelp} className="space-y-1">
                          <p className="text-body text-ink-2">{copy.saleQuantityHint(shares.format(positionQuantity(position)))}</p>
                          {quantityError && <p className="text-body text-danger">{quantityError}</p>}
                        </div>
                        <p className="text-body text-ink-2">{position.quote ? copy.quote(usd.format(position.quote.usd), position.quote.date) : copy.quoteMissing}</p>
                        {estimate?.proceedsUsd != null && <p className="text-body tabular-nums">{copy.saleProceeds(usd.format(estimate.proceedsUsd), estimate.lots)}</p>}
                        {isUs && estimate?.us && <p className="text-body tabular-nums">{copy.proposedUs(usd.format(estimate.us.shortUsd), usd.format(estimate.us.longUsd))}</p>}
                        {!isUs && estimate?.krw != null && <p className="text-body tabular-nums">{copy.proposedKr(krw.format(estimate.krw))}</p>}
                        {estimate?.missingDate && <Note>{copy.saleMissingDate}</Note>}
                        {estimate?.missingBasis[isUs ? 'us' : 'kr'] && <Note>{isUs ? copy.saleMissingUsdBasis : copy.saleMissingKrwBasis}</Note>}
                      </div>
                    )}
                  </fieldset>
                )
              })}
              <Button type="button" variant="outline" onClick={() => {
                const id = nextLine.current++
                pendingFocus.current = id
                setLines(current => [...current, { id, positionId: '', quantity: '' }])
              }}>{copy.addSaleLine}</Button>
              {lines.length > 1 && (
                <div aria-live="polite">
                  {isUs && proposed.us && <Note>{copy.saleTotalUs(usd.format(proposed.us.shortUsd), usd.format(proposed.us.longUsd))}</Note>}
                  {!isUs && proposed.krw != null && <Note>{copy.saleTotalKr(krw.format(proposed.krw))}</Note>}
                  {proposedForJurisdiction == null && <Note>{copy.saleResolveLines}</Note>}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {sale && sales && <SavedSaleComparisons language={language} book={sales} ledger={saleRecorded} year={year} draft={draft} onLoad={loadSale} />}
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
