// Canonical source: workspace-governance/docs/ux/kit/react/studio-app-bar.tsx
// The whole Studio app bar for a React app (nav kit 4): breadcrumb (guidelines
// D17), display settings button (D15, D16) and the app switcher, with the markup
// and classes jhp-nav.js produces, so jhp-nav.css styles it. Copy to
// components/studio-ui/ beside display-settings.tsx; preferences.ts goes to
// lib/studio-ui/. Pass the app's bundled copy of service-directory.json.
// Owner-only locks are not rendered: use this in owner-only apps, or render the
// static markup with jhp-nav.js's markOwnerEntriesLocked() on family pages.
'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { DisplaySettings, useThemePreference } from './display-settings'
import { APP_BAR_COPY, type LanguagePreference, type ThemePreference } from '@/lib/studio-ui/preferences'

type Names = { ko: string; en: string }
export type StudioDirectory = {
  version: number
  groups: Record<string, Names>
  services: { id: string; name: Names; url: string; group: string }[]
}

const LAUNCHER = 'https://www.jackpark.me'

// document.title and the path as an external store: Next and other routers change
// both on client navigation, and the breadcrumb follows without an effect.
function subscribeLocation(onChange: () => void): () => void {
  const title = document.querySelector('title')
  const observer = new MutationObserver(onChange)
  if (title) observer.observe(title, { childList: true, characterData: true, subtree: true })
  observer.observe(document.head, { childList: true })
  window.addEventListener('popstate', onChange)
  return () => {
    observer.disconnect()
    window.removeEventListener('popstate', onChange)
  }
}
const readTitle = () => document.title
const readPath = () => window.location.pathname

function ThemeIcon({ theme }: { theme: ThemePreference }) {
  const d = {
    light: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
    dark: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
    system: 'M3 4h18v12H3zM8 20h8M12 16v4',
  }[theme]
  return (
    <svg className="jhp-nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  )
}

/**
 * `currentId` is this app's id in the directory. `page` names the current page for
 * the breadcrumb; without it document.title minus its last " · <App>" is used
 * (guidelines §3), and nothing is shown at `homeHref`. `languages`,
 * `onLanguageChange` and `onThemeChange` are passed to DisplaySettings.
 */
export function StudioAppBar({
  directory,
  currentId,
  locale,
  homeHref = '/',
  page,
  languages = [],
  language,
  onLanguageChange,
  onThemeChange,
  markSrc = '/brand/jhp-mark.png',
  children,
}: {
  directory: StudioDirectory
  currentId: string
  locale: LanguagePreference
  homeHref?: string
  page?: string
  languages?: LanguagePreference[]
  language?: LanguagePreference
  onLanguageChange?: (language: LanguagePreference) => void
  onThemeChange?: (theme: ThemePreference) => void
  /** Where this app serves the JHP mark; architecture.md lets an app choose. */
  markSrc?: string
  /** Extra panel content after the groups, if an app needs it. */
  children?: ReactNode
}) {
  const copy = APP_BAR_COPY[locale]
  const app = directory.services.find(service => service.id === currentId)
  const appName = app?.name[locale] ?? copy.landmark
  const [open, setOpen] = useState<'apps' | 'display' | null>(null)
  const nav = useRef<HTMLElement>(null)
  const appsButton = useRef<HTMLButtonElement>(null)
  const displayButton = useRef<HTMLButtonElement>(null)
  const theme = useThemePreference()
  const title = useSyncExternalStore(subscribeLocation, readTitle, () => '')
  // On the server the path is unknown: claim neither the home nor a page until hydration.
  const path = useSyncExternalStore(subscribeLocation, readPath, () => '')
  const atHome = path === homeHref
  // Drop only the last " · <App>": a page name may itself contain " · ".
  const cut = title.lastIndexOf(' · ')
  const fromTitle = cut > 0 ? title.slice(0, cut).trim() : ''
  const pageName = page ?? fromTitle
  const showPage = !atHome && pageName !== '' && pageName !== appName

  useEffect(() => {
    if (!open) return
    const onOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(null)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      const button = open === 'apps' ? appsButton.current : displayButton.current
      setOpen(null)
      button?.focus()
    }
    document.addEventListener('click', onOutsideClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', onOutsideClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const groups = Object.entries(directory.groups).filter(([group]) => group !== 'external')

  return (
    <nav
      ref={nav}
      className="jhp-nav"
      aria-label={copy.landmark}
      data-jhp-directory-version={directory.version}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(null)
      }}
    >
      <div className="jhp-nav__inner">
        <ol className="jhp-nav__crumbs" aria-label={copy.crumbs}>
          <li>
            <a className="jhp-nav__home" href={LAUNCHER} aria-label={copy.launcher}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={markSrc} width={28} height={28} alt="" />
            </a>
          </li>
          <li>
            <a className="jhp-nav__current" href={homeHref} aria-current={atHome ? 'page' : undefined}>
              {appName}
            </a>
          </li>
          {showPage && (
            <li className="jhp-nav__page">
              <span aria-current="page">{pageName}</span>
            </li>
          )}
        </ol>
        <button
          ref={displayButton}
          type="button"
          className="jhp-nav__display"
          aria-label={copy.display}
          aria-expanded={open === 'display'}
          aria-controls="jhp-display-settings"
          onClick={() => setOpen(value => (value === 'display' ? null : 'display'))}
        >
          <ThemeIcon theme={theme} />
        </button>
        <button
          ref={appsButton}
          type="button"
          className="jhp-nav__toggle"
          aria-expanded={open === 'apps'}
          aria-controls="jhp-app-links"
          onClick={() => setOpen(value => (value === 'apps' ? null : 'apps'))}
        >
          {copy.apps}
        </button>
        <div className="jhp-nav__popover" id="jhp-display-settings" hidden={open !== 'display'}>
          <DisplaySettings
            locale={locale}
            language={language}
            languages={languages}
            onLanguageChange={onLanguageChange}
            onThemeChange={onThemeChange}
          />
        </div>
      </div>
      <div className="jhp-nav__panel" id="jhp-app-links" hidden={open !== 'apps'}>
        <div className="jhp-nav__groups">
          {groups.map(([group, names]) => (
            <div key={group} className="jhp-nav__group">
              <h2>{names[locale]}</h2>
              <ul>
                {directory.services
                  .filter(service => service.group === group)
                  .map(service => (
                    <li key={service.id}>
                      <a
                        className="jhp-nav__link"
                        href={service.url}
                        aria-current={service.id === currentId ? 'page' : undefined}
                        onClick={() => setOpen(null)}
                      >
                        {service.name[locale]}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="jhp-nav__external">
          <a className="jhp-nav__link" href={LAUNCHER + '/#external-tools'} onClick={() => setOpen(null)}>
            {directory.groups.external?.[locale]}
          </a>
        </div>
        {children}
      </div>
    </nav>
  )
}
