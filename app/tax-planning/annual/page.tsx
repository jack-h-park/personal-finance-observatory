import { PageHeader } from '@/components/PageHeader'
import { HypotheticalTaxPlanning } from '@/components/HypotheticalTaxPlanning'
import { getLanguage } from '@/lib/i18n-server'
import { getPageCopy } from '@/lib/ui-copy'
import { routeSection } from '@/lib/page-names'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return { title: getPageCopy('hypotheticalTax', await getLanguage()).title }
}

export default async function AnnualPlanningPage({ searchParams }: {
  searchParams: Promise<{ example?: string | string[] }>
}) {
  const language = await getLanguage()
  const copy = getPageCopy('hypotheticalTax', language)
  const params = await searchParams
  return <>
    <PageHeader eyebrow={routeSection('/tax-planning', language)} title={copy.title} subtitle={copy.subtitle} autoRefresh={false} />
    <HypotheticalTaxPlanning selection={params.example === undefined ? 'us-ordinary' : params.example} language={language} />
  </>
}
