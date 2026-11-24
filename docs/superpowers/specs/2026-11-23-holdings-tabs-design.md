# /holdings tabs and a clearer shared Tabs component

## Why

`/holdings` stacks four cards on one page: the market mix trend, the
security weight trend, the weight-change table, and the holdings card
(filters, totals, three composition panels, the 134-row table). The table
people come for sits at the bottom. The holdings card's filters apply only
to that card, but because everything shares one page they look like they
filter the charts too. The page also mixes three separate questions: what is
held now, how the market split moved, and which weights moved and why.

Splitting the page into tabs fixes this, but the shared `Tabs` component that
`/spending` uses reads poorly. Measured on the live `/spending` page:

| | Tabs | Filter chips right below |
|---|---|---|
| Font size | 12px (the meta size) | 11px |
| Height | 32px | 32px |
| Selected state | 2px underline | filled bright background |
| Gap to the next control | 20px | — |

The control that swaps the whole page looks weaker than the filters under it,
and sits close enough to them to read as one group. The labels alone do not
say what each tab holds.

## Goals

- Tabs read as the top-level switch of a page, clearly above filters.
- Each tab can say, in one line, what it shows.
- `/holdings` opens on the holdings table and its composition panels; the
  trend views move to their own tabs.
- Filters on `/holdings` appear only where they apply.

## Non-goals

- No new routes and no sidebar sub-menu (approach B, rejected below).
- No change to what any chart, panel, or table computes or shows.
- No card-style tabs with headline numbers (approach 2, possible later).

## Approaches considered

- **A. URL tabs inside the page (`?view=`)** — picked. The repo already has
  URL-driven tabs; the filter scope becomes visible as a tab boundary; only
  the active tab's data needs computing.
- **B. Sidebar sub-menu with sub-routes** (`/holdings/mix`, …). The sidebar
  already has 30+ entries; adding depth moves the clutter there, and shared
  params such as `?trend=` would have to be carried across routes.
- **C. One page, reordered, with a sticky table of contents.** Smallest
  change, but the page stays long and the filter-scope confusion stays.

For the tab look:

- **1. Improve the shared `Tabs` component** — picked. The fault is in the
  shared component, so fixing it also fixes `/spending`, `/data-connections`
  and the rebalance proposal page.
- **2. Card tabs with a headline number per tab, `/holdings` only.** Most
  self-explanatory, but costs about 80px of height and a bespoke component
  with its own mobile layout. Can be layered on later if labels plus a
  description line prove not enough.

## Design

### Shared `Tabs` (`components/Tabs.tsx`)

- Label at the panel size (16px, D9 Console scale), semibold. Add a type
  token if none matches; do not hard-code a pixel class.
- Item height at least 44px (touch target).
- Selected: 3px indicator in the accent (`info`) colour, label `text-ink`.
  Unselected: `text-ink-2` (not `ink-3`) so labels stay readable; hover to
  `text-ink`.
- Full-width bottom rule under the bar, as today.
- New optional `description` per item. The selected item's description shows
  as one line under the bar (`text-ink-2`, UI size). Items without one show
  nothing, so existing callers keep working unchanged.
- More space under the bar (or the description) than today, so the content
  below reads as a separate area.
- Below the width where labels wrap, the bar scrolls sideways inside itself
  instead of wrapping to a second row; no horizontal page scroll at 375px.
- Unchanged: links in a labelled `nav`, `aria-current="page"` on the selected
  item, server component, `scroll` prop.

`/spending` gets descriptions for its three tabs in the same change, since it
is the page that prompted this.

### `/holdings` tabs (`app/holdings/page.tsx`)

`?view=` with three values; no param means the first.

| Tab (ko / en) | `view` | Content (existing cards, unchanged) |
|---|---|---|
| 보유 현황 / Holdings | none | FilterBar, totals, freshness note, the three composition panels, the holdings table |
| 시장 구성 / Market mix | `mix` | Market mix trend card |
| 종목 비중 / Weights | `weights` | Security weight trend card and the weight-change table, together (the chart's range selection drives the table) |

- Each tab has a one-line description saying what question it answers; the
  holdings tab's description says the filters apply to that tab.
- Tab links keep the other current params, so returning to the holdings tab
  restores its filters and sort, and `?trend=` stays shared by the two trend
  tabs.
- The server computes only what the active tab renders.
- Inbound links keep working: `/positions/[market]` redirects to
  `/holdings?market=…`, which lands on the default tab.
- The tab bar sits directly under the page header.
- Copy goes in `lib/ui-copy/pages/holdings.ts`, Korean and English.

## Left to the builder

- Exact token names and spacing values, within the rules above.
- Whether the weight-change card keeps its `#weight-changes` anchor (nothing
  outside the page links to it today).
- Tests: extend `tests/ui-primitives.test.ts` for the description and
  selected-state classes; add a test that each `view` renders only its own
  cards. Refresh the screenshot baselines for `/holdings` and `/spending`,
  and run `pnpm ui:guardrails` before pushing.
