# Period change and daily change bars

**Status:** 2026-11-24. The owner asked for both change bases, with a recommendation; the recommendation below is the default. Calls marked *(builder's call)* were made while writing this and can be corrected in review.

## Why

The /holdings charts now plot a point per weekday, but a day's move is two or three percent of the total and reads as nearly flat on a stacked area that has to start at zero. The "today's change" card answers one day only. The owner wants to see:

- day-by-day moves under the market-mix chart, and
- the change over several periods (a week, a month, three months and longer), with stronger visuals than rows of numbers.

## Goals

- **Daily change bars** under the market-mix chart: one bar per plotted date, split by market, rising above or falling below zero. Same period buttons and dates as the chart.
- **A period change card** in place of "today's change": periods 1D, 1W, 1M, 3M, YTD and 1Y.
  - Two bases:
    - **Actual P&L** (default): what the market earned the portfolio, trades included.
    - **Holdings return**: how today's holdings moved over the period.
  - Visuals: market contributions as diverging bars, a start-to-end waterfall, top movers as diverging bars, and a sparkline of the period.
- The same period on /net-worth's range breakdown and on this card gives the same Actual P&L figures.

## Non-goals

- Changing the market-mix chart itself or its density rule.
- Intraday bars.
- Moving /net-worth's range breakdown onto /holdings.

## Anti-goals

- A purchase must never read as a gain. A bar or card that shows the plain change in value would show every buy as a rise, so Actual P&L subtracts money put in.
- The two bases must not be confused. Each view names its basis, and the calculation rules explain both.

## Approaches considered

| | What | Trade-off | Decision |
| --- | --- | --- | --- |
| A | Actual P&L: value change minus net purchases, realized gains included (`rangeBreakdown`) | Answers "what did the market earn me"; includes positions sold during the period | **Default** |
| B | Holdings return: today's quantities, price then against price now | Answers "how did what I hold now move"; ignores trades inside the period | **Offered as a toggle** |
| — | Plain change in value between two dates | Simplest, but every purchase reads as a gain | Rejected |

Why A is the default: it is the number that matches the account, it is the split /net-worth already uses, and it is what the daily bars must use anyway to avoid showing purchases as gains. B is a useful second view for "are my current picks working". It is cheap, because it reuses the day's-change machinery with an older reference date.

## Design

### Shared definitions

- **Period start.** The latest stored snapshot date on or before today minus the period (1W = 7 days, 1M = 1 calendar month, 3M = 3 months, YTD = 31 December of last year, 1Y = 1 year). Past points come from the weekday backfill within the last year and from month-ends before that.
- **Today's point.** Today's `position_snapshots` row, written by the ingest from current holdings at current quote-file prices, the same as the chart's last point.
- **Market of a row.** Snapshot rows are keyed by the lot's market. Each row is assigned with `rowMarket` (`lib/position-shares.ts`), so US stocks held at Toss count as US, as on the chart.

### Daily change bars (market-mix tab)

- **Data.** For each pair of consecutive dates the chart plots, `rangeBreakdown({ from, to, rows, realized, markets })` gives each security's market effect. These are summed per market after `rowMarket`. The rows are the chart's own `getPositionTrendRows` rows, and the realized gains come from one `getRealizedGains(firstDate, today)` read, split by date.
- **Units.** Won (display currency) by default, with a `%` view. The `%` view is a market's effect over the previous point's total value, shown per market, so a market's bar is its contribution to the day. The view follows the chart's existing amount / share toggle. *(builder's call)*
- **Chart.** A bar chart with positive and negative stacking (Recharts `stackOffset="sign"`), coloured by market and aligned to the area chart's dates. Hovering a bar shows the date, each market's effect and the total. It sits directly under the area chart in the same card.
- **Longer periods.** Beyond 1Y the chart plots month-ends, so each bar is a month's change. The axis label says "monthly" in that case.
- **Gaps.** A pair where `rangeBreakdown` reports unpriced securities still draws, without them, and the tooltip marks it. *(builder's call)*

### Period change card (holdings tab)

**Controls.** Period chips 1D · 1W · 1M · 3M · YTD · 1Y (`?chg=`, default 1D) and a basis toggle, Actual P&L / Holdings return (`?basis=`, default actual). Both follow the `LinkChip` / `ChipGroup` pattern the tabs already use. The table's search and filters do not apply.

**1D in both bases.** 1D stays the current live calculation (`dayChange(getDayChangeRows())`):

- Each market is measured against its own previous session.
- The price is the quote-file price.
- Today's quantity is used on both sides.

The two bases coincide for a day except for today's trades. The live rule is what makes Korean and US sessions line up, so it is kept.

**Actual P&L, 1W and longer.** `rangeBreakdown(start, today)` over position snapshots and realized gains gives:

- per market (after `rowMarket`): market effect, money in, value change
- per security: market effect, used for the top movers
- totals: start value, money in, market effect, end value. They satisfy start + money in + market effect = end, apart from unpriced securities, which are reported as an exclusion note.

**Holdings return, 1W and longer.** `dayChange` over rows from a generalised `getDayChangeRows({ referenceDate })`:

- **Previous close.** The `historical_prices` close on or before the reference date, in the holding's currency, with that date's FX. The quote file's own `previousClose` applies only to 1D.
- **Price.** The current price and quote date pair are unchanged.
- **Exclusions.** A holding bought after the period start is still included at today's quantity. The calculation rules say so; that is what this basis means.
- **Waterfall.** It shows start value, market effect and end value only, because money in is zero by definition.

**Visuals** (top to bottom):

1. **Headline.** The total effect in won and %, with the basis and the period dates.
2. **Waterfall.**
   - One horizontal bar runs from the start value to the end value.
   - In between are a segment per market's effect (market colour, pointing up or down) and a neutral segment for money in.
   - Labels sit under the segments. A text summary line goes with it for screen readers.
3. **Markets.** Per market, a diverging bar for its effect and the % of its start value.
4. **Sparkline.** The cumulative total market effect over the period's daily points, the same series as the daily bars. It is not shown for 1D.
5. **Top movers.** `DivergingBarList` with the five largest positive and the five most negative contributors, each linking to its position page.
6. **Notes.** The exclusion note, and the calculation rules disclosure, which now covers both bases.

### Calculation rules text

The card's disclosure (`dayChange.rules`, renamed `periodChange.rules`) and `docs/architecture/daily-snapshots-and-day-change.md` gain the period start, the two bases and the waterfall identity. Both change together, as today.

### Decisions from the builder check *(builder's calls)*

- **Market assignment.** Before every `rangeBreakdown` call, snapshot rows and realized gains are remapped with `rowMarket`, using the current holdings as the held map. Its rule for a ticker no longer held applies to fully sold securities: a KR row whose ticker has no digit is a US listing. Per-market figures on /holdings therefore follow the chart. Totals equal /net-worth's for the same dates. Per-market splits can differ from /net-worth, which groups by the lot's market; the calculation rules say so.
- **Today's point.** The daily bars, the period end value and the waterfall use today's `position_snapshots` row. The ingest writes that row in the same run as `holdings`, so it equals the chart's last point. With no row for today yet, the newest snapshot is the end, and the headline names its date.
- **1D and the last bar can differ.** The 1D card uses the live per-market sessions and today's quantities. The last daily bar is the snapshot pair and includes today's trades. This gap is accepted, and the rules text names it.
- **Short history.** When no snapshot exists on or before a period's start, the period starts at the earliest snapshot. The headline shows the actual dates, with a note that the record starts there. The chip stays available.
- **Headline is authoritative.** The headline and waterfall come from one `rangeBreakdown(start, end)`. The sparkline is the cumulative sum of the daily pairs, which can drop a security that was unpriced on an intermediate date. It shows shape and is not rescaled. When any pair in the period dropped a security, a note under the sparkline says so.
- **Holdings return reference.** The reference date is the stored period-start date, the same as Actual P&L. A holding with no close on or before it (listed or first priced later) is measured from its first close inside the period. A holding with no close in its own currency at all, such as crypto traded in won, is left out and counted in the exclusion note.

## Constraints

- Repository text is in English. The repository is public, so tests and documents carry no real amounts, quantities or dates from the owner's data.
- `pnpm ui:guardrails`, typecheck, lint and tests pass. Copy is Korean and English, with no stray English inside Korean strings.
- No new data fetching on the ops host. Everything reads tables and files the refresh already writes.
- The UX guidelines in `~/workspace/common/workspace-governance/docs/ux/guidelines.md` apply: the sign is printed and never carried by colour alone, and dates carry a language.

## Left to the builder

- The exact layout and breakpoints of the waterfall on narrow screens.
- Whether the daily-bars tooltip lists every market or only the non-zero ones.
- Caching: computing about 260 consecutive `rangeBreakdown` pairs per render is expected to be cheap. Measure it, and memoise per request only if it is not.
