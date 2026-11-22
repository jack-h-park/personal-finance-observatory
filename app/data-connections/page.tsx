import { PageHeader } from '@/components/PageHeader'
import { Tabs } from '@/components/Tabs'
import { Note, Table, TextLink } from '@/components/ui'
import { config } from '@/config'
import { readAccountConnectionScope, type ConnectionSource, type ConnectionStatus } from '@/lib/adapters/account-connection-scope'
import { fmtDate } from '@/lib/format'
import { getLanguage } from '@/lib/i18n-server'
import { routeMetadata, routeName } from '@/lib/page-names'
import { getPageCopy } from '@/lib/ui-copy'
import styles from './coverage.module.css'

const HREF = '/data-connections'
const COLUMNS = {
  us: ['snaptrade', 'simplefin', 'files'],
  kr: ['other', 'files'],
} as const satisfies Record<string, readonly ConnectionSource[]>

const STATUS_MARK: Record<ConnectionStatus, string> = {
  shadow: '✓',
  pilot: '✓',
  existing: '✓',
  limited: '◐',
  discovered: '◐',
  unreturned: '×',
  unknown: '',
  keep: '',
  required: '!',
}

export const generateMetadata = routeMetadata(HREF)

export default async function DataConnectionsPage({ searchParams }: {
  searchParams: Promise<{ country?: string | string[] }>
}) {
  const language = await getLanguage()
  const { country } = await searchParams
  const market = country === 'kr' ? 'kr' : 'us'
  const copy = getPageCopy('dataConnections', language)
  const scope = readAccountConnectionScope(config.finance.stateDir)
  const accounts = scope?.accounts.filter((account) => account.market === market) ?? []
  const columns = COLUMNS[market]

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} autoRefresh={false} />
      <Tabs label={copy.marketNav} current={market} items={[
        { key: 'us', href: HREF, label: copy.markets.us },
        { key: 'kr', href: `${HREF}?country=kr`, label: copy.markets.kr },
      ]} />

      <div className={styles.matrix}>
        {accounts.length ? (
          <Table className={styles.coverage}>
            <caption className="sr-only">{copy.comparison[market]}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.account}</th>
                {columns.map((source) => <th scope="col" key={source}>{copy.sources[source]}</th>)}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.key}>
                  <th scope="row">
                    {account.label[language]}
                    {market === 'us' && account.sources.other && (
                      <span className={styles.cellDetail}>
                        {copy.other} · {account.sources.other.detail?.[language] ?? copy.status[account.sources.other.status]}
                      </span>
                    )}
                  </th>
                  {columns.map((source) => {
                    const entry = account.sources[source]
                    const status = entry?.status ?? 'unknown'
                    const mark = STATUS_MARK[status]
                    return (
                      <td key={source} data-coverage={status}>
                        <span className={styles.status}>
                          {mark && <span aria-hidden="true" className={styles.mark}>{mark}</span>}
                          <span>{copy.status[status]}</span>
                        </span>
                        {entry?.detail && <span className={styles.cellDetail}>{entry.detail[language]}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className={styles.empty}>{copy.empty}</p>}
        <div className={styles.matrixNote}>
          <Note size="caption">{copy.notes[market]}</Note>
          {scope && accounts.length > 0 && <Note size="caption">{copy.reviewed(fmtDate(scope.reviewedOn, language))}</Note>}
        </div>
      </div>

      <details className={styles.notes}>
        <summary>{copy.detail}</summary>
        <p>{copy.boundary}</p>
      </details>

      <nav aria-label={copy.related} className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {(['/accounts', '/health', '/data-map'] as const).map((href) => (
          <TextLink key={href} href={href}>{routeName(href, language)}</TextLink>
        ))}
      </nav>
    </>
  )
}
