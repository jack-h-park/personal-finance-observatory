import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/ui'
import { InvestmentTaxReserve } from '@/components/InvestmentTaxReserve'
import { getLanguage } from '@/lib/i18n-server'
import { routeSection } from '@/lib/page-names'
import { investmentTaxReserve } from '@/lib/ui-copy/pages/investmentTaxReserve'

export async function generateMetadata() {
  return { title: investmentTaxReserve[await getLanguage()].title }
}

export default async function TaxReservePage() {
  const language = await getLanguage()
  const copy = investmentTaxReserve[language]
  return <>
    <PageHeader eyebrow={routeSection('/tax-planning', language)} title={copy.title} subtitle={copy.subtitle} autoRefresh={false} />
    <InvestmentTaxReserve language={language} />
    <div className="mt-5"><TextLink href="/tax-planning">{copy.back}</TextLink></div>
  </>
}
