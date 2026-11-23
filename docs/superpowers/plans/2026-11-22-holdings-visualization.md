# /holdings visualization plan

Status: proposal, not started. Written 2026-11-22 against main `ba3bf20`, after
measuring the live page at 1695 px wide.

## Why

Two problems on `/holdings`:

1. **The table layout breaks.** It has 15 columns. At a 1695 px viewport the
   table needs 1687 px but its scroll container is 1406 px wide, and the last
   column, `cost_note` (사유), is the only one with neither `nowrap` nor a
   minimum width. The browser squeezes it to 46 px, the note wraps one or two
   characters per line, and each row grows to 169–367 px. A 134-row table
   becomes several screens of mostly empty rows.
2. **The page has no picture.** It is a filter bar, four totals, a freshness
   note and the table. Nothing shows how the portfolio is split between
   markets, which positions dominate, or how either has moved over time.
   The overview's total-assets chart answers that question for asset classes;
   nothing answers it for securities.

## What the data already supports

No new collection is needed for the first five phases.

| Question | Source | Granularity |
|---|---|---|
| KR / US / crypto value over time | `portfolio_snapshots` (`kr_market_value`, `us_market_value_base`, `crypto_market_value_base`) via `getPortfolioSnapshots` | every snapshot date |
| Each security's value over time | `position_snapshots` via `getPositionSnapshots(dates)` | month ends (backfill) + each ingest day |
| Current weights, gains, lots | `getHoldings` | today, per account |

Caveats the implementation must handle, each with a test:

- **Toss US securities are keyed by lot market.** `position_snapshots` rows
  for a Toss US stock are `KR:<ticker>`, while holdings call them US
  (see `positionLinkMarket` in `lib/range-breakdown-view.ts`). A per-market
  share chart that groups by the raw `market` column puts those stocks in the
  Korean band. Reclassify with the same rule before grouping.
- **Unpriced positions are null, not zero.** `market_value_krw` is null when
  any contributing account row was unpriced. Draw a gap, and exclude that date
  from share denominators rather than dividing by a partial total.
- **The denominator must be named.** These charts cover securities held at
  brokers, not total assets (no cash, pensions, gold). Every chart says
  "투자자산 대비" or "시장 내" in its title or axis, never a bare "%".
- **Past points are month ends.** The per-security chart is monthly until the
  latest month, which has daily points. Say so under the chart instead of
  interpolating.

## Phases

Each phase is one PR, in this order. V1 ships alone and first because it is a
bug fix.

### V1 — Fix the table layout (bug)

- Remove the `cost_note` column. It is derived one-to-one from `cost_status`
  (`copy.costNotes[cost_status]`), so it repeats the status column in a
  sentence. Move the sentence into the status badge: a `HelpPopover` next to
  the badge, or a one-line status legend under the table listing each status
  and its meaning once.
- ~~Guardrail: a minimum width on every wrapping column.~~ Dropped after
  measuring all 28 sidebar routes on production: `사유` was the only column
  whose rows collapsed, while a 96 px floor would have widened about 20
  short badge/word columns on ten other pages.
- Found while verifying, fixed in the same PR: a header's help panel inherited
  the header's `nowrap` and ran its text out of the panel as one line, and a
  centred panel on the last column hung past the table and widened its scroll.
  `HelpPopover` now sets `whitespace-normal`; `DataTable` opens the first and
  last columns' help inward (`tests/data-table-help-align.test.ts`). The three
  tax-quantity columns get `nowrap`, so their headers stop breaking per letter.
- Result on a local copy of the data at 1695 px: every row 62 px (was
  169–367 px). The table still scrolls sideways; V2 removes that.

### V2 — Make the table readable at a glance

Fewer, richer columns. Target: at most 10 visible columns at 1440 px with no
horizontal scroll.

- **Weight column (비중)** with an inline bar: position value / filtered total,
  bar coloured by market (`marketColor`). Sortable; the default sort stays by
  value, which now reads as a ranked bar list.
- **Merge native/base pairs** into one cell each: value in the position's
  currency on top, KRW underneath in `text-ink-3` (취득원가, 평가손익). Removes
  two columns.
- **Merge the tax columns** (장기, 단기, 세금 단위) into one 세금 단위 cell:
  "장기 12 · 단기 3" with the lot count beneath. Removes two columns.
- **Return column** keeps `Signed`, plus a small diverging bar around zero so
  the sign and size read without parsing the number.
- **12-month sparkline** of the position's KRW value from `position_snapshots`,
  in the instrument cell or its own narrow column. One batched query for all
  rows, not one per row.
- Optional grouping toggle: flat list / grouped by market with a subtotal row
  per market.

As built (2026-11-23):

- Eight columns from 1280 px (종목, 계좌, 비중, 취득원가, 평가금액, 평가손익,
  수익률, 12개월 추이), eleven from 2xl (1536 px), four on a phone. No
  sideways scroll at a 1374 px window.
- The market badge moved into the instrument cell. Quantity, tax lots and the
  status column are a new `wide` priority (`hidden 2xl:table-cell`). Below
  2xl a row whose own figures are incomplete (`missing_cost`, `unpriced`)
  shows its status badge under the name; `estimated` rows stay quiet, since
  only their tax-lot coverage is incomplete.
- Weight bars are drawn against the largest weight (said in the help), in the
  market's chart colour. The return bar fills its half at ±100% and saturates
  past it.
- The trend column reads `position_snapshots` through `getPositionTrendRows`
  and `lib/holdings-view.ts` (Toss US reclassification, null for an unpriced
  date, tested). It is left out when the table is missing, as in the local
  and sample databases; it was checked only against synthetic snapshots.
- `DataTable` help now opens leftward on any right-aligned column as well as
  the last one.
- Not done: the grouping toggle.

### V3 — Market mix trend (KR / US / crypto)

A chart card above the table, built like the overview's total-assets chart.

- Stacked area of KR, US and crypto value over time, with an
  **amount / share (100%)** toggle in the URL (`?mix=amount|share`), and the
  same range links as the overview (`TrendRangeLinks`: 3M, 1Y, 3Y, all).
- Tooltip lists each market's value and share and the total.
- Generalize `StackedAssetChart` rather than copying it: today it is typed to
  `AssetClass`. Extract a `StackedSeriesChart` that takes
  `series: { key, label, color }[]`, and keep `StackedAssetChart` as a thin
  wrapper so the overview and /net-worth do not change.
- Beside the chart, a current-split `ShareBar` with the three shares and how
  each moved over the selected range ("미국 54% · 기간 중 +6%p").

As built (2026-11-23):

- A card above the table: range links (`?trend=`, 2Y default, shared with the
  overview), an amount / share switch (`?mix=share`), the stacked chart, and
  under it the current split as a `ShareBar` with each market's share and its
  move in %p over the range. Both links keep the table's own filters and sort.
- Data: past `portfolio_snapshots` (KR, US base, crypto base), then today's
  point summed from the holdings rows, so the last point is the table's own
  total (`lib/market-mix.ts`, tested). The chart ignores the table filters
  and says so in its help.
- The share moves are in neutral ink, not gain/loss colours: a market gaining
  share is not good news in itself.
- `StackedAssetChart` is now a thin wrapper over `StackedSeriesChart`
  (`series: { key, label, color }[]`). Verified on the local database that the
  overview, /net-worth and /net-worth share view draw identical area paths,
  colours and legends before and after.

### V4 — Security weights over time (the Samsung / SK hynix question)

The chart that answers "how has each stock's weight changed".

- New adapter `getPositionShareSeries(dates, scope)` in
  `lib/adapters/portfolio-db.ts` (pure shaping in a `lib/` module with tests):
  reads `position_snapshots`, reclassifies Toss US rows, keeps the top N
  securities by latest value (N = 8) and folds the rest into 기타.
- Scope tabs: **전체 / 한국 / 미국 / 암호화폐**. Under 한국 the shares are of
  the Korean total (시장 내 비중); under 전체 they are of all securities.
- Default view: 100% stacked area, so a rising band is a rising weight.
  Alternative view: one line per security (weight %), better for comparing two
  names that do not touch in the stack. Toggle in the URL.
- Clicking a legend entry highlights that security and dims the rest; a chip
  row lets the reader pin specific names (for example Samsung Electronics and
  SK hynix) so they stay out of 기타 even when outside the top N.
- Colour: one hue family per market (blues for KR, greens for US, as the
  market badges use), stepped by rank, 기타 in neutral grey. Validate the
  palette with the dataviz checker in light and dark.

As built (2026-11-23), with the maintainer's choices: month-end points, a
fixed top 8, crypto inside 전체.

- A second card under the market mix, on the same `?trend=` period: scope
  chips 전체 / 한국 주식 / 미국 주식 / 가상자산 (`?wscope=`), 누적 or 선
  (`?wview=lines`), a share line per security with its move in %p, and
  따로 보기 chips (`?pin=KR:005930,…`) for up to twelve held securities that
  have no band, plus any already pinned.
- `lib/position-shares.ts` (tested): last snapshot of each past month and
  every snapshot of the newest month; Toss US rows folded into the US
  security, and a no-longer-held letters-only KR ticker counted as US; pins
  first, then the largest on the newest fully priced date, eight bands at
  most, the rest 기타. A date where any in-scope row is unpriced is blank for
  every band, never divided by a partial total.
- Colour changed from the plan: hue families per market would put two
  near-identical blues side by side. The bands use a validated eight-slot
  categorical palette instead (`--series-1..8` in `styles/globals.css`;
  CVD and normal-vision checks pass on the light and dark card surfaces;
  three light slots sit under 3:1, so the chart always has a legend, a
  tooltip and the table). Slots follow size on the newest date, so
  changing the scope or pins can repaint a security.
- Series keys are `s0…s7`: a ticker such as BRK.B is a nested path to
  recharts.
- Not done: dimming the other bands when one legend entry is clicked.

### V5 — Current composition and concentration

A compact row of three cards between the totals and the table.

- **Top holdings bar**: horizontal bars of the top 10 securities by weight
  (aggregated across accounts), coloured by market, each linking to its
  position page. Chosen over a treemap: easier to label in Korean and to read
  at 375 px.
- **Concentration KPIs**: top-5 share, top-10 share, and effective number of
  holdings (1 / Σ wᵢ²), each with its change over the selected range.
- **Gain contribution**: diverging horizontal bar of unrealized gain in KRW,
  top 5 contributors and top 5 detractors.

All three respect the filter bar (market, broker, account), so filtering to one
account recomputes them.

As built (2026-11-23):

- Three panels inside the holdings card, between the totals and the table, so
  they sit under the filters they follow (search included): the ten largest
  positions as a ranked bar list in market colours, concentration (top 5,
  top 10, effective number of holdings, and a top 5 / next 5 / rest bar), and
  the five largest unrealized gains and losses in KRW on one diverging scale.
- `lib/holdings-composition.ts` (tested) sums each security across accounts;
  a position with any unpriced account row is left out of weights rather than
  counted at a partial value. `components/RankedBars.tsx` holds the two bar
  lists, server-rendered.
- Changed from the plan: the concentration figures show today only, with no
  change over the selected range. The snapshots are per security across
  accounts, so a past value cannot follow a broker or account filter, and a
  change that silently ignored the filter would contradict the figure beside it.

### V6 — What changed between two dates

- A "비중 변화" table: for a chosen range (reuse the /net-worth range
  selection and drag-to-select), each security's weight at start and end, the
  change in %p, and whether it came from price or from buying/selling
  (quantity change × start price vs the rest). Top movers first.
- Drag-to-select on the V3/V4 charts sets this range, the way /net-worth does.

As built (2026-11-23):

- A card under the security weights: the period (`?from=&to=`, snapped to the
  weights chart's dates by `resolveRangeSelection`; the whole plotted window
  when absent), date selects (`RangeSelectForm`), and a table of the fifteen
  largest share moves in the weights card's scope: start and end share, the
  move in %p (neutral ink and a neutral diverging bar), value change, and its
  trading and price parts.
- Trading is the quantity change at the start price, (q₁ − q₀) × v₀ / q₀; price
  is the rest, FX included. A new position is all trading, a sold-out one all
  trading the other way; a split reads as trading (said in the help).
  `lib/weight-changes.ts`, tested.
- Either date with an unpriced in-scope row gives a notice instead of the
  table, for the same reason as V4.
- Drag-to-select is on the V4 stacked chart only, whose dates the table uses.
  The V3 chart plots portfolio snapshot dates and is left without it.

## Follow-up after deploy: unpriced positions (2026-11-23)

On the production data the V4 chart had two plotted dates and the V6 table
never showed: three bonds held through a Korean broker carry no month-end
price from 2024-03 to 2026-09 (at most 2.2% of cost, about 0.05% since
2026-03), and the "blank the whole date" rule above turned that into an empty
chart. The rule is replaced:

- V4: a security with no price on a date is left out of that date only; its
  band is a gap there, the other shares are of the priced total, and a note
  under the chart gives how many dates, up to how many positions and at most
  what share of cost were left out. A date with nothing priced stays blank.
- V6: a security unpriced on either date is left out of both dates, so the
  two shares compare the same set, with a note giving the count and cost share.
- Valuing those bonds at month ends (a pipeline change) is left for later.

## Layout after V5

1. Header + freshness (unchanged)
2. Market mix trend (V3) — full width
3. Security weights over time (V4) — full width, scope tabs
4. Composition row (V5) — three cards, stacked on mobile
5. Filter bar + totals + table (V1, V2)
6. Weight changes (V6)

If the page grows too long, split 2–4 and 6 into a `추이` tab and keep the
table as `목록`, using the existing `Tabs` component; decide after V4 lands.

## Gates for every phase

- `pnpm typecheck && pnpm lint && pnpm test && pnpm ui:guardrails && pnpm build`.
- All new copy in `lib/ui-copy/pages/holdings`, both languages.
- Screenshot net at 1440 and 375, light and dark; no sideways page scroll at
  375 px (the table may scroll inside its card).
- Charts render an empty state, not an empty axis, on a database without
  `position_snapshots`.

## Decisions for the maintainer

1. V4 granularity: accept month-end points for the past, or add a daily
   per-security backfill (ingest change, larger PR) before V4.
2. Top N in V4: 8 by default, or a reader-chosen number.
3. Whether crypto counts in "전체" shares in V4, or the 전체 view is stocks only.
4. Status note in V1: popover per badge, or one legend line under the table.
5. One long page, or a 목록 / 추이 tab split.
