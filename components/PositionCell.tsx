import Link from 'next/link'
import { Badge, marketTone } from '@/components/ui'
import { maskAccountLabel } from '@/lib/account-label'
import { positionHref } from '@/lib/position-url'

const TICKER_LINK = 'font-mono text-caption font-medium text-info hover:underline'

/**
 * A position in a table row: the market badge and the ticker linking to the
 * position page, with the name under them (`stacked`), or the ticker link alone
 * for a table that shows the market in its own column (`ticker`).
 */
export function PositionCell({
  market,
  ticker,
  name,
  showMarket = true,
  layout = 'stacked',
}: {
  market: string
  ticker: string
  name?: string | null
  showMarket?: boolean
  layout?: 'stacked' | 'ticker'
}) {
  const link = (
    <Link href={positionHref(market, ticker)} className={TICKER_LINK}>
      {ticker}
    </Link>
  )
  if (layout === 'ticker') return link
  return (
    <div className="min-w-[14rem]">
      <div className="flex items-center gap-2">
        {showMarket ? <Badge tone={marketTone(market)}>{market}</Badge> : null}
        {link}
      </div>
      <div className="mt-1 max-w-[20rem] truncate text-caption font-medium text-ink">{name}</div>
    </div>
  )
}

/**
 * Broker over account in one table cell, each on a single line. The title
 * carries the masked label, never the stored account value.
 */
export function AccountCell({ brokerage, account }: { brokerage: string | null; account: string | null }) {
  const masked = maskAccountLabel(account)
  const title = brokerage && masked ? `${brokerage} · ${masked}` : brokerage || masked
  return (
    <div className="min-w-0" title={title}>
      {brokerage ? <div className="max-w-[14rem] truncate text-caption font-medium text-ink">{brokerage}</div> : null}
      {masked ? <div className="max-w-[14rem] truncate text-caption text-ink-3">{masked}</div> : null}
    </div>
  )
}
