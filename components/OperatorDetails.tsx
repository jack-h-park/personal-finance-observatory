import type { ReactNode } from 'react'
import type { Language } from '@/lib/i18n'
import { getUiCopy } from '@/lib/ui-copy'

/**
 * Paths, hashes, stderr and commands: detail for whoever runs the pipeline,
 * closed by default so it does not compete with the figures a reader came for.
 */
export function OperatorDetails({ children, language }: { children: ReactNode; language: Language }) {
  const { common } = getUiCopy(language)
  return (
    <details className="rounded-md border border-line-subtle p-3 text-label text-ink-3">
      <summary className="cursor-pointer font-medium text-ink-2">{common.operatorDetails}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  )
}
