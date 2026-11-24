# Daily snapshots and the day's change

**Status:** 2026-11-23. Approach chosen by the owner (A1 + B2). Calls marked *(builder's call, made in design)* were made while writing this and can be corrected in review.

## Why

On a day both the Korean and US markets rallied, the /holdings market-mix chart barely moved. The data was not stale: the half-hourly price refresh had run, and today's point already carried the day's move. The chart could not show it, for two reasons:

1. `portfolio_snapshots` holds only month-end rows plus today. The ingest keeps earlier rows, but `backfill:history` deletes every snapshot before the current date and rebuilds month-ends only (`scripts/backfill-portfolio-history.mjs`, the `rebuild` transaction). The same delete empties `position_snapshots`, so the security-weight chart's promise that "this month is per snapshot" is never met either.
2. With only month-end points, the segment into today's point is weeks of net change, and a one-day move of a few percent is invisible at the chart's scale.

The owner wants two different things, and they do not have to share a chart:

- **The last few weeks' trend**, read from the existing charts.
- **Today's change**: how much each market moved since the previous close, and which securities drove it.

## Goals

- The /holdings market-mix and security-weight charts show one point per weekday for ranges up to 1Y.
- A new "today's change" section on /holdings shows, per market and in total, the change since the previous close, plus the securities that contributed most up and down.
- Past daily points exist right after deploy (rebuilt from lots and daily closes), not only from the deploy date on.

## Non-goals

- Intraday points (more than one point per day) in the charts.
- Changing how month-end values or today's live point are computed.
- Splitting today's change into price effect and FX effect per security.
- Daily points on Overview and /net-worth charts (they stay month-end plus today).

## Anti-goals

- A purchase or deposit made today must never read as a gain. Today's change is a price change on the quantity held now, not a change in total value.
- The half-hourly price run must not become slow enough to overlap the next run or to hold the refresh lock for long.
- A market that has not traded yet today must not show a zero change as if it were flat; it shows its last session's change, labelled with that session's date.

## Approaches considered

| | What | Trade-off | Decision |
| --- | --- | --- | --- |
| A1 | `backfill:history` also rebuilds daily points for a recent window from lots, daily closes and daily FX, as it already does for month-ends. | One consistent valuation method; the past year is filled immediately; costs more backfill time. | **Chosen** |
| A2 | Stop deleting the ingest's observed snapshots and let them accumulate. | Cheap, but empty before the deploy date, and points are captured at whatever time a refresh ran (Korean intraday mixed with closes). | Rejected |
| B1 | A one-line per-market summary of today's change. | Small, but does not say why the total moved. | Folded into B2 |
| B2 | B1 plus the top contributing securities up and down, by KRW contribution. | Slightly larger section; same inputs. | **Chosen** |

## Design

### A. Daily points in the snapshot tables

**Dates.** The backfill writes:
- every month-end from the first lot to the current date (unchanged), and
- every weekday (Mon–Fri) from 365 days before the current date up to the day before the current date. *(builder's call, made in design: weekdays rather than calendar days, so weekends do not add flat plateaus to the stock charts; holidays stay as flat points, which is acceptable.)*

The current date's row is still the ingest's live snapshot and is left alone, as today.

**Valuation.** Each daily point uses the same path as month-ends: `valuedPositionsAt(date)` from `createLotValuer`, then `valuePortfolio`, and `writePositionSnapshots` for the per-security rows. No new valuation code.

**Storage.** Daily rows go into the existing `portfolio_snapshots` and `position_snapshots` tables.

**Which charts go daily.** Only the two /holdings charts (market mix and security weights) plot daily points. Every other reader of the snapshot tables (Overview, /net-worth, `getSnapshotDates`, `getTotalAssetsSeries`) keeps plotting month-ends plus today, by filtering the dates it reads. *(builder's call, made in design: the total-assets series combines stock values with cash and pension values stated on statement dates; on mid-month dates a stock buy and the cash that paid for it can fall on different dates and read as a false swing. Making those charts daily needs its own design.)* List every reader before building and confirm each one either filters or is one of the two /holdings charts.

**Chart density rule on /holdings.** One shared helper decides which snapshot dates the two /holdings charts plot *(builder's call, made in design)*:
- range of 1Y or shorter (1M, 3M, 6M, YTD, 1Y): every stored date;
- range longer than 1Y: month-ends, plus every date in the current month, plus today.

It replaces the month-end filter in `shareDates` (`lib/position-shares.ts`). Long-range charts then look as they do today, and a 2Y chart does not mix a dense last year with a sparse earlier one.

**Market assignment must match today's point.** Past points are rebuilt from tax lots, which key a security by the lot's market; today's point comes from `holdings`. Known case: US stocks bought through Toss are `KR` in lots and `US` in holdings. With daily points that mismatch would show as a one-day jump from KR to US on the last day of every 1M chart. The market-mix chart therefore stops reading the per-market columns of `portfolio_snapshots` and sums `position_snapshots` per security, assigning each row's market with `rowMarket` (`lib/position-shares.ts`), the rule the security-weight chart already uses. *(builder's call, made in design: this fixes it in the reader, so the snapshot writer and the month-end values stay as they are.)* A test pins it: a Toss-held US security valued yesterday and today lands in US on both points.

**Copy.** The security-weight chart's info text ("month-ends up to last month, per snapshot this month") and the market-mix info text change to describe the rule above. Korean UI copy lives in `lib/ui-copy/pages/holdings.ts`.

**Fresh daily closes in the price run.** `PRICE_ONLY_STEPS` (`scripts/refresh-history.mjs`) runs `backfill:history` but not `fetch:historical-prices`, so between full runs yesterday's point and the previous close can be up to six hours old. Add `fetch:historical-prices` to the price run. *(builder's call, made in design: the step took well under a second in the measured full run.)*

**Performance budget.** The backfill runs in both the six-hourly full refresh and the half-hourly price run. Measure it on the ops host before and after. If the daily window adds more than about 10 seconds to the price run, rebuild the daily window incrementally (keep stored daily rows and recompute only dates on or after the earliest changed lot or close), or skip the window when its inputs are unchanged. Which to ship is left to the builder, as long as the budget holds.

### B. The "today's change" section

**Placement.** A new section on /holdings above the market-mix chart, titled in Korean as the day's change. Like the charts below it, it ignores the table's search and filters and always covers all holdings. *(builder's call, made in design)*

**Per-security change.** For each holding row with a current price:
- `previous close` = the latest `historical_prices.close` for that market and ticker dated strictly before the date of the current price quote;
- `change (native)` = quantity × (current price − previous close);
- `change (KRW)` = quantity × (current price × today's USD/KRW − previous close × the previous close date's USD/KRW from `historical_fx_rates`) for USD rows, and the native change for KRW rows.

Using the current quantity for both sides means today's buys and sells never count as gains or losses (anti-goal above). Rows of the same security across accounts are summed, as the security-weight chart already does.

**One session per market.** Each market's session is its newest quote date among its rows. Only rows quoted on that date count toward the market's change and the contributors. A row with an older quote (a stale or fallback price, or a row valued from another source) is left out and counted in the gaps note, so one market's "today" never mixes two sessions. *(builder's call, made in design)*

**Market summary.** One row per market (Korean stocks, US stocks, crypto) and a total row:
- change in KRW, and the percentage against the previous-close KRW value of the same rows;
- the session the change belongs to: the quote date (and time where the price file carries it). A market closed today shows its last session's change with that date, never zero.
- a short note under the US row with the USD/KRW move since the previous close, since the KRW change includes it.

**Top contributors.** The five securities with the largest positive KRW change and the five with the largest negative, each with name, market, change in KRW and price change in percent. Fewer are shown when fewer moved. *(builder's call, made in design: five each way)*

**Gaps.** Rows with no current price or no previous close are left out, and a note says how many. Crypto's daily closes can lag a day behind (the latest crypto close on the ops host was a day older than the stock closes on 2026-11-23); in that case crypto's previous close is still the last close before the quote date, which can span two days, and the session date shown makes that visible.

**Where it is computed.** A pure function (like `lib/market-mix.ts`) takes holdings, previous closes and FX and returns the summary and contributors, so it is tested without a database. The adapter that fetches previous closes and the quote date lives with the other readers in `lib/adapters/portfolio-db.ts`.

## Constraints

- Repository text is English; Korean appears only as UI copy data.
- Run `pnpm ui:guardrails` before pushing (CI ratchets it; Korean copy must not contain stray English and dates must carry a language).
- Currency conversion never runs in a worktree without a rate; test the KRW change with an explicit USD/KRW rate in fixtures.
- Production commands on the ops host need the owner's confirmation each time, diagnostics included.
- No real amounts or dates from the owner's data in commits, PR text or tests.

## Rollout

1. Merge and redeploy. The next refresh rebuilds the daily window.
2. On the ops host (with confirmation), check the price run's duration in `logs/refresh-prices-cron.log` against the budget, and that `portfolio_snapshots` holds weekday rows for the last year.
3. Open /holdings: 1M shows daily points ending today; 2Y looks as before; the day's change section matches a hand check of two or three securities.

## Left to the builder

- Full rebuild versus incremental rebuild of the daily window, within the performance budget.
- How the quote date (and time) reaches the page: from the price files or from columns already ingested.
- Visual layout of the section within the existing GUI rules (`workspace-governance/docs/ux/guidelines.md`).
- How each non-/holdings reader filters to month-ends plus today (in the adapter or at the call site).
