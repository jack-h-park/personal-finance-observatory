'use client'

import { useState } from 'react'
import { Input } from '@/components/form'
import { Button, Card, Note } from '@/components/ui'
import { estimateKrOverseasStockTax, KR_OVERSEAS_STOCK_RULES, krStockTaxRows } from '@/lib/domain/taxes/kr-overseas-stock-tax'
import { localeFor } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { investmentTaxReserve } from '@/lib/ui-copy/pages/investmentTaxReserve'
import { krOverseasStockTax } from '@/lib/ui-copy/pages/krOverseasStockTax'

const scenarios = ['baseline', 'scenario'] as const

export function KrOverseasStockTax({
  language,
  comparison,
}: {
  language: Language
  comparison?: { baseline: string; scenario: string; result: string }
}) {
  const copy = krOverseasStockTax[language]
  const labels = comparison ?? copy
  const [amounts, setAmounts] = useState({ baseline: '', scenario: '' })
  const [result, setResult] = useState<ReturnType<typeof estimateKrOverseasStockTax> | null>(null)
  const locale = localeFor(language)
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW' })
  const signedMoney = new Intl.NumberFormat(locale, { style: 'currency', currency: 'KRW', signDisplay: 'exceptZero' })

  return (
    <div className="space-y-5">
      <Card title={copy.inputs}>
        <div className="space-y-4 p-4">
          <p id="kr-stock-tax-assumption" className="text-body text-ink-2">{copy.assumption}</p>
          <Note>{investmentTaxReserve[language].privacy}</Note>
          <form
            autoComplete="off"
            aria-describedby="kr-stock-tax-assumption"
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              setResult(estimateKrOverseasStockTax(amounts.baseline, amounts.scenario))
            }}
          >
            <p id="kr-stock-tax-hint" className="text-body text-ink-2">{copy.hint}</p>
            <div className="flex flex-wrap gap-4">
              {scenarios.map(key => (
                <label key={key} className="block min-w-0 flex-1 basis-64">
                  <span className="mb-1 block text-label">{labels[key]}</span>
                  <Input
                    className="w-full tabular-nums"
                    aria-describedby="kr-stock-tax-hint"
                    size="md"
                    value={amounts[key]}
                    onChange={event => {
                      setAmounts({ ...amounts, [key]: event.target.value })
                      setResult(null)
                    }}
                  />
                </label>
              ))}
            </div>
            <Button type="submit" size="md">{copy.calculate}</Button>
          </form>
        </div>
      </Card>
      <div role="status" aria-live="polite">
        {result?.status === 'unavailable' ? <Note>{copy.invalid}</Note> : null}
        {result?.status === 'ready' ? (
          <Card title={labels.result}>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-body">
                <thead>
                  <tr>
                    <th scope="col" className="text-left">{copy.component}</th>
                    <th scope="col" className="text-right">{labels.baseline}</th>
                    <th scope="col" className="text-right">{labels.scenario}</th>
                    <th scope="col" className="text-right">{copy.change}</th>
                  </tr>
                </thead>
                <tbody>
                  {krStockTaxRows.map(key => (
                    <tr key={key} className="border-t border-line-subtle">
                      <th scope="row" className="py-2 text-left font-medium">{copy.rows[key]}</th>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums">{money.format(result.baseline[key])}</td>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums">{money.format(result.scenario[key])}</td>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums">{signedMoney.format(result.delta[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
      <Note>{copy.rule}</Note>
      <p className="text-body text-ink-2">{copy.exclusions}</p>
      <details>
        <summary className="min-h-6 cursor-pointer underline">{copy.rules}</summary>
        <ul className="mt-2 space-y-2 text-caption">
          {(['national', 'local', 'guidance'] as const).map(key => (
            <li key={key}><a className="underline" href={KR_OVERSEAS_STOCK_RULES.sources[key]}>{copy.sources[key]}</a></li>
          ))}
        </ul>
      </details>
    </div>
  )
}
