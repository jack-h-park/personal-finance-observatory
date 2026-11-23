import { DataTable } from '@/components/DataTable'
import { CardRow } from '@/components/layout'
import { Card, Note, TextLink } from '@/components/ui'
import type { Currency } from '@/lib/domain/spending-import'
import type { analyzeSpending, SpendingRank, SpendingViewRow } from '@/lib/domain/spending-view'
import { EMPTY_VALUE } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'
import Link from 'next/link'

const currencies = ['USD', 'KRW'] as const
const topCount = 5

type Analysis = ReturnType<typeof analyzeSpending>
type Amount = (minor: number, currency: Currency) => string

function MonthlyBars({ months, currency, missing, href, amount }: {
  months: Analysis['months']
  currency: Currency
  missing: string
  href: (month: string) => string
  amount: Amount
}) {
  const values = months.map(row => row[currency] ?? 0)
  const high = Math.max(0, ...values)
  const low = Math.min(0, ...values)
  const spread = high - low || 1
  const zero = high / spread * 100
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-caption font-medium">{currency}</h3>
      <div dir="rtl" className="overflow-x-auto px-1 pb-1">
        <div dir="ltr" className="flex" style={{ minWidth: months.length * 24 }}>
          {months.map((row, index) => {
            const value = row[currency]
            const label = row.month + ' · ' + (value === null ? missing : amount(value, currency))
            const tick = index === 0 || index === months.length - 1 || row.month.endsWith('-01') || index % 3 === 0
            const height = Math.abs(value ?? 0) / spread * 100
            const from = (value ?? 0) > 0 ? zero - height : zero
            return <Link key={row.month} href={href(row.month)} aria-label={label} title={label}
              className="min-w-6 flex-1 rounded-sm px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info">
              <span className="relative block h-24" aria-hidden="true">
                <span className="absolute inset-x-0 border-t border-line" style={{ top: zero + '%' }} />
                {value !== null ? <span className="absolute inset-x-1 min-h-px rounded-sm bg-info"
                  style={{ top: from + '%', height: height + '%' }} /> : null}
              </span>
              <span className="block h-5 text-center font-mono text-caption text-ink-2" aria-hidden="true">
                {tick ? row.month.slice(5) : null}
              </span>
            </Link>
          })}
        </div>
      </div>
    </div>
  )
}

export function SpendingAnalytics({ data, language, amount, count, monthHref, rankingHref, transactionHref }: {
  data: Analysis
  language: Language
  amount: Amount
  count: (value: number) => string
  monthHref: (month: string) => string
  rankingHref: (currency: Currency, filter: 'category' | 'merchant', name: string) => string
  transactionHref: (row: SpendingViewRow) => string
}) {
  const copy = getPageCopy('spending', language)
  const months = [...data.months].reverse()
  const ranking = (rows: SpendingRank[], kind: 'category' | 'merchant', currency: Currency, emptyMessage: string) => (
    rows.length ? <ol className="divide-y divide-line-subtle">
      {rows.slice(0, topCount).map(row => (
        <li key={row.name}>
          <Link href={rankingHref(currency, kind, row.name)}
            className="flex min-h-11 items-center justify-between gap-3 rounded-sm py-2 text-body hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info">
            <span className="min-w-0 break-words">
              {row.name} <span className="whitespace-nowrap text-caption text-ink-2">· {count(row.count)}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums">{amount(row.amountMinor, currency)}</span>
          </Link>
        </li>
      ))}
    </ol> : <Note size="caption">{emptyMessage}</Note>
  )
  const disclosureClass = 'min-h-11 cursor-pointer rounded-sm py-3 text-caption text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info'

  return (
    <>
      <Card title={copy.monthlyTrend} id="spending-monthly">
        <CardRow spacing="none">
          {currencies.map(currency => <MonthlyBars key={currency} months={months} currency={currency}
            href={monthHref} amount={amount} missing={copy.chartMissing} />)}
        </CardRow>
        <Note spacing="above-3" size="caption">{copy.chartHint}</Note>
        <details>
          <summary className={disclosureClass}>{copy.exactMonths}</summary>
          <DataTable rows={data.months} caption={copy.monthlyTrend} minWidth="16rem" getRowKey={row => row.month}
            columns={[
              { key: 'month', label: copy.month, render: row => <TextLink href={monthHref(row.month)}>{row.month}</TextLink> },
              ...currencies.map(currency => ({
                key: currency, label: currency, align: 'right' as const, nowrap: true,
                render: (row: Analysis['months'][number]) => row[currency] === null ? EMPTY_VALUE : amount(row[currency], currency),
              })),
            ]}
          />
        </details>
      </Card>

      <CardRow spacing="none">
        <Card title={copy.categories} id="spending-categories" info={copy.rankingHint}>
          <div className="space-y-5">
            {currencies.map(currency => {
              const { categories, categorySources, largest, uncategorized } = data[currency]
              return <section key={currency}>
                <h3 className="text-caption font-medium">{currency}</h3>
                {ranking(categories, 'category', currency, largest.length ? copy.noCategories : copy.noPurchases)}
                {uncategorized.count ? <p className="flex flex-wrap justify-between gap-2 py-2 text-caption text-ink-2">
                  <span>{copy.missingCategory(count(uncategorized.count))}</span>
                  <span className="font-mono tabular-nums">{amount(uncategorized.amountMinor, currency)}</span>
                </p> : null}
                {categories.length ? <details>
                  <summary className={disclosureClass}>{copy.source}</summary>
                  <Note size="caption">{copy.categoryEvidence(count(categorySources.issuer), count(categorySources.notion), count(categorySources.banksalad))}</Note>
                </details> : null}
              </section>
            })}
          </div>
        </Card>

        <Card title={copy.largeSpending} id="spending-large" info={copy.rankingHint}>
          <div className="space-y-5">
            {currencies.map(currency => (
              <section key={currency}>
                <h3 className="text-caption font-medium">{currency} · {copy.merchantTotals}</h3>
                {ranking(data[currency].merchants, 'merchant', currency, copy.noPurchases)}
                {data[currency].largest.length ? <details>
                  <summary className={disclosureClass}>{copy.largestPurchases}</summary>
                  <ol className="divide-y divide-line-subtle">
                    {data[currency].largest.slice(0, topCount).map(row => (
                      <li key={row.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-body">
                        <div className="min-w-0 break-words">
                          <TextLink href={transactionHref(row)}>{row.merchantLabel ?? row.description}</TextLink>
                          <div className="text-caption text-ink-2">{row.activityDate}</div>
                        </div>
                        <span className="shrink-0 font-mono tabular-nums">{amount(-row.amountMinor, currency)}</span>
                      </li>
                    ))}
                  </ol>
                </details> : null}
              </section>
            ))}
          </div>
        </Card>
      </CardRow>
    </>
  )
}
