'use client'

import { useEffect } from 'react'

/**
 * Marks the document as entered once the first-load fade has played, so the
 * `.jp-stagger` rules in jp-theme.css (gated on `:not([data-entered])`) stop
 * applying and a client-side navigation does not replay the fade. Mounted once
 * in the root layout, which persists across navigations.
 */
export function EntranceMotion(): null {
  useEffect(() => {
    const timer = setTimeout(() => {
      document.documentElement.dataset.entered = 'true'
    }, 600)
    return () => clearTimeout(timer)
  }, [])
  return null
}
