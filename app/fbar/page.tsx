import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { PageHeader } from '@/components/PageHeader'
import { Badge, Card, SectionHeading } from '@/components/ui'
import { CardRow } from '@/components/layout'
import { LinkChips } from '@/components/LinkChips'
import { getForeignAccountMaxima, portfolioToday } from '@/lib/adapters/portfolio-db'
import { formatKrw, formatUsd } from '@/lib/currency'
import { fmtDate, fmtNumber } from '@/lib/format'
import { lastCompleteYear, type ForeignAccountRow } from '@/lib/fbar'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeSection } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'
import { maskAccountLabel } from '@/lib/account-label'

export const dynamic = 'force-dynamic'
export const generateMetadata = routeMetadata('/fbar')

/** The first year the FBAR table offers: the Treasury rates file starts here. */
const FBAR_FIRST_YEAR = 2020

export default async function FbarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const language = await getLanguage()
  const copy = getPageCopy('fbar', language)
  // The last complete year unless ?year= names another offered year.
  const currentYear = Number(portfolioToday().slice(0, 4))
  const years = Array.from({ length: currentYear - FBAR_FIRST_YEAR + 1 }, (_, i) => FBAR_FIRST_YEAR + i)
  const requestedYear = Number(Array.isArray(params.year) ? params.year[0] : params.year)
  const year = years.includes(requestedYear) ? requestedYear : lastCompleteYear(portfolioToday())
  const fbar = getForeignAccountMaxima(year)
  const columns: DataTableColumn<ForeignAccountRow>[] = [
    { key: 'institution', label: copy.columns.institution, render: (row: ForeignAccountRow) => <span className="font-medium text-ink">{row.institution}</span> },
    { key: 'account', label: copy.columns.account, render: (row: ForeignAccountRow) => maskAccountLabel(row.account) },
    { key: 'kind', label: copy.columns.kind, priority: 'secondary', render: (row: ForeignAccountRow) => copy.kinds[row.kind] },
    {
      key: 'coverage',
      label: copy.columns.coverage,
      render: (row: ForeignAccountRow) => (
        <span>
          {copy.coverage[row.coverage]}
          {row.understated ? (
            <>
              {' '}
              <Badge tone="warning">{copy.understated}</Badge>
            </>
          ) : null}
          {row.cashIncluded === false ? <span className="block text-label text-ink-3">{copy.cashNotIncluded}</span> : null}
        </span>
      ),
    },
    { key: 'maxDate', label: copy.columns.maxDate, nowrap: true, render: (row: ForeignAccountRow) => <span className="tabular-nums">{fmtDate(row.maxDate, language)}</span> },
    {
      key: 'maxKrw',
      label: copy.columns.maxKrw,
      align: 'right',
      nowrap: true,
      render: (row: ForeignAccountRow) => <span className="tabular-nums">{row.maxKrw == null ? copy.none : formatKrw(row.maxKrw)}</span>,
    },
    ...(fbar.rate
      ? [
          {
            key: 'maxUsd',
            label: copy.columns.maxUsd,
            align: 'right' as const,
            nowrap: true,
            render: (row: ForeignAccountRow) => <span className="tabular-nums">{row.maxUsd == null ? copy.none : formatUsd(row.maxUsd)}</span>,
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        eyebrow={routeSection('/fbar', language)}
        title={copy.title}
        emphasis={copy.emphasis}
        subtitle={copy.subtitle}
      />
      <CardRow columns={1} spacing="above">
        <Card
          title={copy.card}
          action={
            <LinkChips
              as="nav"
              label={copy.yearLabel}
              ariaCurrent="page"
              items={years.map((year) => ({ key: String(year), href: `/fbar?year=${year}`, label: year }))}
              current={String(year)}
            />
          }
        >
          <div className="mb-3 flex flex-col gap-1 text-label leading-relaxed text-ink-3">
            <p className="font-medium text-ink-2">{copy.note}</p>
            <p>{copy.method}</p>
            <p>
              {fbar.rate
                ? copy.rate(fmtNumber(fbar.rate.krwPerUsd, 2), fmtDate(fbar.rate.date, language))
                : copy.noRate(year)}
            </p>
            <p>{copy.understatedNote}</p>
            <p>{copy.cashNote}</p>
            {fbar.rows.some((row) => row.maxKrw == null) ? (
              <p>{copy.unpriced(fbar.rows.filter((row) => row.maxKrw == null).map((row) => `${row.institution} ${maskAccountLabel(row.account)}`).join(', '))}</p>
            ) : null}
          </div>
          <DataTable caption={copy.card} rows={fbar.rows} getRowKey={(row: ForeignAccountRow) => row.id} emptyMessage={copy.empty(year)} columns={columns} />
          {fbar.rows.length ? (
            <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-body">
              <span className="text-ink-3">{copy.aggregate}</span>
              <span className="font-medium tabular-nums text-ink">{formatKrw(fbar.rows.reduce((sum, row) => sum + (row.maxKrw ?? 0), 0))}</span>
              {fbar.aggregateMaxUsd != null ? <span className="font-medium tabular-nums text-ink">{formatUsd(fbar.aggregateMaxUsd)}</span> : null}
            </div>
          ) : null}
          {fbar.cryptoRows.length ? (
            <section className="mt-5 border-t border-line-subtle pt-4">
              <SectionHeading level={3} size="sub" tone="muted" spacing="mb-2">{copy.cryptoTitle}</SectionHeading>
              <DataTable caption={copy.cryptoTitle} rows={fbar.cryptoRows} getRowKey={(row: ForeignAccountRow) => row.id} emptyMessage={copy.empty(year)} columns={columns} />
              <div className="mt-3 flex flex-wrap justify-end gap-x-6 gap-y-1 text-body">
                <span className="text-ink-3">{copy.cryptoSubtotal}</span>
                <span className="font-medium tabular-nums text-ink">{formatKrw(fbar.cryptoRows.reduce((sum, row) => sum + (row.maxKrw ?? 0), 0))}</span>
                {fbar.cryptoSubtotalMaxUsd != null ? <span className="font-medium tabular-nums text-ink">{formatUsd(fbar.cryptoSubtotalMaxUsd)}</span> : null}
              </div>
            </section>
          ) : null}
        </Card>
      </CardRow>
    </>
  )
}
