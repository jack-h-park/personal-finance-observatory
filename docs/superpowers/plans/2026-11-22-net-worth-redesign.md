# Total assets page (`/net-worth`) — redesign plan

**Status:** draft, 2026-11-22. The decisions below need confirming before Phase 1.

## Why

`/net-worth` (`app/net-worth/page.tsx`) is the home of total assets, and the Overview hero now links to it, but the page reads as a stack of equal-weight cards:

- **The trend is the third card.** The stacked total-assets chart starts about 1,200px down, below the total, the class figures and the allocation tables. On a phone it is several screens away.
- **The headline row is cramped and flat.** The total sits alone in a side card. Five class figures share one row at title size, so on a laptop the amounts run into each other, and nothing says how the total or any class changed.
- **It is less informative than the Overview.** The Overview hero now shows four period changes with the classes that drove them; the page it links to shows none of that.
- **Detail outweighs the answer.** The page is about 8,000px tall. The month-end table (every month since 2018, five class columns) and the cash-balance table are most of it. Notes about coverage, as-of dates and classification sit in the body as paragraphs.
- **The only controls are a range and a children toggle.** There is no way to focus on one class, see the mix as shares, or read the change over the selected period.

## Principles

1. **Same answer order as the Overview, with more depth.** How much do I have, and where is it going? What changed, and why? How is it spread? Then the records.
2. **The trend leads.** The total, its changes and the stacked chart are one card at the top. This page is the workbench, so the controls live here (the one-home rule, `docs/ui-guide.md`).
3. **Consistent with the Overview.** The same change computation (`lib/total-assets-change.ts`), the same month-end bases, the same class colours, the same `ShareSummary` bar-and-lines pattern for shares. The Overview stays a summary; anything with a control is here.
4. **Notes behind info popovers.** Coverage, as-of and classification explanations move into each card's info popover; only a warning stays in the body.

## Target layout

| Band | Content | Filters |
|---|---|---|
| 1. Trend (hero) | Total assets; a change band: this month, 3 months, this year, 12 months, plus **the change over the selected range**, each with its two biggest class drivers; the stacked chart (taller than on the Overview); event markers, with the event list collapsed under the chart | range (exists); **classes** (show or hide each class); **amount or share** (stacked amounts, or each class as a % of the total); children band (exists) |
| 2. Composition | One card: each class with its value, share of the total, change this month and as-of note, as a bar plus lines; then the asset-type and account-type splits (today's allocation card) | — |
| 3. Month-end history | The month-end table with a **month-over-month change** column for the total; the last 12 months by default | **year** (or all) |
| 4. Cash balances | The cash table sorted by won value, stale balances marked | — |

The coverage note stays above the trend as it is (one line, collapsible).

## Phases

Each phase is one PR, stacked, with the screenshot net, `pnpm ui:guardrails`, and the English render checked.

1. **Trend first.** Move the trend card to the top; merge the total and the change band (shared with the Overview) into it; collapse the event list. The separate total card goes away.
2. **Trend filters.** Class toggles and the amount/share switch as URL parameters next to the range chips, and the "selected range" change field. Chart support for hidden classes and a 100% stacked mode in `StackedAssetChart`.
3. **Composition card.** Class figures become a `ShareSummary`-style list with share and this-month change; the allocation splits join the same card; notes move into popovers.
4. **Records.** Month-end table: MoM change column, 12 months by default, year filter. Cash table: sorted by won value.
5. **Trim and phone pass.** At 390×844 the total, change band and chart fit the first screen with no horizontal scroll.

## Decisions to confirm

1. **Hero is the trend card** (total + changes + chart in one card), replacing the separate total card.
2. **New filters:** class toggles, amount/share switch, and a change field for the selected range. The month-end table gets a year filter.
3. **Month-end table shows 12 months by default**, with the year filter for the rest, instead of every month since the first snapshot.
4. **Cash balances stay on this page**, at the bottom, rather than moving to `/accounts`.
