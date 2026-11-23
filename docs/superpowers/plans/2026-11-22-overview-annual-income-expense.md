# Overview Income and Spending by Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, on the Overview's all-assets view, how much came in and how much was spent over a selectable period (last 12 months by default, also this year, last year and last 24 months), each figure read from the page that owns it.

**Architecture:** Income is the counted cash-inflow total that `getCashInflow` already computes for a `CashInflowRange`. Spending comes from `loadSpendingPilot()`, which since #431 reads the published read-only snapshot in production and the local ledger in development. A new pure domain function sums net spending (purchases minus refunds) inside the same month window per native currency, the way `/spending` does, and also converts each row to the display currency at its own date's USD/KRW rate from `historical_fx_rates`, so income and spending can be read side by side. A pure combiner produces the card's value; the page renders it with period chips.

**Tech Stack:** Next.js server components, better-sqlite3, `node:test`, existing `components/ui`, `components/layout`, `LinkChips`.

**Spec:** this document. Boundaries: `docs/superpowers/plans/2026-11-21-us-kr-spending.md` (§ Ledger and application boundaries), `docs/operations/spending-pilot.md`, and the current `/spending` page (`app/spending/page.tsx`, `analyzeSpending` in `lib/domain/spending-view.ts`).

**Base:** `origin/main` at `a9cb5a2` or later. The worktree was fast-forwarded there; #431 changed `loadSpendingPilot` and added `analyzeSpending`, and this plan depends on both.

## Global Constraints

- Periods are the `CashInflowRange` values `'12m' | 'ytd' | 'lastYear' | '24m'`, in that chip order. Default `'12m'`. `'all'` is not offered (spending history is far shorter than inflow history, so the two would never cover the same span).
- The selection lives in the Overview query string as `flow=<range>`. An absent or unknown value is `'12m'`. Every Overview link that rebuilds the query (the trend `TrendRangeLinks` href at `app/page.tsx` ~426) must carry `flow` through, and the flow chips must carry `trend`, `scope`, `metric`, `view` through.
- Windows come from `cashInflowWindow(range, year, month, null)` (exported from `portfolio-db.ts`), so the income figure equals `/cash-inflow?range=<range>`.
- Chip labels reuse the cash-inflow wording: en `Last 12 months / This year / Last year / Last 24 months`, ko `최근 12개월 / 올해 / 작년 / 최근 24개월`.
- Income = counted categories (`salary`, `bonus`, `expense`, `dividend`, `interest`, `other`), i.e. `getCashInflow(..., 'All', { range }).totals.rangeTotal`.
- Spending = `-amountMinor` of `purchase` rows plus `-amountMinor` of `refund` rows (refunds are positive, so they subtract), attributed by `activityDate`, rows after today excluded. `card_payment`, `own_transfer`, `fee`, `other` are excluded. This matches `analyzeSpending` exactly; for `'12m'` and `'24m'` the native totals must equal `/spending?period=12|24`.
- Native totals stay visible: the stat shows the converted total as its value and the USD and KRW native totals with "N of M months recorded" in its sub-line, the same wording `/spending` uses (`observedMonths`).
- Converted totals follow the spending doc's rule for a common-currency view: the info text names the rate source (dated USD/KRW history, closest earlier date) and the card states how many rows had no dated rate.
- Spending `disabled` (no snapshot published) or `unavailable` (unreadable) shows a dash with its own explanation, never zero. Income still shows.
- No net "income − spending" figure in this phase (payroll, tax and transfer boundaries are undefined; spending doc § Ledger and application boundaries).
- All view only (`assetView === 'all'`), same gate as the period tiles.
- Copy in `en` and `ko` in `lib/ui-copy/pages/overview.tsx`. Months in copy go through the language-aware date formatter. Run `pnpm ui:guardrails` before push.
- Repository text is English; no real amounts or dates in commits or the PR body.

## Review Focus

1. **`flow` survives other controls.** Clicking a trend range chip keeps `flow=ytd`, and clicking a flow chip keeps `trend/scope/metric/view`. → href test in Task 4.
2. **January under `ytd`.** The window is one month (the current, partial one); totals are small but real, and the card says "this year" not "12 months". → test in Task 1 with `today` in January.
3. **`lastYear` reaching before the snapshot.** Months before the first recorded row read as unrecorded: `observedMonths` counts only months with activity, the sub-line shows "N of 12 months recorded". → test in Task 1.
4. **Rows older than the FX table.** Converted at the current rate and counted in `undatedCount`. → test in Task 1.
5. **Snapshot missing or corrupt in production.** `loadSpendingPilot()` returns `disabled` / `unavailable`; the card shows the right explanation and the page does not throw. → test in Task 3.

---

## File Structure

- Create `lib/domain/spending-window.ts` — pure: sums spending rows in a month window, native and converted.
- Create `lib/overview-flow.ts` — pure: resolves the `flow` param and combines income and spending into the card's value.
- Modify `lib/adapters/portfolio-db.ts` — export `cashInflowWindow`; add `getUsdKrwHistory()`.
- Modify `app/page.tsx` — compute and render the card; carry `flow` through the trend hrefs.
- Modify `lib/ui-copy/pages/overview.tsx` — en/ko copy.
- Tests: `tests/spending-window.test.ts`, `tests/overview-flow.test.ts`.

### Task 1: Spending summed over a month window

**Files:**
- Create: `lib/domain/spending-window.ts`
- Test: `tests/spending-window.test.ts`

**Interfaces:**
- Consumes: `SpendingViewRow` from `lib/domain/spending-view.ts`; `Currency` from `lib/domain/spending-import.ts`.
- Produces:
  ```ts
  export type UsdKrwRate = { date: string; rate: number }   // ascending by date
  export type SpendingWindow = {
    native: Record<Currency, { netMinor: number | null; observedMonths: number }>  // null when no activity in the window
    months: number                                      // months in the window
    converted: number | null                            // display currency, major units; null when no activity at all
    undatedCount: number
  }
  export function sumSpendingWindow(input: {
    rows: SpendingViewRow[]
    window: { start: string; end: string }   // 'YYYY-MM', inclusive
    today: string                             // 'YYYY-MM-DD'; later rows are skipped
    display: 'KRW' | 'USD'
    rates: UsdKrwRate[]
    fallbackRate: number | null
  }): SpendingWindow
  ```

- [ ] **Step 1: Write the failing tests** in `tests/spending-window.test.ts`:
  - `nets purchases and refunds by activity month, skipping payments and transfers`: KRW purchase −10000 (2026-01-05), refund +2000 (2026-01-20), card_payment −50000 (2026-01-25), own_transfer −7000 (2026-01-26), purchase −3000 (2025-11-30, outside `2025-12..2026-11`) → `native.KRW.netMinor === 8000`, `native.KRW.observedMonths === 1`, `months === 12`, `native.USD.netMinor === null`.
  - `matches analyzeSpending for a 12-month window`: build ~10 mixed rows, compare `native.USD.netMinor`/`native.KRW.netMinor` and `observedMonths` with `analyzeSpending(rows, { today, period: 12 }).totals` — must be equal.
  - `skips rows after today`: purchase dated tomorrow → not counted.
  - `converts USD at the rate on or before its date`: USD −1000 minor on 2026-03-10, rates `[{date:'2026-03-01',rate:1400},{date:'2026-03-15',rate:1500}]`, display KRW → `converted === 14000`; display USD → `converted === 10`.
  - `a KRW row in a USD view divides by the dated rate`: KRW −14000 on 2026-03-10, same rates, display USD → `converted === 10`.
  - `rows older than the rate table use the fallback and are counted`: USD −1000 minor on 2026-01-02, rates start 2026-02-01, fallbackRate 1450, display KRW → `converted === 14500`, `undatedCount === 1`.
  - `a one-month ytd window in January`: window `2027-01..2027-01`, today `2027-01-10` → `months === 1`, only January rows counted.
  - `months without activity are not observed`: window `2025-01..2025-12`, rows only in 2025-11 and 2025-12 → `observedMonths === 2`, `months === 12`.

- [ ] **Step 2: Run to verify failure**
  Run: `pnpm test -- tests/spending-window.test.ts` (or the `node --test` form `package.json` uses)
  Expected: FAIL, module not found.

- [ ] **Step 3: Implement `sumSpendingWindow`.** USD minor ÷ 100 for major units; KRW minor is won. Rate lookup is a binary search for the last `rate.date <= row.activityDate`; none → `fallbackRate` and `undatedCount++`; neither → skip the row from `converted` only and still count it undated. `observedMonths` counts distinct months with at least one purchase or refund row, matching `analyzeSpending`.

- [ ] **Step 4: Run to verify pass.**

- [ ] **Step 5: Commit** — `git commit -m "Sum net spending over a month window, native and converted"`

### Task 2: Window and rate reads

**Files:**
- Modify: `lib/adapters/portfolio-db.ts` (`cashInflowWindow` ~3397; new `getUsdKrwHistory`)

**Interfaces:**
- Produces:
  ```ts
  export function cashInflowWindow(range: CashInflowRange, nowYear: number, nowMonth: number, firstMonth: string | null): { start: string; end: string; months: string[]; previous: { start: string; end: string } | null }
  export function getUsdKrwHistory(): { rates: UsdKrwRate[]; fallbackRate: number | null }
  ```

- [ ] **Step 1: Export `cashInflowWindow`** (signature unchanged).
- [ ] **Step 2: Implement `getUsdKrwHistory()`**: `select price_date as date, rate from historical_fx_rates order by price_date` when the table exists (use the `hasTable` pattern at ~1354), else `[]`; `fallbackRate` is the current USD→KRW row of `fx_rates`, as the ingest's `usdKrwOn` does.
- [ ] **Step 3: Verify** — `pnpm tsc --noEmit` passes; existing cash-inflow tests still pass.
- [ ] **Step 4: Commit** — `git commit -m "Export the cash-inflow window and read dated USD/KRW rates"`

### Task 3: Flow value and param

**Files:**
- Create: `lib/overview-flow.ts`
- Test: `tests/overview-flow.test.ts`

**Interfaces:**
- Consumes: `SpendingWindow` (Task 1); `CashInflowRange`.
- Produces:
  ```ts
  export const FLOW_RANGES = ['12m', 'ytd', 'lastYear', '24m'] as const
  export type FlowRange = typeof FLOW_RANGES[number]
  export function resolveFlowRange(value: string | undefined): FlowRange          // default '12m'
  export type SpendingRead = { status: 'disabled' } | { status: 'unavailable' } | { status: 'available'; window: SpendingWindow }
  export type OverviewFlow = {
    range: FlowRange
    window: { start: string; end: string; months: number }
    income: number | null            // null when cash inflow holds no records
    spending: SpendingWindow | null  // null unless available
    spendingState: 'available' | 'noActivity' | 'notPublished' | 'unreadable'
  }
  export function overviewFlow(input: {
    range: FlowRange
    window: { start: string; end: string; months: string[] }
    inflow: { rangeTotal: number; hasRecords: boolean }
    spending: SpendingRead
  }): OverviewFlow
  export function spendingHref(range: FlowRange): string   // '/spending?period=12' for 12m and ytd, '/spending?period=24' for 24m and lastYear
  ```

- [ ] **Step 1: Write failing tests**:
  - `resolveFlowRange`: `undefined → '12m'`, `'ytd' → 'ytd'`, `'all' → '12m'`, `'garbage' → '12m'`.
  - `available spending`: → `spendingState === 'available'`, `income === rangeTotal`.
  - `available but no activity in the window`: `converted === null` → `spendingState === 'noActivity'`.
  - `no snapshot reads as not published, not zero`: `{status:'disabled'}` → `spending === null`, `spendingState === 'notPublished'`.
  - `unreadable snapshot`: `{status:'unavailable'}` → `spendingState === 'unreadable'`.
  - `no inflow records`: `hasRecords:false` → `income === null`.
  - `spendingHref`: the four mappings above (the `/spending` page offers 12 and 24 only; the period chosen is the smallest that contains the window).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "Resolve the Overview flow period and combine income with spending"`

### Task 4: The card and its period chips

**Files:**
- Modify: `app/page.tsx` (searchParams type ~73; tiles IIFE ~145–156; trend href ~426; render after the period card ~537–560)
- Modify: `lib/ui-copy/pages/overview.tsx` (en ~44, ko ~188)

**Interfaces:**
- Consumes: Tasks 1–3, `loadSpendingPilot`, `getCashInflow`, `LinkChips`.

- [ ] **Step 1: Copy keys** (both languages): `flowTitle` (en `Income and spending`, ko `수입과 지출`), `flowInfo` (defines both figures: counted cash inflow; purchases minus refunds with card payments and own transfers excluded; each row converted at the USD/KRW rate of its date or the closest earlier one), `flowRanges` (the four labels above), `flowIncome` (`Income` / `수입`), `flowSpending` (`Spending` / `지출`), `flowWindow(start, end)`, `flowObserved(observed, total)` (same wording as the spending page's `observedMonths`), `flowUndated(count)`, `flowNoActivity`, `flowNotPublished`, `flowUnreadable`, `openSpending`.
- [ ] **Step 2: Compute** under the `netWorth` gate: `range = resolveFlowRange(params.flow)`; `window = cashInflowWindow(range, year, month, null)`; income from the existing `inflow` call when `range === '12m'`, otherwise one more `getCashInflow('month', display, undefined, 'All', { range })` (the tiles call must stay `12m`, because its `periods` are limited to the range); spending from `loadSpendingPilot()` → `sumSpendingWindow({ rows: snapshot.rows, window, today, display, ...getUsdKrwHistory() })`, wrapped in try/catch → `unavailable`.
- [ ] **Step 3: Render** `Card title={copy.flowTitle} info={copy.flowInfo} className="mb-5"` with the period `LinkChips` (`current={range}`, each href `/?flow=<key>&trend=…&scope=…&metric=…&view=…`) and a two-stat `StatStrip`: income (value in display currency; sub: window + link `/cash-inflow?range=<range>`), spending (value = converted or dash; sub: USD and KRW native totals each with `flowObserved`, then `flowUndated` when > 0, or the state message; link `spendingHref(range)`). Add `flow=${range}` to the trend `TrendRangeLinks` href at ~426 and to any other Overview self-link that rebuilds the query.
- [ ] **Step 4: Verify** — `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm ui:guardrails` pass. With the dev server (`preview_start`), in both languages and at mobile width: (a) each chip's income equals `/cash-inflow?range=<range>`; (b) for `12m` and `24m` the native USD/KRW spending equals `/spending?period=12|24`; (c) a trend chip click keeps `flow`, a flow chip click keeps the trend settings; (d) with no snapshot or ledger configured the spending reads as not published. Compare figures in code, not by hand.
- [ ] **Step 5: Commit** — `git commit -m "Show income and spending by period on the Overview"`

## Open questions for the maintainer

1. **Net figure:** add "income − spending" once payroll, tax and transfer boundaries are defined, or keep the two figures separate?
2. **`/spending` periods:** it offers 12 and 24 months only, so the `ytd` and `lastYear` links land on a wider window. Adding `ytd` and `lastYear` there too would make every link exact; that is a separate change to `analyzeSpending` and the spending page.
3. **Monthly chart:** a paired income/spending bar per month under the two figures is a natural follow-up; `CashInflow.periods` and a per-month variant of `sumSpendingWindow` would carry it.

## Revision after #433

#433 ("Unify spending analytics in KRW") landed while this branch was open and gave /spending its own KRW conversion: the posting-date USD/KRW rate from `historical_fx_rates` via `readSpendingFxRates`, or the latest rate within seven days, with a transaction that has none left out of the total and counted (`spendingInKrw`, `analyzeSpending(...).combined`). The card now uses exactly that rule instead of the activity-date rate with a current-rate fallback planned above, so in a KRW view its spending total equals the combined net on /spending to the won. `getUsdKrwHistory` was dropped, `SpendingWindow.undatedCount` became `missingFx`, and a period whose transactions all lack a rate reads as activity with a dash, not as an empty period.
