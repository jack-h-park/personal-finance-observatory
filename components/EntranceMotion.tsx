'use client'

import { useEffect } from 'react'

/**
 * Marks the document as entered once the first-load fade has played, so the
 * `.jp-stagger` rules in jp-theme.css (gated on `:not([data-entered])`) stop
 * applying and a client-side navigation does not replay the fade. Mounted once
 * in the root layout, which persists across navigations. The last staggered
 * child starts at 350 ms and fades for 400 ms (`--dur-4`), ending at 750 ms, so
 * the attribute lands at 800 ms, after the fade has finished.
 */
export function EntranceMotion(): null {
  useEffect(() => {
    const timer = setTimeout(() => {
      document.documentElement.dataset.entered = 'true'
    }, 800)
    return () => clearTimeout(timer)
  }, [])
  return null
}
