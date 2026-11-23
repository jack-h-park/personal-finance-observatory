# /spending GUI Consistency Plan

> **For agentic workers:** this is a roadmap of five phases, one pull request each. Before executing a phase, expand it into a task-level plan with superpowers:writing-plans (exact tests and signatures), then execute with superpowers:executing-plans or superpowers:subagent-driven-development.

**Goal:** Make `/spending` read and behave like the other Assets & Cash Flow pages (`/cash-inflow` above all): the same header, lead card, controls, chart, tables and formatting, so that a reader who knows one page can read the other, and the page answers "how much did I spend, on what, and is anything missing?" at a glance.

**Architecture:** No new data or engine work. `analyzeSpending` / `projectSpending` already compute what the page needs; this plan replaces the page's hand-built UI with the shared primitives listed in `docs/ui-guide.md` § Layout, moves strings and formatting onto the shared helpers, and brings the page under the existing guardrails (`ui:guardrails`, `ui:shape`, the screenshot net, `ui:mobile`, axe).

**Tech Stack:** Next.js server components, `components/ui`, `components/layout`, `components/charts` (Recharts), `FilterBar`, `Tabs`, `DataTable`, `lib/ui-copy`, `lib/format`, `lib/header-status`.

**Spec:** this document, plus the cross-app rules in `workspace-governance/docs/ux/guidelines.md` and the repo rules in `docs/ui-guide.md` (Page order, Card budget, Charts, Tables, One home per data block).

## Global Constraints

- Every string from `lib/ui-copy/pages/spending.ts` (both `en` and `ko`); no new hand-written grid, colour or type-size utility (`ui:guardrails` must report 0 new hits).
- Dates through `fmtDate` / `fmtMonth` with the language; money through one formatter; empty value `—`.
- Page order per `docs/ui-guide.md`: header with status pill → lead accent card with an `id` → issues card (only when it has rows) → controls as a toolbar, not a card → detail. At most ten cards at 1440×1000; the lead's top at or above 840 px.
- 375 px without horizontal page scroll; 24 px touch targets; both languages; light and dark.
- No real amounts, merchants or account numbers in commits, PR text or test fixtures (synthetic ledger only: `examples/spending`).
- The spending figures must stay identical to today's: every phase keeps `tests/spending-page.test.ts` green and adds no change to `analyzeSpending` results.

## What is wrong today

Observed on the production page (2026-11-23, desktop 1440 px) and in `app/spending/page.tsx`, `components/SpendingAnalytics.tsx`.

| # | Finding | Where | Peer pages do |
|---|---|---|---|
| F1 | No lead card. The headline is a plain `Card` holding an oversized monospace KRW figure, with no accent bar, no `id`, and no supporting figures (monthly average, change against the previous period). | `page.tsx` summary card | `/cash-inflow` leads with `MetricHeroCard id="cash-inflow-lead"`, total, monthly average and change with its driver in a `KpiBand` |
| F2 | No header status. Holds and incomplete review show only inside the third tab; the header has no pill, no freshness clock, no title emphasis. | `PageHeader` call | `cashInflowHeaderStatus` links a warning pill to the triage card |
| F3 | Three control styles in one toolbar: hand-styled view links (`filterLink`), a boxed period pill, an account `<details>` menu on Summary and Review but a `<select>` form with an Apply button on Transactions. | `filterLink`, `selectStyle`, the `<form>` | `Tabs` for views, `FilterBar` link chips with labelled rows, no submit button |
| F4 | Hand-drawn monthly bars: no value axis, no amounts, ticks every third month as `12`/`01`, a hover title as the only way to read a value. | `MonthlyBars` | `StackedBarChart` / `TrendBarChart` with `axisTick` (억/만), full-amount tooltip, `fmtMonth` ticks, click-through links |
| F5 | Two category vocabularies ranked against each other: issuer categories in English (Shopping, Travel) beside BankSalad categories in Korean (온라인쇼핑, 패션/쇼핑), so the same kind of spending is split and the largest bucket, uncategorized, sits in a footnote under the top five. | `combined.categories` | `ShareSummary` with shares that add up, one label set per language |
| F6 | "Large spending" mixes two lists in one card (merchant totals, and individual purchases hidden in a disclosure) under a heading that names neither. | `SpendingAnalytics` second card | One card, one question |
| F7 | Transactions show card payments and own-account transfers by default, although the totals above exclude them; purchases print as negative amounts while the summary prints spending as positive. Account cells show full product names rather than `AccountCell`; a separate hand-built `<ol>` duplicates the table below `md`. | transactions card | `DataTable` with `priority` columns, `AccountCell`, signed amounts with tone, one rendering for every width |
| F8 | Coverage is rendered on `/spending` (Review tab) and on `/accounts#spending-coverage` from the same data. | Review tab, `SpendingAccountPanel` | One home per data block; other pages link |
| F9 | Raw ISO dates in prose (`2025-12-01 ~ 2026-11-22`), `~` as the range mark, the exchange policy as a permanent paragraph rather than the card's info popover, warnings as hand-styled `text-warning` paragraphs. | summary card, holds card | `fmtDate`, `·`/`–`, `info`, `Callout`/`Note` |
| F10 | The page is outside the guardrails that keep the others honest: not in `SHAPE_ROUTES`, not in the screenshot net or the mobile/axe route lists. | `scripts/page-shape.mjs` and friends | Every R5 page is measured |

## Target page

Summary tab, top to bottom:

1. **Header** — title with emphasis like its neighbours, the question in the subtitle, snapshot date as freshness, and one status pill: holds or incomplete review (warning) linking to `#spending-holds`; missing exchange rates when there are no holds.
2. **Lead** — `MetricHeroCard id="spending-lead"`: net spending for the period (KRW, or the display currency per Decision 2) with an info popover holding the exchange policy; `KpiBand` with monthly average, change against the previous comparable period (completed months only, as `/cash-inflow` does), USD native net, KRW native net, and months recorded.
3. **Controls toolbar** — `Tabs` (Summary · Transactions · Data review), then `FilterBar` rows: Period (12 months · This year · Last year · 24 months), Account; on Transactions also Month, Currency, Category and the payments toggle (Decision 4). Links only, no Apply button.
4. **Monthly chart** — `StackedBarChart` of KRW-equivalent spending per month, stacked by settlement currency, with the month in progress marked `partial`; each bar links to that month's transactions. The exact-figures table stays in a disclosure.
5. **Where it went** — two cards in a `CardRow`: "By category" as `ShareSummary` over one label set (Decision 3) with uncategorized as a ranked row; "By merchant" as the merchant ranking. Individual largest purchases move to the Transactions tab as its default sort option rather than a hidden list.

Transactions tab: one `DataTable` (priority columns: date, merchant, amount primary; account, category secondary; type, original amount tertiary), `AccountCell`, spending shown positive and refunds negative with tone, the selected transaction's rate detail as a `Panel`, pagination through the shared links.

Data review tab: the holds card (reasons, then per-account tables) under the header pill's anchor; coverage replaced by a link to `/accounts#spending-coverage` (Decision 1).

## Phases

Each phase is one PR, ships on its own, and leaves the page better than it found it.

### S1 — Header, lead and status (F1, F2, F9 partly)

- `lib/header-status.ts`: `spendingHeaderStatus(copy, holds, reviewIncomplete, missingFx, href)` built on `issueStatus`, so the pill and the holds card's `issues` badge show one count.
- `lib/domain/spending-view.ts`: `comparePeriods(rows, options)` returning the previous comparable window's combined net and the change, using the completed-months rule from `getCashInflow` (no new engine; reuses `analyzeSpending` on the shifted window).
- `app/spending/page.tsx`: `MetricHeroCard id="spending-lead"` + `KpiBand`; exchange policy into `info`; missing-rate notice as `Note`/`Callout` tone warning.
- Add `{ path: '/spending', lead: '#spending-lead' }` to `SHAPE_ROUTES`.
- Tests: header status unit tests (holds only, incomplete only, missing FX only, none → no pill); `comparePeriods` against hand-built windows including a refund-heavy month and a first period with nothing before it (change `null`, never ÷0).

### S2 — Controls (F3)

- Replace the view nav with `Tabs`, the period pill and account `<details>`/`<select>` with `FilterBar` groups; delete `filterLink` and `selectStyle`.
- Transactions filters (month, currency, category) become `FilterBar` groups too, so every filter is a link and the Apply button goes away.
- Tests: href builders keep `period`, `account` and the tab when another control changes (pure function, like `overviewHref`); an unknown `view`/`period` falls back to defaults.

### S3 — Monthly chart (F4)

- Replace `MonthlyBars` with `StackedBarChart` (`unit: { kind: 'money', currency: 'KRW' }`, series = KRW-settled and USD-settled spending in KRW, `linkKey` to the month's transactions, `partial` for the month in progress, `emptyMessage` from copy).
- `analyzeSpending` already has per-month native and combined values; add per-month KRW-equivalent of USD rows to `combined.months` if the stack needs it (covered by a parity test: the two series sum to `combined.months[i].amount`).
- Months with missing rates keep their warning in the tooltip.

### S4 — Breakdowns (F5, F6)

- Category mapping (Decision 3): `config/spending-categories.json` maps each issuer and BankSalad category to one canonical key with `en`/`ko` labels; `lib/spending-categories.ts` applies it on read. Unmapped categories pass through unchanged and are counted, so nothing disappears.
- "By category" as `ShareSummary` with uncategorized as a row; "By merchant" keeps the merchant ranking; the largest-purchases list moves to Transactions (S5).
- Tests: mapping merges an issuer and a BankSalad label into one row with the summed amount and count; an unmapped label stays visible.

### S5 — Transactions and Data review (F7, F8, F9 rest)

- One `DataTable` with priorities and `AccountCell`; drop the duplicate `<ol>`; spending sign convention as above; "Largest first" sort option.
- Payments and transfers hidden by default behind a FilterBar toggle (Decision 4), with the count of hidden rows in the summary line.
- Data review: holds card stays; coverage card replaced by a link to `/accounts#spending-coverage` (Decision 1).
- Dates through `fmtDate`; range mark `–`.
- Tests: default transaction filter excludes `card_payment`/`own_transfer` and counts them; toggle includes them; table priority test joins `tests/table-priority.test.ts`.

### Closing gate (every phase)

`pnpm typecheck && pnpm lint && pnpm test && pnpm ui:guardrails && pnpm build`, then `ui:shape`, the screenshot net and `ui:mobile` against a synthetic ledger (`examples/spending` imported into a scratch workspace, `SPENDING_PILOT_DB` pointed at it), both languages, 375 px and 1440 px. S5 also adds `/spending` to the screenshot-net, mobile and axe route lists.

## Decisions for the maintainer

1. **Coverage home.** Keep coverage only on `/accounts` (the plan's default, per "one home per data block") or keep a copy on `/spending`'s Data review tab?
2. **Display currency.** Follow the app's KRW/USD display preference in the lead and rankings like every other page (plan default), or keep `/spending` KRW-only as #433 made it?
3. **Category labels.** Approve one canonical category list that issuer (English) and BankSalad (Korean) categories map into; the plan's S4 cannot start without it.
4. **Payments in Transactions.** Hide card payments and own-account transfers by default with a toggle (plan default), or keep showing every ledger row?

## Progress

- **Decisions:** all four taken as the plan's defaults (2026-11-23).
- **S1 (header, lead, status):** done on `claude/spending-gui-s1`. Changes from the plan: no title emphasis (most pages have none and `tests/page-headings.test.ts` allows it; "Spending" has no trailing word to stress); the change figure carries no colour, because more spending is neither a gain nor a fault; exchange rates are now read on every tab so the header pill's missing-rate count is right on Data review too; `/spending` joins `SHAPE_ROUTES` as optional, skipped where the route is a 404.
- **S1** merged as #436.
- **S2 (controls):** done on `claude/spending-gui-s2`. Tabs and `FilterBar` (period, account, and month on Transactions) replace the hand-styled links, the account menu and the form with its Apply button. Currency, category and merchant stay drill-downs from the Summary rankings with their clear link, since they are not filters a reader picks from a list. The month row lists only the period's months with activity. Links come from `lib/spending-links.ts`.
- **Card budget fixed in S2:** `ui:shape` counted `section.shadow-card`, which no card has carried since #358, so every page read 0 cards. `Card` now renders `data-card` and the script counts `main section[data-card]`; measured after the fix, every route is within ten (/spending 4).
