'use client'

import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { usePageLanguage } from '@/components/LanguageProvider'
import { normalizeLanguage, type Language } from '@/lib/i18n'
import { getUiCopy } from '@/lib/ui-copy'

/** The round "i". */
const ICON_BUTTON_CLASS =
  "relative ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-label font-semibold leading-none text-ink-2 transition-colors after:absolute after:-inset-[10px] after:content-[''] hover:border-info hover:text-info focus:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
/** A chip that carries its own summary text. */
const TRIGGER_BUTTON_CLASS =
  'inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-2.5 py-1 text-left text-caption text-ink-2 transition-colors hover:border-info hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2'

export function HelpPopover({
  children,
  label,
  align = 'center',
  className,
  language,
  trigger,
}: {
  children: ReactNode
  label?: string
  align?: 'center' | 'left' | 'right'
  className?: string
  language?: Language
  /**
   * What the button shows instead of the "i": a chip whose own text is the
   * summary and whose popover holds the detail (the valuation basis strip).
   */
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const contextLanguage = usePageLanguage()
  const [pageLanguage, setPageLanguage] = useState<Language>(language ?? contextLanguage)
  const tooltipId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  const copy = getUiCopy(pageLanguage).common

  useEffect(() => {
    if (language) {
      setPageLanguage(language)
      return
    }
    setPageLanguage(contextLanguage)
  }, [contextLanguage, language])

  useEffect(() => {
    if (language) return
    setPageLanguage(normalizeLanguage(document.documentElement.lang))
  }, [language])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <span ref={rootRef} className={clsx('group relative inline-flex items-center align-middle', className)}>
      <button
        type="button"
        // A trigger's own text names the button; an aria-label would hide it from a screen reader.
        aria-label={trigger ? undefined : label ?? copy.help}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={trigger ? TRIGGER_BUTTON_CLASS : ICON_BUTTON_CLASS}
      >
        {trigger ?? 'i'}
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        aria-hidden={!open}
        className={clsx(
          // Below `md` it is pinned to the viewport rather than to the "i".
          // A 288px panel anchored to a button near the right edge hangs off
          // the screen — it widened the document by up to 97px on /review, and
          // absolutely-positioned overflow is what a phone user then has to
          // scroll sideways past. Fixed positioning also keeps it out of the
          // document's scroll width entirely, so the page stops overflowing.
          // `whitespace-normal`: a help "i" inside a nowrap table header would
          // otherwise inherit nowrap and run its text out of the panel as one line.
          'z-50 whitespace-normal rounded-md border border-line bg-card p-3 text-left text-caption font-normal normal-case leading-relaxed tracking-normal text-ink-2 shadow-elevated transition-opacity duration-100',
          'max-md:fixed max-md:inset-x-4 max-md:bottom-4 max-md:w-auto',
          'md:absolute md:top-full md:mt-1.5 md:w-72',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:opacity-100',
          align === 'center' && 'md:left-1/2 md:-translate-x-1/2',
          align === 'left' && 'md:left-0',
          align === 'right' && 'md:right-0'
        )}
      >
        {children}
        <span className="mt-2 block text-label text-ink-3">{copy.closeHelp}</span>
      </span>
    </span>
  )
}
