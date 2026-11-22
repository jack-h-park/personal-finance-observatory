# Cash inflow page (`/cash-inflow`) — redesign plan

**Status:** decisions confirmed 2026-11-21; phases 1–2 built. Each phase is one stacked PR; where a phase departs from this plan it says so under the phase.

## Why

`/cash-inflow` (`app/cash-inflow/page.tsx`) answers "how much new money came in, and from where", but the answer sits below the controls and is spread over three equal-weight cards. Measured on the live page at 1309px wide:

- **Controls come before the answer.** Five filter rows (view, category, source, currency, range) take about 250px; the total starts at y≈512. Two of those rows carry the same label, 보기 (`viewLabel` and `filter.label` in `lib/ui-copy/pages/cashInflow.ts`), so the category row reads as a second view switch.
- **The hero is mostly empty.** The card title repeats the selected range chip (최근 12개월). The total sits alone on the left with blank space beside it; five KPI fields wrap in a three-column grid, so the change against the previous period lands on a second line, next to the investment share, with nothing saying what drove it.
- **The trend is a separate card.** `/net-worth` (2026-11-22 redesign) and `/income` lead with one hero card that holds the total, its change and the chart. Here the chart is the second card and the filters live outside it.
- **The current month reads as a collapse.** The last bar (the month in progress) is a sliver next to full months, with no mark that it is partial, so the chart's right edge looks like income stopped.
- **The table is a wall of blue.** Every amount is a link in the info colour, including ₩0 cells; the reimbursement and unclassified columns are ₩0 in nearly every row under All. Eight columns, no total row, and the Total column has the same weight as the categories.
- **Category colours borrow status tones.** Interest and reimbursement are both `--accent-warning`, and unclassified is `--accent-danger`. The shared guidelines (§5) reserve amber for "waits on a decision" and red for faults; unclassified money is a to-do, not a fault, and interest is neither.
- **Notes sit in the body.** The reimbursement note renders above the hero under All; the chart carries a three-sentence paragraph (FX basis, bar click, legend click); the investment and unclassified filter notes stack above the hero.
- **The unclassified view has no all-clear state.** With nothing to sort it shows a hero of ₩0 and an empty triage card, instead of a calm "nothing to sort" (guidelines §5, view states).
- **No composition view.** The page shows salary and investment totals and an investment share, but not how the inflow splits across all categories, which `/net-worth` and the Overview show with the `ShareSummary` bar-and-lines pattern.

## Principles

1. **Same answer order as the other workbenches.** How much came in, and is it more or less than before? Where did it come from? Then the records. (`docs/ui-guide.md`, guidelines §11 page structure.)
2. **The trend leads.** Total, change and the stacked chart are one hero card; the filters live inside it, above the chart, as on `/net-worth`.
3. **Consistent with `/net-worth` and the Overview.** Same hero structure, same chip style, same `ShareSummary` pattern, category colours from `lib/palette.ts` next to `ASSET_CLASS_COLOR`, notes in info popovers, only warnings in the body.
4. **Quiet numbers, loud exceptions.** Zero is `—` in the tertiary colour; links look like numbers until hovered; colour carries meaning only where something needs attention.
5. **One home.** The page stays the only home of the cash-inflow workbench; the Overview tile keeps linking here (`tests/page-blocks.test.ts`).

## Target layout

| Band | Content | Controls |
|---|---|---|
| 1. Trend (hero) | Total for the selected range, with the change against the previous period of the same length beside it (and the category that moved most); monthly average under it; the stacked chart, taller; the month in progress drawn hatched or lighter, labelled 진행 중 in the tooltip and excluded from the change | One filter block inside the card, above the chart: range and view on the first line; category, source and currency on the second. On a phone the second line folds behind the existing 필터 disclosure |
| 2. Composition | Each counted category (salary, dividend, interest, other) with amount, share of the total and change against the previous period, as a `ShareSummary` bar plus lines; investment income (dividend + interest) as a subtotal line, replacing the separate 투자 수익 and 투자 수익 비중 fields; reimbursement as a separate line marked 합계 제외 | — |
| 3. Period table | Period rows with drill-down (as today); zeros as `—`; amounts in ink colour, underlined on hover and focus; Total column emphasised; a footer row with the range total and the monthly average; reimbursement and unclassified columns only when a row in range is non-zero; yearly view keeps 전년 대비 | — |
| 4. Unclassified triage | Only under the 미분류 filter, as today; an all-clear state (✓ 정리할 미분류 입금이 없습니다.) when empty, and the hero shows the count rather than ₩0 | — |

The header status pill (unclassified and today's-rate counts) stays as it is and keeps linking to band 4.

## Phases

Each phase is one PR, stacked, with the screenshot net, `pnpm ui:guardrails`, `pnpm test`, and the English render checked.

1. **Copy and tone fixes (low risk).** Rename the category row label (분류 / Category) so it no longer repeats 보기. Move `CATEGORY_COLOR` into `lib/palette.ts` with hues that are not status tones; unclassified uses the warning tone. Zero cells render `—` (tertiary, no link). Table links in ink colour with a hover and focus underline. Chart note and the reimbursement note move into the card's info popover. All-clear state for the unclassified view.

   *As built:* `CASH_INFLOW_CATEGORY_COLOR` in `lib/palette.ts` (salary blue, dividend cyan, interest purple, other tertiary, reimbursement pink, unclassified warning). The investment and unclassified filter notes moved into the hero's info popover as well, beside the reimbursement note, so no explanation renders above the hero; only the no-bank-data notice stays in the body. The selected cell drops `font-semibold` (600) for `font-medium` plus an underline, per the 400/500 weight rule. The Total column is medium weight, and a zero total is `—` too. The unclassified all-clear uses `EmptyState ok` and hides the how-to-file note, which only matters when there is something to file. The English category label changes from "Show" to "Category" on purpose.
2. **Trend first.** Merge the total, the change and the chart into one hero card; drop the hero title that repeats the range; move the FilterBar into the card above the chart (range and view first). Mark the month in progress in `StackedBarChart` and leave it out of the change computation.

   *As built:* the lead card is a plain `Card` (`id="cash-inflow-lead"`, title 유입 추이 / Inflow trend) holding the total with its range in the eyebrow, the change on the right, the remaining KPI fields, the filters (range, view, category, source, currency) and the chart; `MetricHeroCard` and the separate trend card are gone, and the chart notes joined the card's info popover. `getCashInflow` now returns `currentMonth`, and its change compares whole months: when the range ends in the month in progress, that month and the last month of the window before both drop out (`changeThrough` names the last month counted). It also returns `changeDriver`, the counted category whose amount moved most, shown under the change. `StackedBarChart` takes `partial={{ key, label }}`: those bars draw at 40% opacity and their tooltip title adds 진행 중 / in progress; one line under the chart says the same, since a tooltip may not be the only place. The monthly average still divides by calendar months including the current one, as before; the plan only moved the change.
3. **Composition card.** Category shares with `ShareSummary`, investment subtotal, reimbursement line; remove the KPI fields it replaces.
4. **Table polish.** Footer total row, emphasised Total column, conditional reimbursement and unclassified columns, detail panel heading aligned with the row it opened from.
5. **Phone pass.** At 390×844 the total, the change and the start of the chart fit the first screen under the access banner and page header; no horizontal page scroll; the period table scrolls inside its own container with the period column pinned.

Tests to update with the phases: `tests/page-blocks.test.ts` (the cash-inflow assertion around the filter bar and `cash-inflow-lead`), copy-catalog tests for any renamed key, and the screenshot net baselines for `/cash-inflow`, `/cash-inflow?category=unclassified` and `/cash-inflow?view=year`.

## Decisions (confirmed 2026-11-21)

1. **Hero is the trend card** (total + change + chart in one card, filters inside it), replacing the separate total and trend cards.
2. **The month in progress** is drawn as partial and left out of the change against the previous period. Alternative: keep it in, but label it.
3. **Composition card replaces** the 급여, 투자 수익 and 투자 수익 비중 KPI fields.
4. **Category colours** move off the status tones; unclassified becomes amber (a to-do), not red.
5. **Reimbursement and unclassified table columns** appear only when the range has a non-zero value in them, instead of always under All.
