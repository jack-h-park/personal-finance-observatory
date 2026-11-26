'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Note } from '@/components/ui'
import { Input, Select } from '@/components/form'
import { STANDALONE_ESTIMATE_YEAR, type InvestmentTaxYear } from '@/lib/domain/taxes/investment-tax-year'
import type { Language } from '@/lib/i18n'
import { localeFor } from '@/lib/format'
import { investmentTaxReserve } from '@/lib/ui-copy/pages/investmentTaxReserve'
import { estimateInvestmentTaxReserve, reserveFields, RESERVE_RULES, scenarioWithRecordedGains } from '@/lib/domain/taxes/investment-tax-reserve'

const emptyScenario = { taxable: '', preferential: '', magi: '', nii: '' }
const components = ['regular', 'niit', 'total'] as const

export function InvestmentTaxReserve({
  language,
  year = STANDALONE_ESTIMATE_YEAR,
  comparison,
  recorded,
  proposed,
}: {
  language: Language
  year?: InvestmentTaxYear
  recorded?: { shortUsd: number; longUsd: number }
  proposed?: { shortUsd: number; longUsd: number }
  comparison?: { baseline: string; scenario: string; result: string }
}) {
  const copy = investmentTaxReserve[language]
  const labels = comparison ?? copy
  const sources = [RESERVE_RULES.revenueProcedure[year], RESERVE_RULES.capitalGainLaw, RESERVE_RULES.niitGuide]
  const [profile, setProfile] = useState('')
  const [filing, setFiling] = useState('')
  const [baseline, setBaseline] = useState(emptyScenario)
  const [scenario, setScenario] = useState(emptyScenario)
  const [adjustments, setAdjustments] = useState({ short: '', long: '' })
  const [result, setResult] = useState<ReturnType<typeof estimateInvestmentTaxReserve> | 'recorded' | null>(null)
  useEffect(() => setResult(null), [recorded, proposed])
  const locale = localeFor(language)
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' })
  const change = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', signDisplay: 'exceptZero' })

  return (
    <div className="space-y-5">
      <Card title={copy.profile}>
        <div className="space-y-4 p-4">
          <p className="text-body text-ink-2" id="reserve-scope">{proposed ? copy.saleScope : recorded ? copy.recordedScope : copy.scope}</p>
          <p className="text-body text-ink-2" id="reserve-exclusions">{copy.exclusion}</p>
          <Note>{recorded ? copy.recordedPrivacy : copy.privacy}</Note>
          <form
            autoComplete="off"
            className="space-y-4"
            aria-describedby="reserve-scope reserve-exclusions"
            onSubmit={event => {
              event.preventDefault()
              const before = recorded && proposed ? scenarioWithRecordedGains(baseline, recorded, adjustments) : baseline
              const after = recorded ? scenarioWithRecordedGains(baseline, {
                shortUsd: recorded.shortUsd + (proposed?.shortUsd ?? 0),
                longUsd: recorded.longUsd + (proposed?.longUsd ?? 0),
              }, adjustments) : scenario
              setResult(before && after ? estimateInvestmentTaxReserve({ profile, filing, baseline: before, scenario: after, year }) : 'recorded')
            }}
          >
            <div className="flex flex-wrap gap-4">
              <label className="block min-w-0 flex-1 basis-64">
                <span className="mb-2 block text-label">{copy.profile}</span>
                <Select className="w-full" value={profile} onChange={event => { setProfile(event.target.value); setResult(null) }}>
                  <option value="">{copy.profileUnknown}</option>
                  <option value="supported">{recorded ? copy.recordedProfile : copy.profileSupported}</option>
                </Select>
              </label>
              <label className="block min-w-0 flex-1 basis-48">
                <span className="mb-2 block text-label">{copy.filing}</span>
                <Select className="w-full" value={filing} onChange={event => { setFiling(event.target.value); setResult(null) }}>
                  <option value="">{copy.chooseFiling}</option>
                  <option value="single">{copy.filings.single}</option>
                  <option value="mfj">{copy.filings.mfj}</option>
                </Select>
              </label>
            </div>
            <Note>{copy.amountHint}</Note>
            <div className="flex flex-wrap gap-4">
              {([
                { key: 'baseline', amounts: baseline, setAmounts: setBaseline },
                { key: 'scenario', amounts: scenario, setAmounts: setScenario },
              ] as const).filter(({ key }) => !recorded || key === 'baseline').map(({ key, amounts, setAmounts }) => (
                <fieldset key={key} className="min-w-0 flex-1 basis-72 space-y-3 rounded-md border border-line p-4">
                  <legend className="px-1 text-body font-medium">{proposed ? copy.beforeCapital : labels[key]}</legend>
                  {reserveFields.map(field => (
                    <label key={field} className="block">
                      <span className="mb-1 block text-label">{copy.fields[field]}</span>
                      <Input
                        className="w-full tabular-nums"
                        inputMode="decimal"
                        maxLength={18}
                        size="md"
                        value={amounts[field]}
                        aria-describedby={field === 'preferential' ? 'reserve-preferential' : undefined}
                        onChange={event => {
                          setAmounts({ ...amounts, [field]: event.target.value })
                          setResult(null)
                        }}
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {recorded && (
              <fieldset className="space-y-3 rounded-md border border-line p-4">
                <legend className="px-1 text-body font-medium">{copy.adjustments}</legend>
                <p id="reserve-adjustments" className="text-body text-ink-2">{copy.recordedAdjustments}</p>
                <div className="flex flex-wrap gap-4">
                  {(['short', 'long'] as const).map(key => (
                    <label key={key} className="block min-w-0 flex-1 basis-48">
                      <span className="mb-1 block text-label">{copy.adjustmentFields[key]}</span>
                      <Input
                        className="w-full tabular-nums"
                        maxLength={18}
                        inputMode="text"
                        value={adjustments[key]}
                        aria-describedby="reserve-adjustments"
                        onChange={event => { setAdjustments({ ...adjustments, [key]: event.target.value }); setResult(null) }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div id="reserve-preferential"><Note>{copy.preferentialHint}</Note></div>
            <Button type="submit" size="md">{copy.calculate}</Button>
          </form>
        </div>
      </Card>
      <div role="status" aria-live="polite">
        {result === 'recorded' ? <Note>{copy.recordedInvalid}</Note> : null}
        {result && result !== 'recorded' && result.status === 'unavailable' ? <Note>{copy.unavailable[result.reason]}</Note> : null}
        {result && result !== 'recorded' && result.status === 'ready' ? (
          <Card title={labels.result}>
            <div className="overflow-x-auto p-4">
              <table className="w-full text-body">
                <thead>
                  <tr>
                    <th scope="col" className="text-left">{copy.component}</th>
                    <th scope="col" className="text-right">{copy.baselineShort}</th>
                    <th scope="col" className="text-right">{copy.scenarioShort}</th>
                    <th scope="col" className="text-right">{copy.difference}</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map(key => (
                    <tr key={key} className="border-t border-line-subtle">
                      <th scope="row" className="py-2 text-left font-medium">{copy.components[key]}</th>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums">{money.format(Number(result.baseline[key]) / 100)}</td>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums">{money.format(Number(result.scenario[key]) / 100)}</td>
                      <td className="whitespace-nowrap px-1 text-right tabular-nums">{change.format(Number(result.delta[key]) / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
      <details>
        <summary className="min-h-6 cursor-pointer underline">{copy.rules}</summary>
        <ul className="mt-2 space-y-2 text-caption">
          {sources.map((url, index) => <li key={url}><a className="underline" href={url}>{copy.sources(year)[index]}</a></li>)}
        </ul>
      </details>
    </div>
  )
}
