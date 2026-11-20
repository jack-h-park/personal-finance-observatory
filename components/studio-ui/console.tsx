// Canonical source: workspace-governance/docs/ux/kit/react/console.tsx
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  trail,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  trail?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={`mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3 ${className ?? ''}`}>
      <div className="min-w-0">
        {trail}
        <h1 className="text-role-page-narrow m-0 break-words font-semibold tracking-tight text-ink sm:text-role-page">
          {title}
        </h1>
        {subtitle && (
          <p className="mb-0 mt-1 max-w-[var(--measure)] text-role-ui text-ink-2">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">{actions}</div>}
    </header>
  )
}

export function EmptyState({
  children,
  hint,
  ok = false,
}: {
  children: ReactNode
  hint?: ReactNode
  /** The message must explicitly describe the all-clear state. */
  ok?: boolean
}) {
  return (
    <div role="status" className="py-6 text-center text-role-ui text-ink-2">
      <div>
        {children}
        {ok && (
          <>
            {' '}
            <svg aria-hidden="true" data-icon="check" viewBox="0 0 16 16" className="inline-block h-[1em] w-[1em] align-[-0.125em] text-success" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          </>
        )}
      </div>
      {hint && (
        <div className="mt-1 text-role-meta text-ink-3">
          {hint}
        </div>
      )}
    </div>
  )
}

export const filterControlClassName = 'min-h-8'

const filterLayouts = {
  stack: 'flex flex-col gap-2.5',
  inline: 'flex flex-wrap items-center gap-x-4 gap-y-2',
}

export function FilterBar({
  children,
  label,
  layout = 'stack',
  className,
}: {
  children: ReactNode
  label?: string
  layout?: keyof typeof filterLayouts
  className?: string
}) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={`${filterLayouts[layout]} ${className ?? ''}`}>
      {children}
    </div>
  )
}
