'use client'

import { useEffect, useMemo, useState } from 'react'
import { Checkbox, Input, Select } from '@/components/form'
import { Button, Note } from '@/components/ui'
import { compareHoldingSale, readSavedHoldingSale, SAVED_SALE_PREFIX, type SaleComparisonAssumptions, type SavedHoldingSale, type SavedSaleLine } from '@/lib/application/saved-holding-sales'
import type { RealizedTaxInputs } from '@/lib/application/realized-tax-inputs'
import type { HoldingsForSale } from '@/lib/domain/taxes/holding-sale'
import { reserveFields } from '@/lib/domain/taxes/investment-tax-reserve'
import type { InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import { EMPTY_VALUE, localeFor } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { investmentTaxReserve } from '@/lib/ui-copy/pages/investmentTaxReserve'
import { krOverseasStockTax } from '@/lib/ui-copy/pages/krOverseasStockTax'
import { snapshotTax } from '@/lib/ui-copy/pages/snapshotTax'
import { savedSales } from '@/lib/ui-copy/pages/savedSales'

const emptyInputs: SaleComparisonAssumptions = {
  us: { profile: '', filing: '', baseline: { taxable: '', preferential: '', magi: '', nii: '' }, adjustments: { short: '', long: '' } },
  kr: { confirmed: false, adjustment: '' },
}

function readCombinations() {
  const saved: SavedHoldingSale[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(SAVED_SALE_PREFIX)) continue
    const combo = readSavedHoldingSale(localStorage.getItem(key) ?? '')
    if (combo && key === SAVED_SALE_PREFIX + combo.id) saved.push(combo)
  }
  return saved
}

export function SavedSaleComparisons({ language, book, ledger, year, draft, onLoad }: {
  language: Language
  book: HoldingsForSale
  ledger: RealizedTaxInputs | null
  year: InvestmentTaxYear
  draft: SavedSaleLine[] | null
  onLoad: (lines: SavedSaleLine[]) => void
}) {
  const copy = savedSales[language]
  const formCopy = investmentTaxReserve[language]
  const locale = localeFor(language)
  const [saved, setSaved] = useState<SavedHoldingSale[]>([])
  const [storage, setStorage] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [inputs, setInputs] = useState(emptyInputs)
  const [applied, setApplied] = useState<SaleComparisonAssumptions | null>(null)
  useEffect(() => {
    const sync = () => {
      try {
        setSaved(readCombinations())
        setStorage('ready')
      } catch {
        setStorage('error')
      }
    }
    sync()
    const listen = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(SAVED_SALE_PREFIX)) sync()
    }
    window.addEventListener('storage', listen)
    return () => window.removeEventListener('storage', listen)
  }, [])
  const ordered = useMemo(() => [...saved].sort((a, b) => a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id)), [saved, locale])
  const chosen = useMemo(() => ordered.filter(combo => selected.includes(combo.id)), [ordered, selected])
  const rows = useMemo(() => chosen.map(combo => ({
    combo, estimate: compareHoldingSale(combo.lines, book, ledger, applied, year),
  })), [chosen, book, ledger, applied, year])
  const quoteDates = [...new Set(chosen.flatMap(combo => combo.lines.map(line => book.positions.find(position => position.id === line.positionId)?.quote?.date).filter(Boolean)))].sort()
  const money = (currency: 'USD' | 'KRW', amount: number | null | undefined, signed = false) =>
    amount == null ? EMPTY_VALUE : new Intl.NumberFormat(locale, { style: 'currency', currency, signDisplay: signed ? 'exceptZero' : 'auto' }).format(amount)
  const update = (value: SaleComparisonAssumptions) => { setInputs(value); setApplied(null) }

  return (
    <section aria-label={copy.title} className="space-y-3 rounded-md border border-line-subtle p-4">
      <h4 className="text-body font-medium">{copy.title}</h4>
      <p className="text-body text-ink-2" id="saved-sale-storage">{copy.browser}</p>
      <form className="flex flex-wrap items-end gap-2" aria-describedby="saved-sale-storage" onSubmit={event => {
        event.preventDefault()
        if (!draft || !name.trim() || storage !== 'ready') return
        try {
          const combo = { id: crypto.randomUUID(), name: name.trim(), lines: draft }
          localStorage.setItem(SAVED_SALE_PREFIX + combo.id, JSON.stringify({ version: 1, ...combo }))
          setSaved(current => [...current, combo])
          setSelected(current => [...current, combo.id])
          setName('')
          setMessage(copy.saved)
        } catch {
          setMessage(copy.saveFailed)
        }
      }}>
        <label className="block min-w-0 flex-1 basis-60">
          <span className="mb-1 block text-label">{copy.name}</span>
          <Input className="w-full" size="md" maxLength={120} required value={name} onChange={event => { setName(event.target.value); setMessage('') }} />
        </label>
        <Button type="submit" variant="outline" disabled={storage !== 'ready' || !draft || !name.trim()}>{copy.save}</Button>
      </form>
      <div aria-live="polite" className="text-body text-ink-2">{message}</div>
      {storage === 'error' && <Note>{copy.storageFailed}</Note>}
      {storage === 'loading' && <Note>{copy.loading}</Note>}
      {storage === 'ready' && ordered.length === 0 && <Note>{copy.empty}</Note>}
      {ordered.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-label">{copy.choose}</legend>
          {ordered.map(combo => (
            <div key={combo.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-subtle px-3 py-1">
              <label className="flex min-h-6 min-w-0 items-center gap-2 text-body">
                <Checkbox checked={selected.includes(combo.id)} onChange={event => {
                  const checked = event.target.checked
                  setSelected(current => checked ? [...current, combo.id] : current.filter(id => id !== combo.id))
                }} />
                <span className="break-all">{combo.name}</span>
              </label>
              <Button type="button" variant="ghost" aria-label={copy.loadName(combo.name)} onClick={() => onLoad(combo.lines)}>{copy.load}</Button>
            </div>
          ))}
        </fieldset>
      )}
      {chosen.length >= 2 && (
        <div className="space-y-3">
          <p className="text-body text-ink-2">{copy.snapshot(book.date, book.fx?.date ?? EMPTY_VALUE, quoteDates.join(' · ') || EMPTY_VALUE)}</p>
          <Note>{copy.method}</Note>
          {ledger ? (
            <Note>
              <span className="block">{snapshotTax[language].recordedUs(money('USD', ledger.us.shortUsd), money('USD', ledger.us.longUsd))}</span>
              <span className="block">{snapshotTax[language].recordedCoverage(ledger.us.lots, ledger.us.skipped)}</span>
              <span className="mt-2 block">{snapshotTax[language].recordedKr(money('KRW', ledger.kr.gainKrw))}</span>
              <span className="block">{snapshotTax[language].recordedCoverage(ledger.kr.lots, ledger.kr.skipped)}</span>
            </Note>
          ) : <Note>{copy.ledgerMissing}</Note>}
          <form autoComplete="off" className="space-y-3" onSubmit={event => { event.preventDefault(); setApplied(inputs) }}>
            <fieldset className="space-y-2 rounded-md border border-line p-3">
              <legend className="px-1 text-label">{copy.usInputs}</legend>
              <p className="text-body text-ink-2">{formCopy.saleScope}</p>
              <div className="flex flex-wrap gap-3">
                <label className="block min-w-0 flex-1 basis-64">
                  <span className="mb-1 block text-label">{formCopy.profile}</span>
                  <Select className="w-full" value={inputs.us.profile} onChange={event => update({ ...inputs, us: { ...inputs.us, profile: event.target.value } })}>
                    <option value="">{formCopy.profileUnknown}</option>
                    <option value="supported">{formCopy.recordedProfile}</option>
                  </Select>
                </label>
                <label className="block min-w-0 flex-1 basis-48">
                  <span className="mb-1 block text-label">{formCopy.filing}</span>
                  <Select className="w-full" value={inputs.us.filing} onChange={event => update({ ...inputs, us: { ...inputs.us, filing: event.target.value } })}>
                    <option value="">{formCopy.chooseFiling}</option>
                    <option value="single">{formCopy.filings.single}</option>
                    <option value="mfj">{formCopy.filings.mfj}</option>
                  </Select>
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                {reserveFields.map(key => (
                  <label key={key} className="block min-w-0 flex-1 basis-52">
                    <span className="mb-1 block text-label">{formCopy.fields[key]}</span>
                    <Input className="w-full tabular-nums" size="md" inputMode="decimal" maxLength={18} value={inputs.us.baseline[key]}
                      onChange={event => update({ ...inputs, us: { ...inputs.us, baseline: { ...inputs.us.baseline, [key]: event.target.value } } })} />
                  </label>
                ))}
              </div>
              <p className="text-body text-ink-2">{formCopy.recordedAdjustments}</p>
              <div className="flex flex-wrap gap-3">
                {(['short', 'long'] as const).map(key => (
                  <label key={key} className="block min-w-0 flex-1 basis-52">
                    <span className="mb-1 block text-label">{formCopy.adjustmentFields[key]}</span>
                    <Input className="w-full tabular-nums" size="md" maxLength={18} value={inputs.us.adjustments[key]}
                      onChange={event => update({ ...inputs, us: { ...inputs.us, adjustments: { ...inputs.us.adjustments, [key]: event.target.value } } })} />
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2 rounded-md border border-line p-3">
              <legend className="px-1 text-label">{copy.krInputs}</legend>
              <p className="text-body text-ink-2">{krOverseasStockTax[language].assumption}</p>
              <label className="flex min-h-6 items-center gap-2 text-body">
                <Checkbox checked={inputs.kr.confirmed} onChange={event => update({ ...inputs, kr: { ...inputs.kr, confirmed: event.target.checked } })} />
                {copy.confirmKr}
              </label>
              <label className="block max-w-sm">
                <span className="mb-1 block text-label">{copy.adjustKr}</span>
                <Input className="w-full tabular-nums" size="md" maxLength={20} value={inputs.kr.adjustment}
                  onChange={event => update({ ...inputs, kr: { ...inputs.kr, adjustment: event.target.value } })} />
              </label>
            </fieldset>
            <Button type="submit" disabled={!ledger}>{copy.compare}</Button>
          </form>
          <div className="max-w-full overflow-x-auto" role="region" aria-label={copy.table} tabIndex={0}>
            <table className="w-full text-body">
              <caption className="sr-only">{copy.table}</caption>
              <thead><tr>
                <th scope="col" className="p-2 text-left">{copy.name}</th>
                {copy.columns.map(column => <th key={column} scope="col" className="min-w-28 p-2 text-right">{column}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(({ combo, estimate }) => (
                  <tr key={combo.id} className="border-t border-line-subtle">
                    <th scope="row" className="min-w-28 break-all p-2 text-left">{combo.name}
                      {(estimate.invalidLines || estimate.missingBasis.us || estimate.missingBasis.kr) && <span className="block text-caption text-ink-2">{copy.review}</span>}
                    </th>
                    {[
                      money('USD', estimate.grossUsd), money('KRW', estimate.grossKrw),
                      money('USD', estimate.us?.delta, true), money('USD', estimate.us?.after),
                      money('KRW', estimate.kr?.delta, true), money('KRW', estimate.kr?.after),
                    ].map((value, index) => <td key={index} className="whitespace-nowrap p-2 text-right tabular-nums">{value}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sr-only" role="status">{applied && copy.compared}</p>
          {applied && rows.some(({ estimate }) => !estimate.us || !estimate.kr) && <Note>{copy.unavailable}</Note>}
        </div>
      )}
    </section>
  )
}
