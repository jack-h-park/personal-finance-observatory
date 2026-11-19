import { CardRow } from '@/components/layout'
import { getUiCopy } from '@/lib/ui-copy'
import type { Language } from '@/lib/i18n'

/**
 * Route loading state: a header bar, a hero-height card and two card outlines,
 * the shape every route shares. It pulses only when the user allows motion.
 */
export function PageSkeleton({ language }: { language: Language }) {
  const block = 'rounded-md bg-surface motion-safe:animate-pulse'

  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{getUiCopy(language).common.loading}</span>
      <div aria-hidden="true">
        <div className="mb-5 h-8 w-1/3 rounded bg-surface motion-safe:animate-pulse" />
        <div className={`${block} mb-5 h-40`} />
        <CardRow>
          <div className={`${block} h-48`} />
          <div className={`${block} h-48`} />
        </CardRow>
      </div>
    </div>
  )
}
