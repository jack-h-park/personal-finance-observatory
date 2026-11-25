import { KrOverseasStockTax } from '@/components/KrOverseasStockTax'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/ui'
import { getLanguage } from '@/lib/i18n-server'
import { routeSection } from '@/lib/page-names'
import { krOverseasStockTax } from '@/lib/ui-copy/pages/krOverseasStockTax'

export async function generateMetadata() {
  return { title: krOverseasStockTax[await getLanguage()].title }
}

export default async function KrOverseasStockTaxPage() {
  const language = await getLanguage()
  const copy = krOverseasStockTax[language]

  return <>
    <PageHeader eyebrow={routeSection('/tax-planning', language)} title={copy.title} subtitle={copy.subtitle} autoRefresh={false} />
    <KrOverseasStockTax language={language} />
    <div className="mt-5"><TextLink href="/tax-planning">{copy.back}</TextLink></div>
  </>
}
