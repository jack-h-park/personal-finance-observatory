import { MetricField } from '@/components/ui'
import { compactAmount } from '@/lib/chart-format'
import { EMPTY_VALUE, fmtDate, fmtPct, fmtSigned } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { signClass, signTone } from '@/lib/tone'
import type { ClassKey, InvestmentResult, TotalAssetsChange } from '@/lib/total-assets-change'

export type TotalAssetsChangeLabels = {
  changeSince: (date: string) => string
  changeAddedClasses: (labels: string) => string
  changeUnavailable: string
  assetClasses: Record<ClassKey, string>
  investmentResult: string
  investmentParts: (unrealized: string, realized: string) => string
}

/**
 * One change in total assets: the signed amount, its percentage and base date,
 * and the two classes that moved most. The Overview hero and /net-worth render
 * the same field, so the two pages cannot disagree on how a change reads.
 * Unavailable is not zero: with no snapshot that old the field says so.
 */
export function TotalAssetsChangeField({
  label,
  change,
  labels,
  investment,
  money,
  language,
}: {
  label: string
  change: TotalAssetsChange | null
  /** What investing earned over the same period; separates returns from money moved in. Absent or null: no line. */
  investment?: InvestmentResult | null
  labels: TotalAssetsChangeLabels
  /** Formats a KRW amount in the display currency. */
  money: (krw: number) => string
  language: Language
}) {
  const short = (krw: number) => fmtSigned(krw, (v) => compactAmount(v, { kind: 'money', currency: 'KRW' }, language))
  return (
    <MetricField
      label={label}
      value={change ? fmtSigned(change.change, money) : EMPTY_VALUE}
      tone={change ? signTone(change.change) : 'neutral'}
      hint={
        change ? (
          <>
            {[
              change.pct == null ? null : fmtPct(change.pct, { digits: 1, signed: true }),
              labels.changeSince(fmtDate(change.baseDate, language)),
              change.addedClasses.length ? labels.changeAddedClasses(change.addedClasses.map((key) => labels.assetClasses[key]).join(', ')) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {change.byClass.length ? (
              <span className="mt-1 block">
                {change.byClass.slice(0, 2).map((driver, index) => (
                  <span key={driver.key}>
                    {index ? ' · ' : null}
                    {labels.assetClasses[driver.key]}{' '}
                    <span className={signClass(driver.change)}>{short(driver.change)}</span>
                  </span>
                ))}
              </span>
            ) : null}
            {investment ? (
              <span className="mt-1 block">
                {labels.investmentResult} <span className={signClass(investment.total)}>{short(investment.total)}</span>{' '}
                <span className="text-ink-3">({labels.investmentParts(short(investment.unrealized), short(investment.realized))})</span>
              </span>
            ) : null}
          </>
        ) : (
          labels.changeUnavailable
        )
      }
    />
  )
}
