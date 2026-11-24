import Link from 'next/link'
import { HelpPopover } from '@/components/HelpPopover'
import type { Language } from '@/lib/i18n'
import { toneBgClass } from '@/lib/tone'
import { getPageCopy, getUiCopy } from '@/lib/ui-copy'
import type { ValuationBasisItem } from '@/lib/valuation-basis'
import { valuationChip } from '@/lib/valuation-basis-view'

/**
 * What the total is valued as of, one chip per input (Korean and US stocks, crypto,
 * gold, USD/KRW, cash balances), under the figure it describes. Each chip names the
 * newest quote on its market's own clock and whether it is a close; its popover has
 * the provider, exchanges, fetch time, counts and the staleness rule.
 *
 * This replaces one sentence under the composition table that gave a date per
 * market and a provider name, three cards below the total.
 */
export function ValuationBasisStrip({ items, language }: { items: ValuationBasisItem[]; language: Language }) {
  if (!items.length) return null
  const copy = getPageCopy('netWorth', language).valuationBasis
  const statusLabels = getUiCopy(language).freshness.labels
  const chips = items.map((item) => valuationChip(item, { copy, statusLabels, language }))
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 pt-1.5 text-label text-ink-3">{copy.label}</span>
      <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label={copy.label}>
        {chips.map((chip, index) => (
          <li key={chip.key}>
            <HelpPopover
              language={language}
              // The last chips sit near the right edge on a wide screen; open those leftward.
              align={index >= chips.length - 2 ? 'right' : 'left'}
              trigger={
                <>
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${toneBgClass(chip.tone)}`} />
                  <span className="font-medium text-ink">{chip.label}</span>
                  <span className="tabular-nums">{chip.summary}</span>
                  {/* The dot's colour is the status; say it in words for a screen reader. */}
                  {chip.statusLabel ? <span className="sr-only">{chip.statusLabel}</span> : null}
                </>
              }
            >
              <span className="block font-medium text-ink">
                {chip.label}
                {chip.statusLabel ? <span className="font-normal text-ink-3"> · {chip.statusLabel}</span> : null}
              </span>
              {chip.rows.length ? (
                <span className="mt-2 flex flex-col gap-1">
                  {chip.rows.map((row) => (
                    <span key={row.label} className="flex gap-3">
                      <span className="w-20 shrink-0 text-ink-3">{row.label}</span>
                      <span className="min-w-0 break-words tabular-nums text-ink-2">{row.value}</span>
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="mt-2 block text-ink-3">{chip.rule}</span>
              {chip.key !== 'CASH' ? (
                <Link href="/health#health-operational-status" className="mt-2 inline-flex min-h-6 items-center underline underline-offset-4">
                  {copy.healthLink}
                </Link>
              ) : null}
            </HelpPopover>
          </li>
        ))}
      </ul>
    </div>
  )
}
