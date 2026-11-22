import { CardRow } from '@/components/layout'
import { Card } from '@/components/ui'
import { getLanguage } from '@/lib/i18n-server'
import { getPageCopy } from '@/lib/ui-copy'

export default async function LoadingSpending() {
  const copy = getPageCopy('spending', await getLanguage())
  return (
    <div role="status" aria-busy="true">
      <p className="mb-4 text-body text-ink-2">{copy.loading}</p>
      <CardRow columns={2}>
        {['USD', 'KRW'].map(currency => <Card key={currency} title={currency}><div className="h-16 rounded-md bg-surface" aria-hidden /></Card>)}
      </CardRow>
    </div>
  )
}
