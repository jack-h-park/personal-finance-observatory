'use client'

import { useRouter } from 'next/navigation'
import { StudioAppBar } from '@/components/studio-ui/studio-app-bar'
import type { Language } from '@/lib/i18n'
import directory from '@/lib/studio-service-directory.json'

/**
 * The Studio app bar (nav kit 4). A client wrapper only because the root layout is
 * a server component and cannot pass the language handler. A language change
 * refreshes the server render; AutoRefresh and HelpPopover read the language off
 * the document, so it changes there too.
 */
export function StudioAppNavigation({ language: locale }: { language: Language }) {
  const router = useRouter()
  return (
    <StudioAppBar
      directory={directory}
      currentId="stock"
      locale={locale}
      language={locale}
      languages={['ko', 'en']}
      onLanguageChange={next => {
        document.documentElement.lang = next
        router.refresh()
      }}
    />
  )
}
