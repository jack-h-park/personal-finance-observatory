import { DataTable } from '@/components/DataTable'
import { StackedBarChart } from '@/components/charts'
import { CardRow } from '@/components/layout'
import { Card, Note, TextLink } from '@/components/ui'
import type { Currency } from '@/lib/domain/spending-import'
import type { analyzeSpending, SpendingRank, SpendingViewRow } from '@/lib/domain/spending-view'
import { EMPTY_VALUE } from '@/lib/format'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'
import { marketColor, spendingShareColor } from '@/lib/palette'
import { categoryShareItems, spendingCategoryName } from '@/lib/spending-categories'
import { ShareSummary } from '@/components/ShareSummary'
import Link from 'next/link'

const currencies = ['USD', 'KRW'] as const
const topCount = 5

type Analysis = ReturnType<typeof analyzeSpending>
type Amount = (minor: number, currency: Currency) => string

export function SpendingAnalytics({ data, language, currentMonth, amount, count, monthHref, rankingHref, transactionHref }: {
  data: Analysis
  language: Language
  /** 'YYYY-MM' in the app's time zone: that bar is drawn as a month in progress. */
  currentMonth: string
  amount: Amount
  count: (value: number) => string
  monthHref: (month: string) => string
  rankingHref: (filter: 'category' | 'merchant', name: string) => string
  transactionHref: (row: SpendingViewRow) => string
}) {
  const copy = getPageCopy('spending', language)
  const months = [...data.combined.months].reverse()
  const shares = categoryShareItems(data.combined, 6)
  const ranking = (rows: SpendingRank[], kind: 'category' | 'merchant', emptyMessage: string) => (
    rows.length ? <ol className="divide-y divide-line-subtle">
      {rows.slice(0, topCount).map(row => (
        <li key={row.name}>
          <Link href={rankingHref(kind, row.name)}
            className="flex min-h-11 items-center justify-between gap-3 rounded-sm py-2 text-body hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info">
            <span className="min-w-0 break-words">
              {row.name} <span className="whitespace-nowrap text-caption text-ink-2">· {count(row.count)}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums">{amount(row.amountMinor, 'KRW')}</span>
          </Link>
        </li>
      ))}
    </ol> : <Note size="caption">{emptyMessage}</Note>
  )
  const disclosureClass = 'min-h-11 cursor-pointer rounded-sm py-3 text-caption text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info'

  return (
    <>
      <Card title={copy.monthlyTrend} id="spending-monthly">
        <StackedBarChart
          data={months.map(row => ({
            period: row.month.slice(2),
            fromKrw: row.fromKrw,
            fromUsd: row.fromUsd,
            partial: row.month === currentMonth,
            // A bar opens that month's transactions, whichever currency was clicked.
            links: { fromKrw: monthHref(row.month), fromUsd: monthHref(row.month) },
          }))}
          xKey="period"
          series={[
            { key: 'fromKrw', label: copy.seriesKrw, color: marketColor('KRW') },
            { key: 'fromUsd', label: copy.seriesUsd, color: marketColor('USD') },
          ]}
          linkKey="links"
          partial={{ key: 'partial', label: copy.partialLabel }}
          toggleable
          height={240}
          yAxisLabel={copy.axisKrw}
          unit={{ kind: 'money', currency: 'KRW' }}
          language={language}
          emptyMessage={copy.chartMissing}
        />
        <Note spacing="above-3" size="caption">{copy.chartHint}</Note>
        <details>
          <summary className={disclosureClass}>{copy.exactMonths}</summary>
          <DataTable rows={data.months.map((row, index) => ({ ...row, combined: data.combined.months[index].amount, missingFx: data.combined.months[index].missingFx }))} caption={copy.monthlyTrend} minWidth="16rem" getRowKey={row => row.month}
            columns={[
              { key: 'month', label: copy.month, render: row => <TextLink href={monthHref(row.month)}>{row.month}</TextLink> },
              { key: 'combined', label: copy.convertedKrw, align: 'right', nowrap: true,
                render: row => row.combined === null ? EMPTY_VALUE : amount(row.combined, 'KRW') },
              { key: 'missingFx', label: copy.missingFxColumn, align: 'right' as const, nowrap: true,
                render: (row: Analysis['months'][number] & { missingFx: number }) => row.missingFx ? count(row.missingFx) : EMPTY_VALUE },
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
          {shares.length ? (
            <ShareSummary
              title={copy.categoryShareTitle}
              items={shares.map((item, index) => ({
                key: item.key,
                color: spendingShareColor(item.key, index),
                pct: item.pct,
                label: item.key === 'rest' ? copy.categoryRest
                  : item.key === 'uncategorized' ? copy.uncategorized
                  : <TextLink href={rankingHref('category', item.key)}>{spendingCategoryName(item.key, copy.categoryNames)}</TextLink>,
                detail: `${amount(item.amountMinor, 'KRW')} · ${count(item.count)}`,
              }))}
            />
          ) : <Note size="caption">{copy.noPurchases}</Note>}
          {data.combined.categories.length ? <details>
            <summary className={disclosureClass}>{copy.source}</summary>
            <Note size="caption">{copy.categoryEvidence(count(data.combined.categorySources.issuer),
              count(data.combined.categorySources.notion), count(data.combined.categorySources.banksalad))}</Note>
          </details> : null}
        </Card>

        <Card title={copy.merchants} id="spending-merchants" info={copy.rankingHint}>
          {ranking(data.combined.merchants, 'merchant', copy.noPurchases)}
          {data.combined.largest.length ? <details>
            <summary className={disclosureClass}>{copy.largestPurchases}</summary>
            <ol className="divide-y divide-line-subtle">
              {data.combined.largest.slice(0, topCount).map(row => (
                <li key={row.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-body">
                  <div className="min-w-0 break-words">
                    <TextLink href={transactionHref(row)}>{row.merchantLabel ?? row.description}</TextLink>
                    <div className="text-caption text-ink-2">{row.activityDate} · {amount(-row.amountMinor, row.currency)}</div>
                  </div>
                  <span className="shrink-0 font-mono tabular-nums">{amount(-data.combined.purchaseKrw.get(row.id)!, 'KRW')}</span>
                </li>
              ))}
            </ol>
          </details> : null}
        </Card>
      </CardRow>
    </>
  )
}
