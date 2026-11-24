# Daily Snapshots and the Day's Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The /holdings charts show a point per weekday for ranges up to 1Y, and a new section shows each market's change since the previous close with the securities that drove it.

**Architecture:** `backfill:history` adds a weekday window (last 365 days) to the month-ends it already rebuilds from lots, daily closes and daily FX. Readers outside /holdings filter back to one date per month so their charts are unchanged. The market-mix chart moves onto `position_snapshots` with the `rowMarket` remap. The day's change is a pure function over holding rows joined to their previous close, rendered as a card above the market-mix chart.

**Tech Stack:** Next.js (app router, server components), TypeScript, Node scripts (`.mjs`), better-sqlite3, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-daily-snapshots-and-day-change-design.md`

## Global Constraints

- Repository text is English; Korean appears only as UI copy in `lib/ui-copy/pages/holdings.ts`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm ui:guardrails` pass before push (CI ratchets `ui:guardrails`: no stray English inside Korean copy, every date formatted with a language).
- No real amounts, dates or account numbers from the owner's data in code, tests, commits or PR text. Fixtures use invented tickers and round numbers.
- Every command on the ops host (`ssh ops-host`) needs the owner's confirmation first, diagnostics included. Never write the production database.
- Daily window: weekdays (Mon–Fri) from 365 days before the current snapshot date up to the day before it. Month-ends: unchanged.
- /holdings density: range `days <= 366` plots every stored date; longer ranges plot the last stored date of each month plus every date in the current month.
- Outside /holdings (Overview, /net-worth): the last stored date of each month only (today's behaviour).
- Top contributors: 5 up, 5 down.
- Performance budget: the daily window adds at most about 10 s to the price run on the ops host.

## Review Focus

1. A Toss-held US stock: past snapshot rows are keyed `KR`, today's holding is `US`. Expected: the 1M market-mix chart shows no one-day move from KR to US on its last day. Test in Task 4.
2. A market closed today (weekend or holiday). Expected: its session is the last trading date, the change is that session's move against the close before it, never zero. Test in Task 5.
3. A security bought today (quantity larger than yesterday's). Expected: the change is quantity × price change; the purchase itself is not a gain. Test in Task 5.
4. A Toss-held US ticker whose daily closes are stored under a different `market` than the holding. Expected: its previous close is still found. Test in Task 6.
5. One row in a market quoted a day older than the rest. Expected: it is left out of that market's change and counted in the gaps note. Test in Task 5.

---

### Task 1: Weekday window in the history backfill

**Files:**
- Create: `scripts/snapshot-dates.mjs`
- Modify: `scripts/backfill-portfolio-history.mjs` (replace `monthEnds` use and the final log line)
- Modify: `scripts/lot-valuation.mjs:35-55` (`latestPrice`, `fxRate`)
- Test: `tests/snapshot-dates.test.ts` (new), `tests/position-snapshots-backfill.test.ts`

**Interfaces:**
- Produces: `snapshotDates(firstDate: string, currentDate: string): string[]` — sorted, unique `YYYY-MM-DD` dates strictly before `currentDate`: every month-end on or after `firstDate`, plus every Mon–Fri date from `currentDate − 365 days` (not before `firstDate`) to `currentDate − 1 day`.

- [ ] **Step 1: Write the failing unit tests** in `tests/snapshot-dates.test.ts`:

```ts
test('month-ends before the window, weekdays inside it', () => {
  const dates = snapshotDates('2024-01-15', '2026-11-23')
  assert.ok(dates.includes('2024-01-31'))
  assert.ok(dates.includes('2025-06-30'))                // month-end before the window
  assert.ok(!dates.includes('2025-06-27'))               // weekday before the window
  assert.ok(dates.includes('2025-11-24'))                // Monday, first weekday in the window
  assert.ok(dates.includes('2026-11-20'))                // Friday
  assert.ok(!dates.includes('2026-11-21'))               // Saturday
  assert.ok(dates.includes('2026-02-28'))                // Saturday month-end is still written
  assert.ok(!dates.includes('2026-11-23'))               // current date belongs to the ingest
  assert.deepEqual(dates, [...new Set(dates)].sort())
})
test('the window never starts before the first lot', () => {
  assert.equal(snapshotDates('2026-11-18', '2026-11-23')[0], '2026-11-18')
})
```

- [ ] **Step 2: Run** `pnpm exec tsx --test tests/snapshot-dates.test.ts` — expected FAIL (module not found).

- [ ] **Step 3: Implement `snapshotDates` in `scripts/snapshot-dates.mjs`.** Move the existing `monthEnds` logic there unchanged and add the weekday window; compute in UTC as `monthEnds` does.

- [ ] **Step 4: Run** the same command — expected PASS.

- [ ] **Step 5: Add a backfill test** to `tests/position-snapshots-backfill.test.ts`, reusing the hand-built schema of `'a superseded realized lot is held once'`: one open US lot acquired `2026-01-05`, daily closes for `2026-11-16`…`2026-11-20` with distinct values, FX rows for the same dates, current snapshot `2026-11-23`. Assert `position_snapshots` has rows for `2026-11-16`…`2026-11-20` (each `market_value_krw` = quantity × that day's close × that day's rate), none for `2026-11-21`/`22`, and `portfolio_snapshots` has the same five dates plus the month-ends.

- [ ] **Step 6: Run** `pnpm exec tsx --test tests/position-snapshots-backfill.test.ts` — expected FAIL on the weekday rows.

- [ ] **Step 7: Use `snapshotDates` in the backfill** in place of `monthEnds`, and change the log line to `Backfilled ${dates.length} portfolio snapshot(s) (month-ends and the last year's weekdays) from ${firstDate} to ${currentDate}.`

- [ ] **Step 8: Replace the linear scans in `latestPrice` and `fxRate`** (`scripts/lot-valuation.mjs`) with a binary search over the already date-sorted arrays (`historicalPrices` and `historicalFxRates` are read `order by ... price_date`). Behaviour is identical: latest row with `price_date <= date`, `latestFx` fallback for FX.

- [ ] **Step 9: Run** `pnpm exec tsx --test tests/position-snapshots-backfill.test.ts tests/position-snapshots.test.mjs tests/portfolio-snapshot.test.mjs` — expected PASS.

- [ ] **Step 10: Commit**

```bash
git add scripts/snapshot-dates.mjs scripts/backfill-portfolio-history.mjs scripts/lot-valuation.mjs tests/snapshot-dates.test.ts tests/position-snapshots-backfill.test.ts
git commit -m "Rebuild a weekday snapshot for each of the last 365 days"
```

### Task 2: Fresh daily closes in the price run

**Files:**
- Modify: `scripts/refresh-history.mjs:4-12`
- Test: `tests/market-hours.test.ts:54`

- [ ] **Step 1: Add `'fetch:historical-prices'`** to the asserted list on `tests/market-hours.test.ts:54`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/market-hours.test.ts` — expected FAIL naming `fetch:historical-prices`.
- [ ] **Step 3: Add `'fetch:historical-prices'` to `PRICE_ONLY_STEPS`.** `refresh.mjs` keeps step order from its own `steps` list, where this step already precedes `ingest`; confirm that by reading `scripts/refresh.mjs` around line 120.
- [ ] **Step 4: Run** the same test — expected PASS.
- [ ] **Step 5: Commit** `git commit -am "Fetch daily closes in the half-hourly price run"`

### Task 3: Snapshot date density, and month-ends outside /holdings

**Files:**
- Create: `lib/snapshot-density.ts`
- Modify: `lib/adapters/portfolio-db.ts` (`getPortfolioSnapshots` at 1099, `getSnapshotDates` at 1593)
- Test: `tests/snapshot-density.test.ts` (new), `tests/position-snapshots-adapter.test.ts` (adapter cases)

**Interfaces:**
- Produces: `lastPerMonth(dates: readonly string[]): string[]` — sorted unique dates, keeping the last date of each `YYYY-MM`.
- Produces: `holdingsChartDates(dates: readonly string[], rangeDays: number): string[]` — all sorted unique dates when `rangeDays <= 366`; otherwise `lastPerMonth` plus every date in the newest month.
- Produces: `getPortfolioSnapshots(days?: number, options?: { daily?: boolean }): PortfolioSnapshot[]` and `getSnapshotDates(days?: number, options?: { daily?: boolean }): string[]` — without `daily: true`, rows/dates are filtered through `lastPerMonth` (after `withCumulativeRealized`, so cumulative values are unaffected).

- [ ] **Step 1: Write the failing tests** in `tests/snapshot-density.test.ts`:

```ts
const dates = ['2025-10-31', '2025-11-28', '2025-11-30', '2026-11-19', '2026-11-20', '2026-11-23']
test('lastPerMonth keeps one date per month, today included', () => {
  assert.deepEqual(lastPerMonth(dates), ['2025-10-31', '2025-11-30', '2026-11-23'])
})
test('short ranges keep every date', () => {
  assert.deepEqual(holdingsChartDates(dates, 365), dates)
})
test('long ranges keep month-ends and the whole current month', () => {
  assert.deepEqual(holdingsChartDates(dates, 730), ['2025-10-31', '2025-11-30', '2026-11-19', '2026-11-20', '2026-11-23'])
})
```

- [ ] **Step 2: Run** `pnpm exec tsx --test tests/snapshot-density.test.ts` — expected FAIL.
- [ ] **Step 3: Implement both helpers** in `lib/snapshot-density.ts`.
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Write adapter tests** in `tests/position-snapshots-adapter.test.ts` (follow its existing temp-DB setup): a DB with `portfolio_snapshots` rows on `2026-10-30`, `2026-10-31`, `2026-11-20`, `2026-11-23`. `getSnapshotDates(3650)` returns `['2026-10-31', '2026-11-23']`; `getSnapshotDates(3650, { daily: true })` returns all four; same pair of assertions for `getPortfolioSnapshots(...).map((r) => r.snapshot_date)`.
- [ ] **Step 6: Run** `pnpm exec tsx --test tests/position-snapshots-adapter.test.ts` — expected FAIL.
- [ ] **Step 7: Add the `options` parameter and default filter** to both adapters.
- [ ] **Step 8: List every caller** with `command grep -rn "getPortfolioSnapshots\|getSnapshotDates" app lib scripts` and confirm none outside /holdings passes `daily: true` (Overview `app/page.tsx`, `app/net-worth/page.tsx`, `scripts/write-briefing-summary.ts`, any other hit). `getTotalAssetsSeries` reads `portfolio_snapshots` itself (`portfolio-db.ts` ~1630) but only at the dates it is given, so it needs no change; confirm that by reading it.
- [ ] **Step 9: Run** `pnpm test` — expected PASS (existing Overview / net-worth tests unchanged).
- [ ] **Step 10: Commit** `git commit -m "Keep one snapshot per month outside /holdings"` (with the new files added).

### Task 4: /holdings charts on daily points, markets matched to today

**Files:**
- Modify: `lib/market-mix.ts` (replace the snapshot input of `marketMixSeries`)
- Modify: `lib/position-shares.ts:35-41` (remove `shareDates`; callers use `holdingsChartDates`)
- Modify: `app/holdings/page.tsx:290-312`
- Modify: `lib/ui-copy/pages/holdings.ts` (`mix.info`, `weights.info`, and the English copy beside them if the file holds both languages)
- Test: `tests/market-mix.test.ts`, `tests/position-shares.test.ts`

**Interfaces:**
- Consumes: `holdingsChartDates` (Task 3), `rowMarket(market, ticker, held)` (`lib/position-shares.ts:51`), `getPositionTrendRows(days)` (`portfolio-db.ts:1190`).
- Produces: `marketMixSeries(rows: readonly { date: string; market: string; ticker: string; marketValueKrw: number | null }[], dates: readonly string[], holdings: readonly { market: string; ticker: string; base_market_value: number | null }[], today: string): MixPoint[]` — per date in `dates` before `today`, each row's value is added to `rowMarket(row.market, row.ticker, held)` where `held` maps ticker → markets held now; a row with `marketValueKrw` null is skipped (the market stays null if nothing valued it); today's point from `holdings` exactly as now. `mixShares` and `mixSummary` unchanged.

- [ ] **Step 1: Rewrite `tests/market-mix.test.ts`'s first two cases** for the new input and add:

```ts
test('a Toss-held US stock stays in US on past points', () => {
  const rows = [
    { date: '2026-11-20', market: 'KR', ticker: 'TSLA', marketValueKrw: 100 },
    { date: '2026-11-20', market: 'KR', ticker: '005930', marketValueKrw: 50 },
  ]
  const holdings = [
    { market: 'US', ticker: 'TSLA', base_market_value: 110 },
    { market: 'KR', ticker: '005930', base_market_value: 55 },
  ]
  const points = marketMixSeries(rows, ['2026-11-20'], holdings, '2026-11-23')
  assert.deepEqual(points.map((p) => [p.date, p.KR, p.US]), [['2026-11-20', 50, 100], ['2026-11-23', 55, 110]])
})
```

- [ ] **Step 2: Run** `pnpm exec tsx --test tests/market-mix.test.ts` — expected FAIL.
- [ ] **Step 3: Implement the new `marketMixSeries`.**
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Replace `shareDates` tests** in `tests/position-shares.test.ts` with a call through `holdingsChartDates` (or delete them if Task 3's tests cover the same cases), then remove `shareDates`.
- [ ] **Step 6: Wire the page**: fetch `getPositionTrendRows(trendRangeDays(mixRange.days))` once, compute `chartDates = holdingsChartDates(rows.map((r) => r.date), trendRangeDays(mixRange.days))`, pass it to both `marketMixSeries` and `positionShares`. Drop the `getPortfolioSnapshots` import if unused.
- [ ] **Step 7: Update copy.** `mix.info`: points are each weekday for periods up to one year and each month-end for longer ones, the last point is today's holdings, filters do not apply. `weights.info`: same density sentence in place of "지난 달까지는 월말 값, 이번 달은 스냅샷마다의 값". Keep the existing tone; no English words inside the Korean strings.
- [ ] **Step 8: Run** `pnpm test && pnpm typecheck && pnpm ui:guardrails` — expected PASS.
- [ ] **Step 9: Commit** `git commit -am "Plot daily points on the /holdings charts and keep Toss US stocks in US"`

### Task 5: The day's change, as a pure function

**Files:**
- Create: `lib/day-change.ts`
- Test: `tests/day-change.test.ts`

**Interfaces:**
- Produces:

```ts
export type DayChangeRow = {
  market: string; ticker: string; name: string; currency: string; quantity: number
  price: number | null; quoteDate: string | null; fxNow: number | null
  prevClose: number | null; prevCloseDate: string | null; prevFx: number | null
}
export type MarketDayChange = { market: 'KR' | 'US' | 'CRYPTO'; session: string; changeKrw: number; prevValueKrw: number; pct: number | null }
export type DayContributor = { market: string; ticker: string; name: string; changeKrw: number; pricePct: number | null }
export type DayChange = {
  markets: MarketDayChange[]           // in KR, US, CRYPTO order; a market with no counted row is absent
  total: { changeKrw: number; pct: number | null } | null
  up: DayContributor[]                 // largest positive first, at most 5
  down: DayContributor[]               // most negative first, at most 5
  excluded: number                     // rows left out
  usdKrw: { now: number; prev: number; prevDate: string } | null  // from the counted US rows
}
export function dayChange(rows: readonly DayChangeRow[], limit?: number): DayChange  // limit defaults to 5
```

Rules: a market's `session` is the newest `quoteDate` among its rows. A row counts when price, prevClose, quoteDate and prevCloseDate are present, `quoteDate === session`, and for a non-KRW row both FX values are present (KRW rows use 1). `changeKrw = quantity × (price × fxNow − prevClose × prevFx)`; `prevValueKrw = quantity × prevClose × prevFx`; `pct = changeKrw / prevValueKrw × 100` (null when `prevValueKrw` is 0). Contributors sum counted rows per `market:ticker`; `pricePct = (price / prevClose − 1) × 100`; zero changes are in neither list. Every other row adds 1 to `excluded`.

- [ ] **Step 1: Write the failing tests** in `tests/day-change.test.ts`, each with invented tickers:
  - `'a KRW row: change is quantity times price move'` — 10 × (110 − 100) → `changeKrw 100`, `pct 10`.
  - `'a USD row folds in the FX move'` — qty 1, 10 → 11 USD, fx 1000 → 1100: `changeKrw 2100`, `usdKrw { now: 1100, prev: 1000, prevDate }`.
  - `'a purchase today is not a gain'` — qty 20 (doubled today), price unchanged: `changeKrw 0`.
  - `'a closed market reports its last session'` — US rows quoted `2026-11-20` (Friday), prev `2026-11-19`; `session === '2026-11-20'`, `changeKrw` non-zero.
  - `'a row quoted a day older is excluded'` — two KR rows, one `quoteDate` a day older: only the newer counts, `excluded === 1`.
  - `'rows missing a price or a previous close are excluded'` — `excluded` counts them, totals unaffected.
  - `'contributors sum accounts and cap at five each way'` — same ticker in two rows sums; seven gainers → `up.length === 5`, sorted.
  - `'total sums markets'` — total `changeKrw` = sum, `pct` against summed `prevValueKrw`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/day-change.test.ts` — expected FAIL.
- [ ] **Step 3: Implement `dayChange`.**
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `git add lib/day-change.ts tests/day-change.test.ts && git commit -m "Compute the change since the previous close per market"`

### Task 6: Reading the day's change inputs

**Files:**
- Modify: `lib/adapters/portfolio-db.ts` (new reader next to `getPositionTrendRows`)
- Test: `tests/day-change-adapter.test.ts` (new; temp DB set through `config.stockDbPath` as in `tests/supplementary-coverage.test.ts:160-175`)

**Interfaces:**
- Consumes: `DayChangeRow` (Task 5).
- Produces: `getDayChangeRows(): DayChangeRow[]` — one row per row of the `holdings` view with `quantity != 0`: `price = native_price`, `quoteDate = as_of_date`, `fxNow = fx_rate_to_base`, `prevClose`/`prevCloseDate` = the latest `historical_prices` row for the ticker with `price_date < as_of_date`, preferring `market = holdings.market` and otherwise any market whose `currency` equals the holding's, `prevFx` = latest `historical_fx_rates.rate` with `price_date <= prevCloseDate` (null for KRW rows is fine; Task 5 uses 1). Returns `[]` when a table is missing.

- [ ] **Step 1: Write the failing tests**: (a) a KR row with closes on the day before and two days before its quote date returns the day-before close; (b) a `US` holding `TSLA` whose closes are stored under `market = 'KR'`, `currency = 'USD'` still gets its previous close; (c) a close dated on the quote date itself is not used as the previous close; (d) `prevFx` is the rate on or before `prevCloseDate`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/day-change-adapter.test.ts` — expected FAIL.
- [ ] **Step 3: Implement `getDayChangeRows`** (one query with correlated subqueries; use the `idx_historical_prices_lookup` index order `market, ticker, price_date`).
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `git commit -m "Read holdings with their previous close for the day's change"` (with the new test added).

### Task 7: The day's change section on /holdings

**Files:**
- Create: `components/DayChangeCard.tsx`
- Modify: `app/holdings/page.tsx` (render above the market-mix `Card` at ~line 426)
- Modify: `lib/ui-copy/pages/holdings.ts` (new `dayChange` block)
- Test: `tests/copy-registry.test.ts` passes; visual check below.

**Interfaces:**
- Consumes: `getDayChangeRows()` (Task 6), `dayChange(rows)` (Task 5), existing `Card`, money/percent formatters the market-mix card already uses (`fmtPct`, `convertMoney` with `currencyPreferences`), and `marketColor`.

- [ ] **Step 1: Add copy** under `dayChange` in `lib/ui-copy/pages/holdings.ts`: title (the day's change), info (change since each market's previous close, on today's quantities, so buys and sells today are not counted; filters do not apply), per-market row label using `mix.markets`, total label, session label function taking a formatted date, USD/KRW note function, `up` and `down` list headings, excluded note function taking a formatted count, empty state.
- [ ] **Step 2: Build `DayChangeCard`** (server component, props `{ change: DayChange; copy; display helpers }`): a row per market with its colour dot, KRW change in the display currency, signed percent and session date; a total row; the USD/KRW note under the US row; two short lists (up, down) with name, market, change and price percent; the excluded note when `excluded > 0`; the empty state when `markets` is empty. Follow `workspace-governance/docs/ux/guidelines.md` for gain/loss colours and date formatting.
- [ ] **Step 3: Render it** in `app/holdings/page.tsx` above the market-mix card with `dayChange(getDayChangeRows())`.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck && pnpm lint && pnpm ui:guardrails` — expected PASS. If `pnpm lint` fails only because of the worktree, apply the workaround in memory "Worktree lint and env".
- [ ] **Step 5: Visual check** with the dev server on sample data and an explicit USD/KRW rate (local dev has no FX rate): /holdings shows the card above the charts, the 1M range shows daily points, 2Y looks as before. Take a screenshot.
- [ ] **Step 6: Commit** `git commit -m "Show the day's change and its top movers on /holdings"` (with the new component added).

### Task 8: Rollout check (with the owner's confirmation for each ops-host command)

- [ ] **Step 1: Measure** before merge on a throwaway copy of the production DB on the ops host (recipe in memory "Prod throwaway ingest"): time `node scripts/backfill-portfolio-history.mjs` on `main` and on this branch. If the difference exceeds about 10 s, add the incremental rebuild (keep stored weekday rows and recompute only dates on or after the earliest changed lot or close) before merging, with a backfill test that an unchanged second run rewrites no rows.
- [ ] **Step 2: After merge and redeploy**, read `logs/refresh-prices-cron.log` for the next run's duration and query `portfolio_snapshots` read-only for weekday rows over the last year.
- [ ] **Step 3: Check /holdings** on production: 1M ends at today with daily points, 2Y unchanged, and two or three securities' day change match a hand calculation.
