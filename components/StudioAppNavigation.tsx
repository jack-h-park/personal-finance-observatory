'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { Language } from '@/lib/i18n'
import { studioNavigation } from '@/lib/ui-copy/studio-navigation'
import directory from '@/lib/studio-service-directory.json'

const launcher = 'https://www.jackpark.me'
const activeApp = directory.services.find(service => service.id === 'stock')
const groups = Object.entries(directory.groups)
  .filter(([group]) => group !== 'external')
  .map(([group, names]) => ({
    group,
    names,
    apps: directory.services.filter(service => service.group === group),
  }))

export function StudioAppNavigation({ language: locale }: { language: Language }) {
  const copy = studioNavigation[locale]
  const [open, setOpen] = useState(false)
  const nav = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const onOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setOpen(false)
      toggle.current?.focus()
    }
    document.addEventListener('click', onOutsideClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('click', onOutsideClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <nav
      ref={nav}
      className="jhp-nav"
      aria-label={copy.landmark}
      data-jhp-directory-version={directory.version}
      onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <div className="jhp-nav__inner">
        <a className="jhp-nav__home" href={launcher} aria-label={copy.launcher}>
          <Image unoptimized src="/brand/jhp-mark.png" width={28} height={28} alt="" />
        </a>
        <span className="jhp-nav__current">{activeApp?.name[locale]}</span>
        <button
          ref={toggle}
          type="button"
          className="jhp-nav__toggle"
          aria-expanded={open}
          aria-controls="jhp-app-links"
          onClick={() => setOpen(value => !value)}
        >
          {copy.apps}
        </button>
      </div>
      <div className="jhp-nav__panel" id="jhp-app-links" hidden={!open}>
        <div className="jhp-nav__groups">
          {groups.map(({ group, names, apps }) => (
            <div key={group} className="jhp-nav__group">
              <h2>{names[locale]}</h2>
              <ul>
                {apps.map(app => (
                  <li key={app.id}>
                    <a
                      className="jhp-nav__link"
                      href={app.url}
                      aria-current={app.id === activeApp?.id ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {app.name[locale]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="jhp-nav__external">
          <a className="jhp-nav__link" href={launcher + '/#external-tools'} onClick={() => setOpen(false)}>
            {directory.groups.external[locale]}
          </a>
        </div>
      </div>
    </nav>
  )
}
