# Daily snapshots and the day's change

How the /holdings charts get a point per weekday, and how the "today's change" card is calculated. This is the reference for the rules as built. The design that led here is `docs/superpowers/specs/2026-11-23-daily-snapshots-and-day-change-design.md`.

The card's own "how this is calculated" disclosure (`dayChange.rules` in `lib/ui-copy/pages/holdings.ts`) states the reader-facing rules from the "Day's change" section below. Change both together.

## Where the code lives

| Piece | File |
| --- | --- |
| Which dates the backfill writes | `scripts/snapshot-dates.mjs` (`snapshotDates`) |
| The backfill itself | `scripts/backfill-portfolio-history.mjs` |
| Price and FX lookups during the backfill | `scripts/lot-valuation.mjs` (`lastOnOrBefore`) |
| Which dates a chart plots | `lib/snapshot-density.ts` (`lastPerMonth`, `holdingsChartDates`) |
| Monthly filter for other pages | `lib/adapters/portfolio-db.ts` (`getPortfolioSnapshots`, `getSnapshotDates`, option `daily`) |
| Market-mix series | `lib/market-mix.ts` (`marketMixSeries`) |
| Day's change computation | `lib/day-change.ts` (`dayChange`) |
| Day's change inputs | `lib/adapters/portfolio-db.ts` (`getDayChangeRows`) |
| Card, on the holdings tab above the table | `components/DayChangeCard.tsx`, rendered by `app/holdings/page.tsx` |
| Market-mix and weights tabs | `app/holdings/MarketMixView.tsx`, `app/holdings/WeightsView.tsx` |

## Snapshot history

- `backfill:history` rebuilds `portfolio_snapshots` and `position_snapshots` for every month-end since the first lot, plus every weekday (Mon–Fri) from 365 days before the current snapshot date up to the day before it. The current date's row is the ingest's live snapshot and is not rebuilt.
- Daily points use the same valuation as month-ends: lots held on the date × that date's close (latest on or before it) × that date's USD/KRW.
- Holidays inside the window appear as flat points. Weekends do not appear.
- Yahoo leaves the newest daily bar's close empty for a while after a Korean session ends, while its `regularMarketPrice` already holds the settled price. The history fetch fills that bar from the market price once the session is over (`withSettledLastClose` in `scripts/settled-bars.mjs`) instead of dropping it. Before this, on 2026-11-23, most Korean stocks had no close for the session and the daily chart valued them at the close before it.
- The history fetch also refetches when Korean closes are stale: it skips only when the US session is covered and at least 90% of the Korean stocks traded in the last 30 days have the newest settled Korean session (`coveredKrSession`, `newestSettledKrSession`; the Korean bell is 06:30 UTC). Korean holidays are not known, so a holiday costs one extra refetch per full refresh.
- The backfill runs in both the six-hourly full refresh and the half-hourly price-only run. Daily closes (`fetch:historical-prices`) are fetched only by the full refresh. Its skip check fails several times a day and then refetches every ticker's full history one at a time, which would hold the refresh lock far too long for a half-hourly run. So a past day's point settles after the full refresh that stores that day's close.

## Which charts plot which dates

- On /holdings, the market-mix and weights tabs plot every stored date for periods of 366 days or less (1M, 3M, 6M, YTD, 1Y). Longer periods plot the last stored date of each month, and today is the current month's last date.
- Showing every date of the current month on long periods was dropped. On a categorical axis the dense current month crowded out the earlier months.
- Every other reader (Overview, /net-worth, briefing summaries) gets one date per month plus today, as before. `getPortfolioSnapshots` and `getSnapshotDates` filter by default. Only an explicit `{ daily: true }` returns daily rows, and no caller outside /holdings passes it.
- The total-assets series stays monthly on purpose. Cash and pension values are stated on statement dates, so on a mid-month date a stock purchase and the cash that paid for it can fall on different days and read as a false swing.

## Market assignment

Tax lots key a security by the lot's market, and Toss lots are always `KR`, even for US stocks. Live holdings use the listing country, so the same stock is `US`. The market-mix chart sums `position_snapshots` per security and assigns each row's market with `rowMarket` (`lib/position-shares.ts`). This is the rule the security-weight chart already used. A US stock held at Toss is therefore US on every point. Without it, each 1M chart showed a one-day move from KR to US on its last day.

The lot market is not changed at the source because tax planning reads it (`lib/tax-planning.ts`, Korean domestic scope). Splitting "account country" from "listing market" would be a separate project.

## Day's change

Rules, in the order the card's disclosure states them:

1. **Quantities.** Today's quantity is valued at the previous close and at the current price: change = quantity × (price × FX now − previous close × FX at the previous close). Shares bought or sold today never count as a gain or loss.
2. **One session per market.** A market's session is the newest quote date among its rows that can be valued, meaning a price, a previous close and, for a non-KRW row, both FX rates. A row that cannot be valued never moves the session. On a day a market has not opened, it shows that market's last session, never zero.
3. **Exclusions.** A row quoted older than its market's session, or missing a price, a previous close or a needed FX rate, is left out. The card shows the count of left-out rows. It counts rows, not securities.
4. **Price and date come as a pair.** The KR and US quote files hold the Toss Securities quote when it was struck inside that market's regular session and is newer than Yahoo's, and Yahoo's regular-session price otherwise, so NXT and US extended-hours trades never become the current price (`scripts/quote-sources.mjs`; design in `docs/superpowers/specs/2026-11-24-toss-yahoo-quotes-design.md`). Each entry says which (`source`) and keeps the other quote (`alternate`). When the market's quote file (refreshed every half hour) has the ticker, and the entry's currency matches the holding's where the entry states one, that entry's price and its `asOfDate` are used together. Otherwise the holding's own price is used. For a Toss row its date is the Toss snapshot's `fetchedAt` converted to the exchange's local date (Asia/Seoul for KR, America/New_York for US, UTC for crypto). For any other row it is `as_of_date`. A Toss holding can therefore show a different price on the card than in the table, which keeps Toss's own last price from the latest full refresh.
5. **Previous close.** The quote files store, next to each price, the close of the session before its `asOfDate` (`previousClose`, `previousCloseDate`), taken from the same five daily bars the price comes from. The card uses it when the entry has one. Without it, the previous close is the latest `historical_prices` close strictly before the quote date, in the holding's own currency. The holding's own market is tried first, then any market (through the index). Crypto closes are stored in USD for every venue, so crypto priced in won (for example on Bithumb) has no previous close and is left out. Converting a USD close to won would put the Korea premium into every day's change.
6. **FX.** The won change of a US row includes the dollar's move. Today's rate is the live quote (`fx_rate_to_base`) and the previous rate is the daily reference series (`historical_fx_rates`), so their usual small gap shows up every day. The note under the US row shows both rates.
7. **Contributors.** Rows of one security across accounts are summed. The five largest positive and the five most negative won changes are listed. Zero changes are not listed.
8. **Scope.** The card always covers every holding, whatever the table's search and filters.

## Decisions made during implementation

Each line says what was decided, and what it costs if it turns out wrong.

- The quote date comes from the quote file, not from `as_of_date`. Toss rows carry the UTC date of the fetch, which after 16:00 Pacific is a day ahead of the US quote. One such row would set the US session and drop every other US row. Cost if wrong: none found. A row missing from the quote file falls back as described in rule 4.
- Periods longer than 1Y plot month-ends only. Cost if wrong: 2Y and longer no longer show this month's intermediate days. 1M and 3M still do.
- Crypto priced in won is left out of the day's change. Cost if wrong: that crypto shows no day's change until won closes are stored.
- On the card, a Toss holding is priced from the quote file when the file has it. Cost if wrong: the card's price for that holding can differ from the table's Toss price by up to one full-refresh interval.
- Daily closes are not fetched in the price-only run. Cost if wrong: yesterday's chart point can lag by up to one full-refresh interval.
- The session comes only from rows that can be valued. Cost if wrong: none known.
- The fallback close lookup is written to use `idx_historical_prices_lookup`. Cost if wrong: none.

## Known gaps

- A Toss holding missing from the quote files, fetched on a weekend or holiday, is dated on a day with no session. It can then set its market's session, so that market reads about zero until the next weekday fetch. This is rare, because the quote files normally cover every held ticker.
- The same-currency fallback could match a same-ticker series stored under another market in the same currency. This has not been observed, because ticker namespaces do not overlap.
- The session time is not shown, only the date.
- /holdings reads `position_snapshots` twice per render: once for the table's 12-month trend column and once for the charts.
- The backfill writes about 350 dates instead of about 100 on production data (month-ends since the first lot plus the weekday window). Measured on 2026-11-23 against a throwaway copy of the production database, it took 0.54 s against 0.42 s before (0.49 s on a second run), well inside the 10-second budget for the half-hourly run. The month-end values it rebuilt matched the previous code's exactly.
