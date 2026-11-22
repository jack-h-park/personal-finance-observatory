import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { geistSans, geistMono } from '@/lib/fonts'
import '@/styles/jhp-app-theme.css'
import '@/styles/jp-theme.css'
import '@/styles/globals.css'
import '@/styles/jhp-nav.css'
import { LanguageProvider } from '@/components/LanguageProvider'
import { StudioAppNavigation } from '@/components/StudioAppNavigation'
import { Sidebar } from '@/components/Sidebar'
import { EntranceMotion } from '@/components/EntranceMotion'
import { DevCopyBadge } from '@/components/DevCopyBadge'
import { PrivateAccessNotice } from '@/components/PrivateAccessNotice'
import { config } from '@/config'
import { getLanguage, getThemeAttribute } from '@/lib/i18n-server'
import { getAssetView } from '@/lib/asset-view-server'
import { getCurrencyPreferences } from '@/lib/currency-server'
import { APP_NAME } from '@/lib/page-names'
import { getUiCopy, UI_COPY_BY_LANG } from '@/lib/ui-copy'
import { hasSupplementaryAssets } from '@/lib/adapters/portfolio-db'
import { spendingPilotEnabled } from '@/lib/adapters/spending-view'

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  // Static metadata has no request, so it stays English by design.
  description: UI_COPY_BY_LANG.en.common.appDescription,
  applicationName: APP_NAME,
  // The app's own icon set (generated with the other private Studio surfaces'
  // icons from one construction: the JHP mark's tile with a per-app glyph).
  // Regenerate it at its source and recopy rather than editing these files.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await getLanguage()
  const theme = await getThemeAttribute()
  const currencyPreferences = await getCurrencyPreferences()
  const assetView = await getAssetView()
  // Never let a DB hiccup in this optional check take down every page.
  let showAllAssets = false
  try {
    showAllAssets = hasSupplementaryAssets()
  } catch {
    showAllAssets = false
  }
  const skipLabel = getUiCopy(language).common.skipToContent

  return (
    // data-jp scopes jp-theme.css. data-theme is the shared theme preference (guidelines
    // D15): light, dark, or absent to follow the OS. data-jhp-shell="workspace" lines the
    // Studio app bar up with the sidebar (D13; --jhp-sidebar-pad in globals.css).
    <html
      lang={language}
      data-jp=""
      data-theme={theme}
      data-jhp-shell="workspace"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <a href="#main-content" className="sr-only z-[100] rounded-sm bg-card px-4 py-3 text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-info">
          {skipLabel}
        </a>
        <EntranceMotion />
        <LanguageProvider language={language} currencyPreferences={currencyPreferences}>
          <StudioAppNavigation language={language} />
          <div className="finance-shell flex flex-col lg:flex-row">
            <Sidebar language={language} displayCurrency={currencyPreferences.displayCurrency} assetView={assetView}
              showAllAssets={showAllAssets} showSpendingPilot={spendingPilotEnabled()} />
            {/*
              max-md:overflow-x-clip stops the page itself scrolling sideways on a
              narrow viewport. /tax-settings could be dragged 234px to the right onto blank
              space, because a table with a 48rem min-width still adds to the
              document's scroll width even though the card around it scrolls that
              table on its own. `clip` rather than `hidden`: hidden would make this
              a scroll container and break the sticky table headers inside it.
              Scoped below `md` because that is where the help popovers are
              position:fixed — above it they are absolute and would be cut off.
            */}
            <main id="main-content" tabIndex={-1} className="jp-stagger min-w-0 flex-1 px-4 py-5 max-md:overflow-x-clip lg:px-8 lg:py-6">
              <DevCopyBadge language={language} />
              <PrivateAccessNotice language={language} mode={config.finance.mode} notice={process.env.FINANCE_ACCESS_NOTICE} />
              {children}
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  )
}
