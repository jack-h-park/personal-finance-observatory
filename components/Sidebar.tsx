'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { AssetViewSwitcher, CurrencySwitcher } from '@/components/LanguageSwitcher'
import type { AssetView } from '@/lib/asset-view'
import type { DisplayCurrency } from '@/lib/currency'
import type { Language } from '@/lib/i18n'
import { getPageCopy } from '@/lib/ui-copy'
import { SidebarNav } from '@/components/SidebarNav'


export function Sidebar({
  language,
  displayCurrency,
  assetView,
  showAllAssets,
}: {
  language: Language
  displayCurrency: DisplayCurrency
  assetView: AssetView
  /** False when the database holds no supplementary data: Total Assets and Pension are then hidden. */
  showAllAssets: boolean
}) {
  const copy = getPageCopy('sidebar', language)
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // The reader's open/closed collapsible groups, keyed by label. Held here, not
  // keyed by pathname, so a group stays as the reader left it across navigation.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <header className="finance-local-header sticky z-30 flex items-center gap-3 border-b border-line bg-card px-4 py-2.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={copy.openMenu}
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {open ? <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}

      <aside
        id="app-sidebar"
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-card px-3 py-5 transition-transform duration-200 ease-out',
          'finance-local-sidebar lg:sticky lg:z-auto lg:w-56 lg:translate-x-0 lg:transition-none',
          open ? 'translate-x-0 shadow-elevated' : '-translate-x-full'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={copy.closeMenu}
          className="absolute right-1.5 top-1.5 inline-flex h-11 w-11 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* The JHP mark and the app name live only in the Studio app bar above
            (guidelines D14); the sidebar starts with its own navigation. */}
        <SidebarNav
          sections={copy.sections}
          pathname={pathname}
          showAllAssets={showAllAssets}
          openGroups={openGroups}
          onToggle={(group, isOpen) => setOpenGroups((prev) => (prev[group] === isOpen ? prev : { ...prev, [group]: isOpen }))}
          label={copy.navLabel}
        />

        <div className="mt-auto px-2 pt-6 text-micro leading-relaxed text-ink-3">
          <div className="mt-6 grid gap-2 px-1">
            <div>
              <div className="mb-1.5 px-0.5 text-micro font-medium text-ink-3">{copy.currency}</div>
              <CurrencySwitcher displayCurrency={displayCurrency} label={copy.currency} labels={copy.currencies} />
            </div>
            <div>
              <div className="mb-1.5 px-0.5 text-micro font-medium text-ink-3">{copy.assets}</div>
              <AssetViewSwitcher assetView={assetView} label={copy.assets} labels={copy.assetViews} />
            </div>
          </div>
          <div className="text-ink-2">{copy.readOnly}</div>
          <div className="mt-1.5">{copy.source}</div>
        </div>
      </aside>
    </>
  )
}
