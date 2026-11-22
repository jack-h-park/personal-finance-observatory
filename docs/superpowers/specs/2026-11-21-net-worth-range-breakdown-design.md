# Net worth range breakdown — design

Date: 2026-11-21
Status: draft, awaiting maintainer approval

## Intent

The `/net-worth` page draws total assets as a stacked area chart by class
(stocks, crypto, cash, pensions, gold). The chart shows *that* total assets
moved over a stretch of months, but not *why*. The maintainer wants to drag
across the chart to select a period and get a detailed view of what changed
in it: which classes moved, and for stocks, which securities drove the move.

For each security the view must separate two causes that both raise a
holding's value:

- **Money put in** (net purchases): buying more shares, minus what selling
  took out.
- **Market effect**: what price (and, for US securities, the exchange rate)
  did to the shares held, including gains realized by selling inside the
  period.

The page already makes this split at portfolio level: the "investment
result" beside each total-assets change (`investmentResult` in
`lib/total-assets-change.ts`) is *change in unrealized gain + gain realized in
the period*. This feature is the same split, per security, over a period the
user chooses.

## Goals

- Select a period on the total-assets chart by dragging horizontally; the
  selection is shareable as a URL.
- For the selected period, show the change in total assets broken down by
  class.
- For stocks, show the securities that drove the change, each split into
  money put in and market effect, as a visual summary (not only a table).
- Per-security market effects sum to the portfolio-level investment result
  for the same period (same bases, same realized-gain source), so the new
  view never contradicts a number already on the page.

## Non-goals

- Daily or arbitrary-date resolution. History is kept as month-end
  snapshots; a selection snaps to them (plus today's point).
- Splitting market effect into price vs exchange rate for US securities.
  Possible later from `historical_fx_rates`; out of scope for v1.
- Per-account breakdown. Securities are aggregated across accounts by
  `(market, ticker)`.
- Explaining cash, pension or gold changes beyond their class total (for
  example which bank inflow raised cash). The class bar is enough in v1.
- Children's assets as a separate band. The breakdown ignores
  `?children=1`. Past `portfolio_snapshots` rows read the `holdings` /
  `tax_lots` / `realized_lots` views, which filter by wrapper
  (`taxable`, `isa`) and asset class but not by owner. Checked against prod
  on 2026-11-21: the children's securities are all in `pension_savings`
  accounts, so no child row reaches those views today. See "Owner scope".

## Anti-goals

- A breakdown whose per-security numbers do not add up to the class change
  or the investment result shown elsewhere on the page. A gap must be named
  (see "Coverage"), never hidden or silently absorbed.
- A second copy of the lot replay logic in TypeScript. Per-security history
  comes from the same replay that already builds `portfolio_snapshots`.
- Real figures from the maintainer's data in PR text or commit messages
  (repo rule).

## Constraints

- The page is a server component driven by URL parameters (`?trend=`,
  `?classes=`, `?view=`, `?children=`, `?history=` via `hrefWith`). The
  selection must follow the same pattern.
- The chart is Recharts (`StackedAssetChart`, `components/charts.tsx`), a
  client component.
- Past snapshots are month-end rows written by
  `scripts/backfill-portfolio-history.mjs`; today's row is written by ingest
  from `holdings`. Prod data is owned by the ops host: shipping this needs a
  refresh run on prod to fill the new table (ask before running anything
  there).
- UI copy goes through `getPageCopy` in Korean and English; `pnpm
  ui:guardrails` must pass (no English inside Korean copy, dates carry a
  language).
- Cross-app UI rules in `workspace-governance/docs/ux/` apply.

## Approaches considered

**A. Persist per-security month-end snapshots; decompose by lots (chosen).**
The backfill already computes each position's quantity, cost and market
value at every month end (`valuedPositionsAt(date)` in
`scripts/lot-valuation.mjs`) and then discards everything but market totals.
Persist those rows in a new table and decompose with unrealized/realized
gain. Matches the existing investment-result KPI exactly; page reads are
cheap. Costs a schema addition, ingest/backfill changes, and a prod refresh.

**B. Replay lots at request time.** No schema change, but duplicates the
`.mjs` replay in TypeScript (two implementations to drift apart) and makes
every page view run a full replay.

**C. Cash flows from `transactions_all`.** Money in = buys − sell proceeds in
the period; market effect = the rest. Transaction completeness differs by
market and account (US CSVs lag the snapshot, for one), so it would disagree
with the KPI in some periods.

The maintainer picked A.

## Design

### 1. Data: `position_snapshots`

New table, written alongside `portfolio_snapshots`:

| column | meaning |
|---|---|
| `snapshot_date` | same dates as `portfolio_snapshots` |
| `market` | `KR` / `US` / `CRYPTO` (as in `valuedPositionsAt`) |
| `ticker` | |
| `name` | display name, from current holdings/lots where known |
| `quantity` | summed across accounts |
| `cost_krw` | lot cost basis in KRW, summed across accounts |
| `market_value_krw` | null when no price for that date |

Unique on `(snapshot_date, market, ticker)`. Rows aggregate the per-account
output of `valuedPositionsAt` by `(market, ticker)`.

- `backfill-portfolio-history.mjs`: inside the existing per-date loop, write
  one row per valued position for that date; delete and rewrite past rows
  in the same transaction that rewrites `portfolio_snapshots`.
- Ingest: write today's rows with `market_value_krw` from `holdings` (the
  same value the Total assets card shows) and `cost_krw` from the lot
  replay's open lots, not `holdings.base_cost`. Broker average cost (for
  example the Robinhood snapshot) can differ from FIFO lot cost; mixing the
  two between A and B would show the difference as money put in that never
  happened. Carry previous rows forward the way `previousPortfolioSnapshots`
  is carried.
- Invariant (a validation check): for each date, the sum of
  `market_value_krw` over KR+US rows equals `kr_market_value +
  us_market_value_base` on that date's `portfolio_snapshots` row, and CRYPTO
  rows sum to `crypto_market_value_base`, within rounding.

### 2. Decomposition (pure function, `lib/`)

Inputs: the two snapshot dates `A < B` (A is the latest snapshot on or before
the selection's start, as `totalAssetsChange` picks a base), the
`position_snapshots` rows at A and B, and realized lots with `A < sold_date <=
B`.

Per `(market, ticker)`, with missing rows treated as zero:

- `valueChange = MV_B − MV_A`
- `unrealizedChange = (MV_B − cost_B) − (MV_A − cost_A)`
- `realized = Σ realized_gl_krw` of lots of that security sold in `(A, B]`
- `marketEffect = unrealizedChange + realized`
- `moneyIn = valueChange − marketEffect` (equals net purchases at cost, minus
  the cost of what was sold, minus realized gain: i.e. buys − sell proceeds)

A security bought and fully sold inside the period has no row at A or B; it
contributes only `realized` to market effect and `−realized` to money in, so
its value change is zero, as it should be.

Totals: for periods ending at a month end, `Σ marketEffect` over stocks
(+ crypto) equals the end-point-aware `investmentResult` for the same A and B
when both read the same realized-lots source; assert this in a test. For a
period ending today, the KPI's unrealized gain uses `holdings.base_cost`
while the breakdown uses lot cost, so the two can differ by the cost-basis
difference. The panel computes its own header investment result from the
breakdown and, when it differs from the KPI-style figure, shows the gap as a
named "cost basis difference" line (amount only, with an info note), never
folded into any security's money in.

### 3. Coverage

A position with no price at A or B has a null market value. Such securities
are listed in a note ("not priced on …") and excluded from the bars; the
note states the excluded cost so the gap against the class bar is
explained. Same treatment the page gives partial market value today.

### 4. Selecting a period

- `StackedAssetChart` gains an optional range-select mode: pointer down /
  move / up on the plot area draws a Recharts `ReferenceArea`; on release it
  navigates to the current URL with `from=YYYY-MM-DD&to=YYYY-MM-DD` (the
  plotted dates nearest the drag ends). Existing parameters are kept
  (`hrefWith` gains `from`/`to`).
- The selection is drawn as a persistent shaded `ReferenceArea` while
  `from`/`to` are set; a "clear" control removes both parameters.
- If the selection falls outside the current `?trend=` window, the window
  is widened to include it (the URL is the source of truth).
- Narrow screens (drag is unreliable on touch): two month selects (start /
  end month end) above the panel do the same navigation. The selects also
  serve as the keyboard-accessible path on desktop.
- A selection of a single point (`from === to`) is ignored.

### 5. The breakdown panel

Rendered server-side below the chart when `from`/`to` are present, inside
the trend card or as the card immediately after it (builder's call, keep
the page's card rhythm).

1. **Header:** the period (`A → B`, language-aware dates), total change and
   %, and investment result for the period, using `TotalAssetsChangeField`
   so it reads like the KPI band.
2. **By class:** a diverging horizontal bar per class with a nonzero change
   (class colors from `ASSET_CLASS_COLOR`), largest move first — the
   existing `byClass` drivers, computed between A and B instead of A and
   today.
3. **Stocks by security:** top N securities by `|valueChange|` (N ≈ 8),
   remainder grouped as "Other (k)". Each row is one diverging bar split
   into two segments, money in and market effect, in two distinct colors
   with a legend; the net value change is printed at the bar end. Rows link
   to the position detail page. A sort toggle (by value change / by market
   effect) is a nice-to-have, not required.
4. **Crypto by asset:** the same component, shown only when crypto has rows
   in the period.
5. **Coverage note** (section 3) when anything was excluded.

All amounts respect the display currency (`convertMoney` / `money`), as the
rest of the page does.

## Decided by the maintainer

- Show both money put in and market effect, separated, per security.
- Approach A (persist per-security snapshots, lot-based decomposition).
- A period ending today uses lot cost for today's rows too (not broker
  average cost); any difference from the KPI is shown as a named
  "cost basis difference" line.

## Calls made in design (open to correction)

- Month-end snapping; URL `from`/`to`; touch fallback with month selects.
- Market effect includes FX for US securities in v1.
- Aggregation across accounts by `(market, ticker)`.
- Top-N + "Other" grouping; crypto gets the same view.

## Builder notes from review

- `totalAssetsChange` and `investmentResult` always measure to the last
  point. The panel needs end-point-aware variants (base A, end B); keep the
  existing functions' behavior for the KPI band.
- Realized gains must skip rows marked `superseded_by`, exactly as
  `withCumulativeRealized` does, or per-security totals will not match the
  page's investment result. Note that `positionsAt` in the backfill does not
  filter superseded lots; check whether that matters for open positions.
- `backfill:history` already runs on every refresh (`scripts/refresh.mjs`),
  so one prod refresh fills past rows.

## Owner scope

`position_snapshots` uses the same stock views as `portfolio_snapshots`, so
the snapshot-sum invariant holds by construction. Self-only is guaranteed by
the data, not by a filter: if a child ever gets a taxable or ISA securities
account, both tables (and the chart's past stock points) would include it
while today's point would not. Add a validation check that warns when any
row in those three views has a non-self owner, so that change surfaces
instead of silently skewing the breakdown.

## Left to the builder

- Exact component split (`RangeBreakdown` server component + a small client
  wrapper for the chart drag), file names, N.
- Whether the panel lives inside the trend card or after it.
- Migration handling for older databases without the table (follow the
  existing `hasTable` / optional-column pattern: no table means no panel,
  with a note).
- Tests: decomposition unit tests (buy-only, sell-only, round trip inside the
  period, missing price), the sum-equals-investment-result test, the
  snapshot sum invariant, and URL/param handling.
