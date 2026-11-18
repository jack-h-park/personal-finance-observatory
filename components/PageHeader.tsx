import Link from 'next/link'
import type { ReactNode } from 'react'
import { AutoRefresh } from '@/components/AutoRefresh'
import { Badge } from '@/components/controls'
import type { HeaderStatus } from '@/lib/header-status'
import type { Language } from '@/lib/i18n'
import { routeName, routeSection, type RouteHref } from '@/lib/page-names'
import { severityTone } from '@/lib/tone'
import { getUiCopy } from '@/lib/ui-copy'

/**
 * The page's one-line verdict. When it reports a problem, `href` points at the
 * card that lists it (`#<card id>`), so the pill is the way in, not only a sign.
 */
export type PageHeaderStatus = HeaderStatus

/**
 * What sits on the line above the title: a plain overline, or, on a page that
 * hangs off another route, the way back to it. The two are exclusive because
 * they occupy the same line.
 */
type HeaderTrail =
  | {
      /** Small overline above the title, rendered as mini-gradient brand text. */
      eyebrow?: string
      parent?: never
      language?: never
    }
  | {
      eyebrow?: never
      /**
       * The sidebar route this page hangs off. Renders `Section > Parent` in the
       * eyebrow's place, the parent being a link. This replaces the "Back to ..."
       * link that used to sit beside the heading.
       */
      parent: RouteHref
      /** The label is the sidebar's, so it needs the language the page was rendered in. */
      language: Language
    }

export function PageHeader({
  title,
  subtitle,
  emphasis,
  status,
  actions,
  autoRefresh = true,
  ...trail
}: HeaderTrail & {
  title: string
  subtitle?: ReactNode
  /** A trailing substring of `title` to highlight with the brand gradient.
   *  e.g. title="Pipeline Overview" emphasis="Overview". */
  emphasis?: string
  status?: PageHeaderStatus
  /** Back links and buttons. They follow the status, and the clock follows them. */
  actions?: ReactNode
  /** Off on pages with a form to fill in, where a refresh every 30 seconds would reload it mid-entry. */
  autoRefresh?: boolean
}) {
  const showEmph = Boolean(emphasis && title.endsWith(emphasis))
  // tests/page-headings.test.ts is the primary net: it checks every copy-driven
  // heading and the helpers in lib/page-headings.ts. This is the backstop for a
  // title built from data the test never sees. Outside production a dead
  // emphasis fails loudly; in production the heading still renders, without
  // the gradient, rather than taking the page down.
  if (emphasis && !showEmph && process.env.NODE_ENV !== 'production') {
    throw new Error(
      `PageHeader: emphasis "${emphasis}" is not a trailing substring of title "${title}", so the gradient would never render`
    )
  }
  const head = showEmph && emphasis ? title.slice(0, title.length - emphasis.length) : title

  return (
    <header className="ai-page-header mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {trail.parent ? (
          <Breadcrumb parent={trail.parent} language={trail.language} />
        ) : (
          trail.eyebrow && <div className="t-eyebrow mb-1">{trail.eyebrow}</div>
        )}
        <h1 className="t-h2">
          {head}
          {showEmph && <span className="t-emph-gradient">{emphasis}</span>}
        </h1>
        {subtitle && <p className="mt-1 max-w-4xl text-body leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {/*
        Wraps between its children, never inside one: on a phone a Korean label
        would otherwise break mid-word. The badge is whitespace-nowrap itself.
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        {status ? <StatusPill {...status} /> : null}
        {actions ? <div className="flex items-center whitespace-nowrap">{actions}</div> : null}
        {autoRefresh ? (
          <div className="flex items-center whitespace-nowrap">
            <AutoRefresh seconds={30} />
          </div>
        ) : null}
      </div>
    </header>
  )
}

function Breadcrumb({ parent, language }: { parent: RouteHref; language: Language }) {
  return (
    <nav aria-label={getUiCopy(language).common.breadcrumb} className="t-eyebrow mb-1 flex flex-wrap items-center gap-x-1.5">
      <span>{routeSection(parent, language)}</span>
      <span aria-hidden="true">›</span>
      <Link
        href={parent}
        className="rounded-sm text-info hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
      >
        {routeName(parent, language)}
      </Link>
    </nav>
  )
}

function StatusPill({ severity, label, href }: PageHeaderStatus) {
  const badge = <Badge tone={severityTone(severity)}>{label}</Badge>
  if (!href) return badge
  // The ring every linked badge in the app already uses; inline-flex so the
  // link's box is exactly the badge's and the pill does not move.
  return (
    <Link href={href} className="inline-flex rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-info/40">
      {badge}
    </Link>
  )
}
