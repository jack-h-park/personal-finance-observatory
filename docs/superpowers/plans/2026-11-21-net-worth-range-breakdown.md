# Net Worth Range Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drag-select a period on the `/net-worth` total-assets chart and get a breakdown of what changed: by class, and per security split into money put in and market effect.

**Architecture:** The month-end backfill persists the per-security positions it already computes into a new `position_snapshots` table; ingest writes today's rows (holdings value, lot cost). A pure decomposition in `lib/` turns two snapshot dates plus realized lots into per-security drivers. The page reads `?from=&to=`, the chart sets them by drag (a GET form is the touch/keyboard path), and a server component renders the panel.

**Tech Stack:** Next.js 15 server components, TypeScript, better-sqlite3, Recharts, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-net-worth-range-breakdown-design.md`

## Global Constraints

- Repo text (code comments, docs, commits, PR) in English; UI copy in Korean and English via `getPageCopy`.
- No real figures, dates or full account numbers from the maintainer's data in PR text or commit messages.
- Securities are aggregated across accounts by `(market, ticker)`; markets are `KR`, `US`, `CRYPTO`.
- Realized gains always skip rows with a non-empty `superseded_by` (same predicate as `withCumulativeRealized`: `coalesce(superseded_by, '') = ''`).
- Today's `position_snapshots` rows: `market_value_krw` from `holdings.base_market_value`, `cost_krw` from open `tax_lots.cost_basis_krw` — never `holdings.base_cost`.
- Selections snap to plotted snapshot dates; `from === to` (after snapping) is no selection.
- Amounts in the panel go through the page's `money` / `toDisplay` (display currency).
- Old databases without `position_snapshots`: no panel, a note instead (`hasTable` pattern).
- Before every push: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm ui:guardrails`.
- Never run commands on `ops-host` without asking the maintainer first.

## Review Focus

1. **Period ends today with a broker-vs-lot cost gap** — no security shows phantom money in; the gap appears once as the "cost basis difference" line. (Task 4 test `cost basis gap is named, not folded into money in`.)
2. **Security bought and sold entirely inside the period** — appears with value change 0, market effect = realized gain, money in = −realized. (Task 4 test `round trip inside the period`.)
3. **Selection outside the current `?trend=` window, or reversed (`from > to`)** — window widens to include it; reversed params are swapped, not rejected. (Task 5 tests.)
4. **Security unpriced at A or B** — excluded from bars, listed in the coverage note with its cost; sums still explained. (Task 4 test `unpriced security goes to coverage`.)
5. **Database without `position_snapshots` (older local DB, before the first prod refresh)** — page renders, panel replaced by a note, no crash. (Task 3 test `missing table returns empty`.)

---

### Task 1: Backfill persists per-security month-end rows

**Files:**
- Create: `scripts/position-snapshots.mjs`
- Modify: `scripts/backfill-portfolio-history.mjs` (inside the existing `rebuild` transaction)
- Modify: `scripts/ingest-stock-data.mjs:1441-1498` (schema: add `create table position_snapshots` next to `portfolio_snapshots`)
- Test: `tests/position-snapshots.test.mjs`

**Interfaces:**
- Produces: table `position_snapshots(id integer primary key, snapshot_date text not null, market text not null, ticker text not null, name text, quantity real not null, cost_krw real not null, market_value_krw real, unique(snapshot_date, market, ticker))`.
- Produces: `aggregatePositions(valued: {market, account, ticker, quantity, cost, marketValue|null}[], names: Map<string, string>): {market, ticker, name, quantity, cost_krw, market_value_krw|null}[]` — sums by `market:ticker`; `market_value_krw` is null if any contributing account row is null.
- Produces: `writePositionSnapshots(db, date, rows)` — `insert or replace` per row.

- [ ] **Step 1: Write failing tests** in `tests/position-snapshots.test.mjs`:
  - `aggregates accounts into one row per security`: two accounts of `KR:005930` (qty 3/2, cost 300/200, MV 330/220) → one row qty 5, cost 500, MV 550.
  - `an unpriced account makes the security unpriced`: one account MV null → row `market_value_krw === null`, cost still summed.
  - `names come from the map, ticker as fallback`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/position-snapshots.test.mjs` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `aggregatePositions` and `writePositionSnapshots` in `scripts/position-snapshots.mjs`; add the table DDL to ingest's schema block (ingest rebuilds the DB, so the table always exists after ingest).
- [ ] **Step 4: Wire into backfill.** In `rebuild`: `delete from position_snapshots where snapshot_date < ?` (currentDate) next to the existing delete; in the per-date loop call `writePositionSnapshots(db, date, aggregatePositions(valued, names))`. `names`: `select market, ticker, max(name) from tax_lots union realized_lots group by market, ticker`. Create the table with `create table if not exists` at backfill start for older DBs.
- [ ] **Step 5: Superseded lots — decide with data, then act.** The backfill's `realizedLots` query reads `realized_lots` with no `superseded_by` filter, so a 1099-B row and the replay row it replaced may both count as held before the sale. Ask the maintainer to approve one read-only prod query: `select count(*) from realized_lots where coalesce(superseded_by,'') != ''`. If nonzero, add the filter to the backfill query (this also corrects `portfolio_snapshots` history — say so in the PR) and add test `a superseded realized lot is held once`. If zero, add the filter anyway (cheap, future-proof) with the same test.
- [ ] **Step 6: Integration test** `backfill writes rows whose sums match portfolio_snapshots`: run the ingest harness (`runIngestWithOutput` + `writeScenario` as in `tests/snapshot-price-dates-ingest.test.ts`), then spawn `node scripts/backfill-portfolio-history.mjs` with `STOCK_DB_PATH=<out.dbPath>`; for every past date assert Σ KR+US `market_value_krw` (non-null) equals `kr_market_value + us_market_value_base` and Σ CRYPTO equals `crypto_market_value_base`, within 1 KRW.
- [ ] **Step 7: Run** `pnpm exec tsx --test tests/position-snapshots.test.mjs` — expect PASS.
- [ ] **Step 8: Commit** `Persist per-security month-end positions in the backfill`.

### Task 2: Ingest writes today's rows, carries history, checks owner scope

**Files:**
- Modify: `scripts/ingest-stock-data.mjs:915-926` (read previous `position_snapshots` like `previousPortfolioSnapshots`), `:1537` (carry forward rows with `snapshot_date < snapshotDate`), `:8261-8300` (today's rows), the `checks` array (owner check)
- Test: `tests/position-snapshots-ingest.test.ts`

**Interfaces:**
- Consumes: `aggregatePositions`, `writePositionSnapshots` (Task 1).
- Produces: today's rows at `snapshotDate`: per `(market, ticker)` of `stockOnly(holdingRows)`, `market_value_krw = Σ base_market_value` (null if any null), `quantity = Σ quantity`, `cost_krw = Σ open stock tax-lot cost_basis_krw` for that security (0 if no lots), `name` from holdings.
- Produces: validation check `stock_views_self_only` — severity `warning`, status fails when any row of `holdings`, `tax_lots`, `realized_lots` has `owner` not `self`; detail names the count, not accounts.

- [ ] **Step 1: Write failing tests** with the ingest harness:
  - `today's rows take value from holdings and cost from lots`: fixture holding → one row at today's date; `market_value_krw` equals the holding's `base_market_value`; `cost_krw` equals Σ its open lots' `cost_basis_krw`.
  - `previous rows survive a re-ingest`: run ingest twice with a hand-inserted past row between runs → past row still present.
  - `stock_views_self_only passes on the fixture`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/position-snapshots-ingest.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the three ingest changes and the check.
- [ ] **Step 4: Run** the test file — expect PASS; run `pnpm test` — expect no regressions.
- [ ] **Step 5: Commit** `Write today's per-security snapshot rows at ingest`.

### Task 3: Readers and end-point-aware change functions

**Files:**
- Modify: `lib/total-assets-change.ts`
- Modify: `lib/adapters/portfolio-db.ts` (near `getPortfolioSnapshots`)
- Test: `tests/total-assets-change.test.ts`, `tests/position-snapshots-adapter.test.ts`

**Interfaces:**
- Produces: `totalAssetsChangeBetween(points: TotalAssetsPoint[], from: string, to: string): TotalAssetsChange | null` — base = latest point ≤ `from`, end = latest point ≤ `to`; null if either missing or base ≥ end. `totalAssetsChange(points, since)` becomes `totalAssetsChangeBetween(points, since, last.date)`; existing tests unchanged.
- Produces: `investmentResultBetween(points: InvestmentPoint[], from: string, to: string): InvestmentResult | null`, same snapping; `investmentResult` delegates to it.
- Produces: `type PositionSnapshotRow = { date: string; market: 'KR' | 'US' | 'CRYPTO'; ticker: string; name: string; quantity: number; costKrw: number; marketValueKrw: number | null }`.
- Produces: `getPositionSnapshots(dates: string[]): PositionSnapshotRow[] | null` — null when the table is missing.
- Produces: `type RealizedGainRow = { market: string; ticker: string; soldDate: string; realizedKrw: number }` and `getRealizedGains(after: string, through: string): RealizedGainRow[]` — stock view `realized_lots`, `after < sold_date <= through`, not superseded.

- [ ] **Step 1: Write failing tests:**
  - `between measures to the end point, not the last point`: points 09-30=100, 10-31=150, 11-21=180 → `totalAssetsChangeBetween(p,'2026-09-30','2026-10-31').change === 50`, `byClass` from the same two points.
  - `between snaps both ends to the latest point on or before`.
  - `investmentResultBetween` mirror test.
  - `missing table returns empty` (adapter): DB with no `position_snapshots` → `getPositionSnapshots([...]) === null`.
  - `realized gains skip superseded rows` (adapter): two rows, one superseded → one row returned.
- [ ] **Step 2: Run** both test files — expect FAIL.
- [ ] **Step 3: Implement** the four functions.
- [ ] **Step 4: Run** — expect PASS, existing `total-assets-change` tests included.
- [ ] **Step 5: Commit** `Read per-security snapshots and measure changes between two dates`.

### Task 4: Decomposition

**Files:**
- Create: `lib/range-breakdown.ts`
- Test: `tests/range-breakdown.test.ts`

**Interfaces:**
- Consumes: `PositionSnapshotRow`, `RealizedGainRow` (Task 3).
- Produces:
  ```ts
  type SecurityDriver = { market: string; ticker: string; name: string; valueChange: number; moneyIn: number; marketEffect: number; realized: number }
  type Unpriced = { market: string; ticker: string; name: string; costKrw: number; missingOn: string[] }
  type RangeBreakdown = { from: string; to: string; securities: SecurityDriver[]; unpriced: Unpriced[]; marketEffectTotal: number; moneyInTotal: number }
  function rangeBreakdown(input: { from: string; to: string; rows: PositionSnapshotRow[]; realized: RealizedGainRow[]; markets: string[] }): RangeBreakdown
  function topDrivers(drivers: SecurityDriver[], n: number): { shown: SecurityDriver[]; other: (SecurityDriver & { count: number }) | null }
  function costBasisGap(breakdownMarketEffect: number, kpiInvestment: number | null): number | null
  ```
- Rules (spec §2): per security, missing row = zeros; `valueChange = MV_B − MV_A`; `marketEffect = ((MV_B − cost_B) − (MV_A − cost_A)) + realized`; `moneyIn = valueChange − marketEffect`. A security unpriced at A or B goes to `unpriced` (with `costKrw` at the unpriced date) and is excluded from `securities` and totals. `securities` sorted by `|valueChange|` desc. `topDrivers` sums the rest into `other` with `ticker: ''`. `costBasisGap` returns `kpi − breakdown` when `|gap| ≥ 1`, else null.

- [ ] **Step 1: Write failing tests** (all values KRW):
  - `buy only`: A none; B qty 10, cost 1000, MV 1200 → valueChange 1200, marketEffect 200, moneyIn 1000.
  - `price only`: A cost 1000 MV 1000; B cost 1000 MV 1300 → moneyIn 0, marketEffect 300.
  - `full sale with gain`: A cost 1000 MV 1100; B none; realized 150 → valueChange −1100, marketEffect 50 (−100 + 150), moneyIn −1150.
  - `round trip inside the period`: no rows at A or B, realized 80 → valueChange 0, marketEffect 80, moneyIn −80.
  - `unpriced security goes to coverage`: B MV null → in `unpriced` with `missingOn: [to]`, absent from `securities`.
  - `markets filter`: `markets: ['KR','US']` drops CRYPTO rows.
  - `topDrivers groups the rest`: 10 drivers, n=8 → 8 shown, other.count 2, other sums match.
  - `cost basis gap is named, not folded into money in`: `costBasisGap(500, 620) === 120`; `costBasisGap(500, 500.4) === null`; per-security moneyIn unchanged by it.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/range-breakdown.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `lib/range-breakdown.ts`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `Split each security's change into money put in and market effect`.

### Task 5: Selection parameters

**Files:**
- Create: `lib/range-selection.ts`
- Test: `tests/range-selection.test.ts`

**Interfaces:**
- Consumes: `TREND_RANGES`, `trendRangeDays` (`lib/trend-ranges.ts`).
- Produces:
  - `resolveRangeSelection(from: string | string[] | undefined, to: string | string[] | undefined, dates: string[]): { from: string; to: string } | null` — validate `YYYY-MM-DD`; swap if reversed; snap each to latest date ≤ it (from snapping below the first date → first date); null if invalid or snapped equal.
  - `trendRangeCovering(selected: TrendRange, from: string, today: string): TrendRange` — `selected` if its window already reaches `from`, else the smallest `TREND_RANGES` entry (by days, ignoring `ytd`) whose window reaches it, else `all`.
  - `rangeHref(baseHref: string, from: string, to: string): string` — sets/replaces `from`/`to`, keeps every other param.

- [ ] **Step 1: Write failing tests:**
  - `reversed params are swapped`; `invalid dates give null`; `equal after snapping gives null`; `snaps to the latest date on or before`.
  - `widens the trend window to reach the selection`: selected 1Y, from 18 months ago → 2Y; from inside 1Y → 1Y unchanged.
  - `rangeHref keeps other params`: `/net-worth?trend=365&view=share` → contains `trend=365`, `view=share`, `from=`, `to=`.
- [ ] **Step 2: Run** — expect FAIL. **Step 3: Implement.** **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `Resolve the breakdown period from the URL`.

### Task 6: Drag-to-select on the chart, GET form fallback

**Files:**
- Modify: `components/charts.tsx` (`StackedAssetChart`)
- Create: `components/RangeSelectForm.tsx`
- Test: `tests/range-selection.test.ts` (pure helper), browser check

**Interfaces:**
- Consumes: `rangeHref` (Task 5).
- Produces: `StackedAssetChart` prop `rangeSelect?: { from: string | null; to: string | null; baseHref: string; clearHref: string; clearLabel: string }`. Absent: chart behaves exactly as today.
- Produces: `RangeSelectForm({ dates, from, to, keep, labels })` — server-renderable `<form method="get" action="/net-worth">`: two `<select>` (`from`, `to`) of plotted dates with language-aware labels, hidden inputs for every other current param (`keep: Record<string,string>`), a submit button. No client JS.

- [ ] **Step 1: Pure helper test** in `tests/range-selection.test.ts`: `orderedDragRange(startLabel, endLabel)` returns `[earlier, later]` or null when equal — export it from `lib/range-selection.ts`.
- [ ] **Step 2: Implement drag** in `StackedAssetChart`: `onMouseDown`/`onMouseMove`/`onMouseUp` on `AreaChart` read `activeLabel`; while dragging draw `<ReferenceArea x1 x2>` (fill `var(--accent)`-ish token from the theme kit, low opacity); on mouse up `router.push(rangeHref(baseHref, a, b))` (`useRouter` from `next/navigation`). When `from`/`to` are set, draw a persistent `ReferenceArea` and render a small clear link (`clearHref`) above the chart. Cursor `crosshair` on the plot only when `rangeSelect` is present.
- [ ] **Step 3: Implement `RangeSelectForm`.**
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck` — expect PASS.
- [ ] **Step 5: Commit** `Select a period on the total assets chart`.

### Task 7: Breakdown panel and page wiring

**Files:**
- Create: `components/RangeBreakdownPanel.tsx`
- Modify: `app/net-worth/page.tsx` (read `from`/`to`, widen trend, `hrefWith` gains `from`/`to` and keeps them across other filters, render panel after the trend card)
- Modify: `lib/ui-copy/pages/netWorth.ts` (en + ko `breakdown` block)
- Test: `tests/range-breakdown-panel.test.ts` (render via `react-dom/server` `renderToStaticMarkup`, as `tests/account-coverage-summary.test.ts` does), `tests/ui-guardrails.test.ts` stays green

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces: `RangeBreakdownPanel({ change, investment, gap, byClass, stocks, crypto, unpriced, copy, money, language, classColors })` where `stocks`/`crypto` are `topDrivers(...)` results (n = 8) and `byClass` is `TotalAssetsChange['byClass']`.
- Copy keys (`copy.breakdown`): `title`, `period(from, to)`, `byClass`, `stocks`, `crypto`, `moneyIn`, `marketEffect`, `valueChange`, `other(count)`, `unpricedNote(names, cost)`, `costBasisGap(amount)`, `costBasisGapInfo`, `clear`, `selectHint` (drag or pick months), `fromLabel`, `toLabel`, `apply`, `noData` (table missing). Korean copy: no English words; dates through `fmtDate(…, language)`.

- [ ] **Step 1: Write failing render tests:**
  - `renders class bars and a row per shown security with both segments` (labels for money in and market effect present, row count = shown + other).
  - `shows the cost basis gap line only when gap is non-null`.
  - `shows the unpriced note with names`.
  - `renders the noData note when snapshots are missing`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement the panel.** Header uses `TotalAssetsChangeField`. Class rows: diverging horizontal bar, `ASSET_CLASS_COLOR`, largest first. Security rows: one diverging bar with two adjacent segments (money in, market effect; two distinct theme colors plus a legend), net value change printed at the bar end, row links to the position detail page (`/positions/<market>/<ticker>`, the `app/positions/[market]/[ticker]` route). Bars as plain divs (no Recharts) so the panel stays server-rendered.
- [ ] **Step 4: Wire the page.** In `page.tsx`: `selection = resolveRangeSelection(params.from, params.to, totalAssets.points.map(p => p.date))`; `selectedRange = trendRangeCovering(resolveTrendRange(params.trend), selection.from, today)` when a selection exists; pass `rangeSelect` to the chart; render `RangeSelectForm` under the filter rows; when a selection exists compute `totalAssetsChangeBetween`, `investmentResultBetween`, `getPositionSnapshots([from, to])`, `getRealizedGains(from, to)`, `rangeBreakdown` for `['KR','US']` and `['CRYPTO']`, `costBasisGap` (only when `to === today`), and render the panel as a `Card` right after `#net-worth-trend` with `id="net-worth-breakdown"`.
- [ ] **Step 5: Run** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm ui:guardrails` — expect all PASS (see memory: lint/dev server in a worktree may need the documented workarounds).
- [ ] **Step 6: Browser check** with the dev server (`preview_start`): drag a range → URL gains `from`/`to`, shaded area persists, panel appears; switch `?trend=` and `?view=share` → selection kept; clear link removes it; mobile width → form path works; dark and light themes legible. Screenshot for the PR.
- [ ] **Step 7: Commit** `Show what changed over a selected period on the net worth page`.

### Task 8: Ship

- [ ] **Step 1:** Push the branch and open a PR (body: one line per paragraph, effects only, no figures; mention the `superseded_by` backfill correction if Task 1 Step 5 changed history).
- [ ] **Step 2:** After merge, ask the maintainer before deploying and running a refresh on `ops-host` (the refresh runs `backfill:history`, which fills past rows). Then confirm read-only that `position_snapshots` has rows for every `portfolio_snapshots` date and `stock_views_self_only` passes.
- [ ] **Step 3:** Invoke `superpowers:finishing-a-development-branch` to clean up the worktree.
