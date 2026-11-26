import { CrossBorderSaleTax } from '@/components/CrossBorderSaleTax'
import { PageHeader } from '@/components/PageHeader'
import { TextLink } from '@/components/ui'
import { getLanguage } from '@/lib/i18n-server'
import { routeSection } from '@/lib/page-names'
import { crossBorderSaleTax } from '@/lib/ui-copy/pages/crossBorderSaleTax'

export async function generateMetadata() {
  return { title: crossBorderSaleTax[await getLanguage()].title }
}

export default async function CrossBorderSaleTaxPage() {
  const language = await getLanguage()
  const copy = crossBorderSaleTax[language]
  return <>
    <PageHeader
      eyebrow={routeSection('/tax-planning', language)}
      title={copy.title}
      subtitle={copy.subtitle}
      autoRefresh={false}
      actions={<TextLink href="/tax-planning">{copy.back}</TextLink>}
    />
    <CrossBorderSaleTax language={language} />
  </>
}
