'use client'

import { useState } from 'react'
import { Checkbox, Input, Select } from '@/components/form'
import { Button, Card, Note, TextLink } from '@/components/ui'
import { estimateCrossBorderSaleTax, type CreditAmounts, type CrossBorderSaleInput } from '@/lib/domain/taxes/cross-border-sale-tax'
import { reserveFields } from '@/lib/domain/taxes/investment-tax-reserve'
import { localeFor } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { crossBorderSaleTax } from '@/lib/ui-copy/pages/crossBorderSaleTax'
import { investmentTaxReserve } from '@/lib/ui-copy/pages/investmentTaxReserve'

const sides = ['baseline', 'scenario'] as const
const authorities = ['unknown', 'none', 'us', 'kr'] as const
const emptyScenario = { us: { taxable: '', preferential: '', magi: '', nii: '' }, krwGain: '' }
const emptyCredit: CreditAmounts = { eligibleTax: '', limit: '' }

type ResultRow = [label: string, currency: 'USD' | 'KRW', baseline: bigint, scenario: bigint, delta: bigint]

function ResultTable({ language, rows }: { language: Language; rows: ResultRow[] }) {
  const copy = crossBorderSaleTax[language]
  const format = (currency: 'USD' | 'KRW', value: bigint, signed: boolean) =>
    new Intl.NumberFormat(localeFor(language), { style: 'currency', currency, signDisplay: signed ? 'exceptZero' : 'auto' })
      .format(currency === 'USD' ? Number(value) / 100 : value)

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full text-body">
        <thead>
          <tr>
            <th scope="col" className="text-left">{copy.item}</th>
            <th scope="col" className="text-right">{copy.before}</th>
            <th scope="col" className="text-right">{copy.after}</th>
            <th scope="col" className="text-right">{copy.delta}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, currency, baseline, scenario, delta]) => (
            <tr key={label} className="border-t border-line-subtle">
              <th scope="row" className="py-2 text-left font-medium">{label}</th>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{format(currency, baseline, false)}</td>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{format(currency, scenario, false)}</td>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{format(currency, delta, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CrossBorderSaleTax({ language }: { language: Language }) {
  const copy = crossBorderSaleTax[language]
  const usCopy = investmentTaxReserve[language]
  const [supported, setSupported] = useState(false)
  const [filing, setFiling] = useState('')
  const [krwPerUsd, setKrwPerUsd] = useState('')
  const [amounts, setAmounts] = useState({ baseline: emptyScenario, scenario: emptyScenario })
  const [authority, setAuthority] = useState<(typeof authorities)[number]>('unknown')
  const [credits, setCredits] = useState({ baseline: emptyCredit, scenario: emptyCredit })
  const [result, setResult] = useState<ReturnType<typeof estimateCrossBorderSaleTax> | null>(null)

  return (
    <div className="space-y-5">
      <Card title={usCopy.profile}>
        <form
          className="space-y-4 p-4"
          autoComplete="off"
          aria-describedby="sale-tax-scope sale-tax-exclusions"
          onChange={() => setResult(null)}
          onSubmit={event => {
            event.preventDefault()
            const credit: CrossBorderSaleInput['credit'] = authority === 'us' || authority === 'kr' ? { authority, ...credits } : { authority }
            setResult(estimateCrossBorderSaleTax({ supported, filing, krwPerUsd, ...amounts, credit }))
          }}
        >
          <p id="sale-tax-scope" className="text-body text-ink-2">{copy.scope}</p>
          <Note><span id="sale-tax-exclusions">{copy.exclusions}</span></Note>
          <label className="flex items-start gap-2 text-body">
            <Checkbox checked={supported} onChange={event => setSupported(event.target.checked)} aria-describedby="sale-tax-scope" />
            <span>{copy.confirm}</span>
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="block min-w-0 flex-1 basis-56">
              <span id="sale-tax-filing" className="mb-1 block text-label">{copy.filing}</span>
              <Select className="w-full" aria-labelledby="sale-tax-filing" value={filing} onChange={event => setFiling(event.target.value)}>
                <option value="">{usCopy.chooseFiling}</option>
                <option value="single">{usCopy.filings.single}</option>
                <option value="mfj">{usCopy.filings.mfj}</option>
              </Select>
            </label>
            <label className="block min-w-0 flex-1 basis-56">
              <span className="mb-1 block text-label">{copy.fx}</span>
              <Input className="w-full" size="md" inputMode="decimal" aria-describedby="sale-tax-fx" value={krwPerUsd} onChange={event => setKrwPerUsd(event.target.value)} />
            </label>
          </div>
          <p id="sale-tax-fx" className="text-body text-ink-2">{copy.fxHint}</p>
          <p id="sale-tax-us" className="text-body text-ink-2">{copy.usHint} <TextLink href="/tax-planning/reserve">{copy.usWorksheet}</TextLink></p>
          <label className="block">
            <span id="sale-tax-authority" className="mb-1 block text-label">{copy.credit}</span>
            <Select
              className="w-full"
              aria-labelledby="sale-tax-authority"
              aria-describedby="sale-tax-credit"
              value={authority}
              onChange={event => {
                setAuthority(authorities.find(value => value === event.target.value) ?? 'unknown')
                setCredits({ baseline: emptyCredit, scenario: emptyCredit })
              }}
            >
              {authorities.map(value => <option key={value} value={value}>{copy.authorities[value]}</option>)}
            </Select>
          </label>
          <p id="sale-tax-credit" className="text-body text-ink-2">{copy.creditHint}</p>

          <div className="flex flex-wrap gap-4">
            {sides.map(key => (
              <fieldset key={key} className="min-w-0 flex-1 basis-72 space-y-3 rounded-md border border-line p-4">
                <legend className="px-1 text-body font-medium">{key === 'baseline' ? copy.before : copy.after}</legend>
                {reserveFields.map(field => (
                  <label key={field} className="block">
                    <span className="mb-1 block text-label">{usCopy.fields[field]}</span>
                    <Input
                      className="w-full tabular-nums"
                      size="md"
                      inputMode="decimal"
                      aria-describedby="sale-tax-us"
                      value={amounts[key].us[field]}
                      onChange={event => setAmounts({ ...amounts, [key]: { ...amounts[key], us: { ...amounts[key].us, [field]: event.target.value } } })}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1 block text-label">{copy.krGain}</span>
                  <Input
                    className="w-full tabular-nums"
                    size="md"
                    value={amounts[key].krwGain}
                    onChange={event => setAmounts({ ...amounts, [key]: { ...amounts[key], krwGain: event.target.value } })}
                  />
                </label>
                {(authority === 'us' || authority === 'kr') && (['eligibleTax', 'limit'] as const).map(field => (
                  <label key={field} className="block">
                    <span className="mb-1 block text-label">{copy.creditFields[authority][field]}</span>
                    <Input
                      className="w-full tabular-nums"
                      size="md"
                      inputMode={authority === 'us' ? 'decimal' : 'numeric'}
                      aria-describedby="sale-tax-credit"
                      value={credits[key][field]}
                      onChange={event => setCredits({ ...credits, [key]: { ...credits[key], [field]: event.target.value } })}
                    />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <Button type="submit" size="md">{copy.calculate}</Button>
        </form>
      </Card>

      <div role="status" aria-live="polite" className="space-y-5">
        {result?.status === 'unavailable' && <Note>{copy.errors[result.reason]}</Note>}
        {result?.status === 'ready' && (
          <>
            <Card title={copy.result}>
              <ResultTable language={language} rows={[
                [copy.rows.regular, 'USD', result.baseline.us.regular, result.scenario.us.regular, result.delta.us.regular],
                [copy.rows.niit, 'USD', result.baseline.us.niit, result.scenario.us.niit, result.delta.us.niit],
                [copy.rows.national, 'KRW', result.baseline.kr.national, result.scenario.kr.national, result.delta.kr.national],
                [copy.rows.local, 'KRW', result.baseline.kr.local, result.scenario.kr.local, result.delta.kr.local],
                [copy.rows.gross, 'KRW', result.baseline.grossKrw, result.scenario.grossKrw, result.delta.grossKrw],
              ]} />
            </Card>
            {result.credit.status === 'unavailable' ? <Note>{copy.errors[result.credit.reason]}</Note> : (
              <Card title={copy.netResult}>
                <ResultTable language={language} rows={[
                  [copy.rows.usCredit, 'USD', result.credit.baseline.usCreditCents, result.credit.scenario.usCreditCents, result.credit.delta.usCreditCents],
                  [copy.rows.krCredit, 'KRW', result.credit.baseline.krCreditWon, result.credit.scenario.krCreditWon, result.credit.delta.krCreditWon],
                  [copy.rows.usNet, 'USD', result.credit.baseline.usNetCents, result.credit.scenario.usNetCents, result.credit.delta.usNetCents],
                  [copy.rows.krNet, 'KRW', result.credit.baseline.krNetWon, result.credit.scenario.krNetWon, result.credit.delta.krNetWon],
                  [copy.rows.combined, 'KRW', result.credit.baseline.combinedKrw, result.credit.scenario.combinedKrw, result.credit.delta.combinedKrw],
                ]} />
              </Card>
            )}
          </>
        )}
      </div>

      <details>
        <summary className="min-h-6 cursor-pointer underline">{copy.sources}</summary>
        <ul className="mt-2 space-y-2 text-caption">
          <li><a className="underline" href="https://www.irs.gov/taxtopics/tc856">{copy.usReference}</a></li>
          <li><a className="underline" href="https://www.law.go.kr/LSW/lsInfoP.do?efYd=20270101&lsiSeq=280405">{copy.krReference}</a></li>
          <li><a className="underline" href="https://www.irs.gov/businesses/international-businesses/korea-tax-treaty-documents">{copy.treatyReference}</a></li>
        </ul>
      </details>
    </div>
  )
}
