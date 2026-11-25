# Period Change and Daily Change Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily change bars under the /holdings market-mix chart, and a period change card (1D–1Y, two bases) with a waterfall, diverging bars and a sparkline in place of "today's change".

**Architecture:** Pure functions turn position snapshots and realized gains into per-market market effects by reusing `rangeBreakdown` (`lib/range-breakdown.ts`), after remapping rows to held markets with `rowMarket`. The daily bars apply this per consecutive chart date. The card applies it once per period for Actual P&L, and reuses `dayChange` with an older reference close for Holdings return. Server components render the card. One new client chart draws the bars.

**Tech Stack:** Next.js (app router, server components), TypeScript, Recharts (client charts in `components/charts.tsx`), better-sqlite3, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-period-change-and-daily-bars-design.md`

## Global Constraints

- Repository text is in English. Korean is used only as UI copy in `lib/ui-copy/pages/holdings.ts`, with no English words inside Korean strings, and every displayed date is formatted with a language.
- The repository is public, so code, tests, commits and PR text carry no real amounts, quantities, dates or account numbers from the owner's data. Fixtures use invented tickers and round numbers.
- `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm ui:guardrails` pass. The 2 `next` navigate-reducer `shouldScroll` failures are pre-existing.
- Periods: `1d`, `1w` (7 days), `1m` (1 calendar month), `3m` (3 calendar months), `ytd` (31 December of the previous year), `1y` (1 calendar year). Query params `?chg=` (default `1d`) and `?basis=` (`actual` default, `held`).
- Period start is the latest stored snapshot date on or before the nominal start. When there is none, use the earliest snapshot and flag `clamped: true`.
- Actual P&L = `rangeBreakdown` market effect after the `rowMarket` remap. Totals must equal `rangeBreakdown` on the unmapped rows for the same dates.
- 1D in both bases is the existing live `dayChange(getDayChangeRows())`.
- The sign is printed and never carried by colour alone (`Signed`, guidelines §7).
- No new fetching on the ops host.

## Review Focus

1. A purchase inside the period. Expected: it adds to money in, not to the market effect, on the bars and on the Actual P&L card. Test in Task 1.
2. A US stock held at Toss (lot market `KR`, ticker without digits) that was sold in full inside the period. Expected: its realized gain lands under US. Test in Task 1.
3. A period whose nominal start predates the history. Expected: it starts at the earliest snapshot and is flagged `clamped`. Test in Task 3.
4. Holdings return for a holding with no close on or before the reference date. Expected: it is measured from its first close inside the period. Crypto priced in won is excluded. Test in Task 4.
5. A security unpriced on one intermediate date. Expected: that pair's bar omits it and records the date in `gaps`, while the period headline still counts it. Test in Task 2.

---

### Task 1: Market attribution over `rangeBreakdown`

**Files:**
- Create: `lib/market-attribution.ts`
- Test: `tests/market-attribution.test.ts`

**Interfaces:**
- Consumes: `rangeBreakdown`, `RangeBreakdown` (`lib/range-breakdown.ts`), `rowMarket` (`lib/position-shares.ts`), `PositionSnapshotRow` and `RealizedGainRow` (`lib/adapters/portfolio-db.ts`).
- Produces:

```ts
export const ATTRIBUTION_MARKETS = ['KR', 'US', 'CRYPTO'] as const
export type MarketEffects = Record<'KR' | 'US' | 'CRYPTO', number>
export function heldMarketMap(held: readonly { market: string; ticker: string }[]): Map<string, Set<string>>
export function remapToHeld<T extends { market: string; ticker: string }>(rows: readonly T[], held: ReadonlyMap<string, ReadonlySet<string>>): T[]
export type Attribution = {
  breakdown: RangeBreakdown            // over remapped rows and gains
  byMarket: Record<'KR' | 'US' | 'CRYPTO', { marketEffect: number; moneyIn: number; valueChange: number; startValue: number; endValue: number }>
  startValue: number; endValue: number // sums of priced snapshot values on from / to
}
export function attribute(input: { from: string; to: string; rows: readonly PositionSnapshotRow[]; realized: readonly RealizedGainRow[]; held: readonly { market: string; ticker: string }[] }): Attribution
```

- [ ] **Step 1: Write the failing tests** in `tests/market-attribution.test.ts`:
  - `'a purchase is money in, not market effect'`: one KR security with value 100, cost 100 on `from` and value 230, cost 200 on `to` → `byMarket.KR.moneyIn === 100`, `marketEffect === 30`.
  - `'a Toss-held US stock sold in full lands under US'`: rows keyed `KR` for ticker `TSLQ` on `from` only, a realized gain `{ market: 'KR', ticker: 'TSLQ', realizedKrw: 50 }` inside the period, and held = `[]` → `byMarket.US.marketEffect` includes 50 and `byMarket.KR` does not.
  - `'totals equal the unmapped rangeBreakdown'`: a mixed fixture where `attribute(...).breakdown.marketEffectTotal` equals `rangeBreakdown({...unmapped, markets: ['KR','US','CRYPTO']}).marketEffectTotal`.
  - `'start + money in + effect = end, unpriced excluded'`: `startValue + Σ moneyIn + Σ marketEffect === endValue` with one unpriced security listed in `breakdown.unpriced` and absent from both values.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/market-attribution.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `lib/market-attribution.ts`. `remapToHeld` replaces `market` with `rowMarket(market, ticker, held)`. `attribute` remaps both rows and gains and then calls `rangeBreakdown` with all three markets. It sums `byMarket` from `breakdown.securities` and computes start and end values from the remapped priced rows of keys that are not unpriced.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with the message `"Attribute market effects to held markets over rangeBreakdown"`.

### Task 2: Daily change series

**Files:**
- Create: `lib/daily-change.ts`
- Test: `tests/daily-change.test.ts`

**Interfaces:**
- Consumes: `attribute`, `heldMarketMap` (Task 1).
- Produces:

```ts
export type DailyChangePoint = { date: string; KR: number; US: number; CRYPTO: number; total: number; previousTotal: number; gaps: number }
export function dailyChangeSeries(input: { dates: readonly string[]; rows: readonly PositionSnapshotRow[]; realized: readonly RealizedGainRow[]; held: readonly { market: string; ticker: string }[] }): DailyChangePoint[]
export function dailyChangeShares(points: readonly DailyChangePoint[]): DailyChangePoint[]  // each market as % of previousTotal; total likewise
export function cumulativeEffect(points: readonly DailyChangePoint[]): number[]
```

`dates` is the chart's sorted dates. There is one point per date after the first. A realized gain counts in the pair whose `(from, to]` contains its `soldDate`. `gaps` is the number of securities that pair left out as unpriced. `previousTotal` is the pair's `startValue`.

- [ ] **Step 1: Write the failing tests:**
  - `'one point per consecutive pair, market effects per market'`: 3 dates with KR and US rows → 2 points with the expected per-market effects.
  - `'a realized gain counts in the pair containing its sale date'`.
  - `'an intermediate unpriced security is left out of that pair only and counted in gaps'`.
  - `'shares are percent of the previous total'`: KR effect 10 on a previous total of 200 → `KR === 5`.
  - `'cumulative effect runs over the points'`: `[1, -3, 2]` → `[1, -2, 0]`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/daily-change.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** by filtering the rows and gains per pair. Pre-group the rows by date once, so each pair is O(rows of two dates).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `"Compute daily market effects from consecutive snapshots"`.

### Task 3: Periods and the Actual P&L summary

**Files:**
- Create: `lib/period-change.ts`
- Test: `tests/period-change.test.ts`

**Interfaces:**
- Consumes: `attribute` (Task 1), `topDrivers` (`lib/range-breakdown.ts`).
- Produces:

```ts
export const PERIODS = ['1d', '1w', '1m', '3m', 'ytd', '1y'] as const
export type Period = (typeof PERIODS)[number]
export type Basis = 'actual' | 'held'
export function resolvePeriod(param: unknown): Period            // unknown → '1d'
export function resolveBasis(param: unknown): Basis              // unknown → 'actual'
export function nominalStart(period: Exclude<Period, '1d'>, today: string): string
export function periodStart(period: Exclude<Period, '1d'>, today: string, snapshotDates: readonly string[]): { date: string; clamped: boolean } | null  // null when no snapshots
export type ActualSummary = {
  from: string; to: string; clamped: boolean
  startValue: number; endValue: number; moneyIn: number; marketEffect: number; pct: number | null   // marketEffect / startValue
  markets: { market: 'KR' | 'US' | 'CRYPTO'; marketEffect: number; moneyIn: number; pct: number | null }[]
  up: SecurityDriver[]; down: SecurityDriver[]    // by marketEffect, at most 5 each, zero excluded
  unpriced: number
}
export function actualSummary(input: { from: string; to: string; clamped: boolean; rows: readonly PositionSnapshotRow[]; realized: readonly RealizedGainRow[]; held: readonly { market: string; ticker: string }[] }): ActualSummary
```

- [ ] **Step 1: Write the failing tests:**
  - `nominalStart('1w', '2030-03-12') === '2030-03-05'`, `('1m', '2030-03-31') === '2030-02-28'`, `('3m', '2030-05-31') === '2030-02-28'`, `('ytd', '2030-03-12') === '2029-12-31'`, `('1y', '2030-03-12') === '2029-03-12'`.
  - `periodStart` picks the latest date on or before the nominal start. When every date is later, it returns the earliest date with `clamped: true`. With no dates it returns null.
  - `actualSummary`: the identity `startValue + moneyIn + marketEffect === endValue`, per-market `pct` against each market's start value, movers sorted and capped at 5, and zero-effect securities absent.
  - `resolvePeriod('x') === '1d'`, `resolveBasis(undefined) === 'actual'`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/period-change.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Month arithmetic clamps to the last day of the month. Dates are compared as ISO strings.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `"Resolve periods and summarise actual P&L for a period"`.

### Task 4: Holdings return reference closes

**Files:**
- Modify: `lib/adapters/portfolio-db.ts` (`getDayChangeRows`, ~line 1284)
- Test: `tests/day-change-adapter.test.ts`

**Interfaces:**
- Produces: `getDayChangeRows(options?: { referenceDate?: string }): DayChangeRow[]`.
  - Without options, behaviour is unchanged.
  - With `referenceDate`:
    - The quote file's `previousClose` is ignored.
    - `prevClose` is the latest same-currency `historical_prices` close on or before `referenceDate`. If there is none, it is the earliest close after `referenceDate` and before the quote date.
    - `prevFx` is on or before that close's date.
    - Price and quote date selection are unchanged.
- Consumes: the existing `dayChange(rows)` (`lib/day-change.ts`), unchanged. Its per-market session rule still applies.

- [ ] **Step 1: Write the failing tests**:
  - `'a reference date takes the close on or before it, not the file previous close'`
  - `'a holding first priced after the reference date is measured from its first close'`
  - `'KRW crypto with only USD closes still has no reference close'`
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/day-change-adapter.test.ts`. Expected: the 3 new tests fail.
- [ ] **Step 3: Implement** with two extra prepared statements (on or before, and first after), used only when `referenceDate` is set. Keep the existing `currency` column guard.
- [ ] **Step 4: Run.** Expected: all pass.
- [ ] **Step 5: Commit** with the message `"Let the day-change reader measure from an older reference date"`.

### Task 5: Daily change bars on the market-mix tab

**Files:**
- Modify: `components/charts.tsx` (new `DailyChangeBarChart`, client)
- Modify: `app/holdings/MarketMixView.tsx`
- Modify: `lib/ui-copy/pages/holdings.ts` (`mix.daily*` keys, both languages)
- Test: `tests/daily-change.test.ts` already covers the data. Add a render-free props test only if the file's existing chart tests do so.

**Interfaces:**
- Consumes: `dailyChangeSeries`, `dailyChangeShares` (Task 2), `getRealizedGains(after, through)`, `heldMarketMap`.
- Produces: `DailyChangeBarChart(props: ChartContract & { points: DailyChangePoint[]; series: { key: 'KR'|'US'|'CRYPTO'; label: string; color: string }[]; totalLabel: string; gapLabel: (count: string) => string; monthly: boolean; height?: number })`. This is a Recharts `BarChart` with `stackOffset="sign"`, one `Bar` per market sharing a `stackId`, a zero reference line, and a tooltip listing the non-zero markets, the total and the gap note.

- [ ] **Step 1: Wire the data in `MarketMixView`.**
  - Reuse `chartRows` and `chartDates`.
  - Read `realized = getRealizedGains(chartDates[0], today)`.
  - Build `points = dailyChangeSeries({ dates: chartDates, rows: chartRows, realized, held: rows })`.
  - Use `dailyChangeShares(points)` when `mixShareView` is set; otherwise convert won through `toDisplay`.
  - Set `monthly = rangeDays > 366`.
- [ ] **Step 2: Render** `DailyChangeBarChart` inside the same `Card`, directly under `StackedSeriesChart`, at height 140.
- [ ] **Step 3: Add copy** for `mix.dailyTitle`, `mix.dailyMonthlyTitle`, `mix.dailyTotal` and `mix.dailyGap(count)`, and append one sentence to `mix.info` on what the bars show (market effect, purchases excluded).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm ui:guardrails && pnpm test`. Expected: PASS apart from the 2 known failures.
- [ ] **Step 5: Commit** with the message `"Draw daily market-effect bars under the market-mix chart"`.

### Task 6: Period change card

**Files:**
- Rename and modify: `components/DayChangeCard.tsx` → `components/PeriodChangeCard.tsx`
- Create: `components/ChangeWaterfall.tsx` (server, CSS only)
- Modify: `app/holdings/page.tsx` (~line 338)
- Modify: `lib/ui-copy/pages/holdings.ts` (rename `dayChange` → `periodChange`, both languages; add period, basis, waterfall and clamp copy, and rules for both bases)
- Modify: `docs/architecture/daily-snapshots-and-day-change.md` (a "Period change" section)
- Test: `tests/copy-registry.test.ts` passes. Add `tests/change-waterfall.test.ts` for the pure segment layout helper.

**Interfaces:**
- Consumes: `resolvePeriod`, `resolveBasis`, `periodStart`, `actualSummary` (Task 3); `getDayChangeRows({ referenceDate })` (Task 4); `dayChange`; `cumulativeEffect`, `dailyChangeSeries` (Task 2); `getPositionSnapshots(dates)`, `getSnapshotDates(days, { daily: true })`, `getRealizedGains`; `DivergingBarList`, `Sparkline`, `ChipGroup`, `LinkChip`, `Signed`.
- Produces:
  - `waterfallSegments(input: { start: number; steps: { key: string; value: number }[] }): { key: string; from: number; to: number; positive: boolean }[]`, exported from `components/ChangeWaterfall.tsx`. Each step runs from the running total to the running total plus its value.
  - `ChangeWaterfall({ start, end, steps, labels, money })`.
  - `PeriodChangeCard({ view, copy, language, money, href })`. Here `view` is either `{ kind: 'live', change: DayChange }` (1D) or `{ kind: 'actual', summary: ActualSummary, spark: number[], gaps: number }` or `{ kind: 'held', change: DayChange, from: string, clamped: boolean }`.

- [ ] **Step 1: Write the failing test** `tests/change-waterfall.test.ts`: `waterfallSegments({ start: 100, steps: [{key:'KR',value:20},{key:'US',value:-5},{key:'in',value:10}] })` deep-equals `[{key:'KR',from:100,to:120,positive:true},{key:'US',from:120,to:115,positive:false},{key:'in',from:115,to:125,positive:true}]`.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/change-waterfall.test.ts`. Expected: FAIL. Then implement the helper and the component. Bars are absolutely positioned within a `[min, max]` scale. Each segment carries `aria-hidden`, and a visually hidden sentence states the start, each step and the end.
- [ ] **Step 3: Build `PeriodChangeCard`** from the existing card, top to bottom:
  1. Period chips and basis chips, linking through `href(param, value)`.
  2. The headline (`Signed` won and %, the basis name, the date range, and the clamp note when `clamped`).
  3. The waterfall (Actual: KR, US, CRYPTO steps, then money in; Holdings return: market steps only).
  4. Market rows as `DivergingBarList` items.
  5. `Sparkline` of `spark`, not shown for 1D, with the gap note when `gaps > 0`.
  6. Up and down movers as two `DivergingBarList`s.
  7. The exclusion note and the rules disclosure.

  The 1D (`live`) view keeps today's per-market session captions and the FX note.
- [ ] **Step 4: Wire the page.**
  - Read `period = resolvePeriod(params.chg)` and `basis = resolveBasis(params.basis)`.
  - For `1d`, use `dayChange(getDayChangeRows())`.
  - Otherwise, take `dates = getSnapshotDates(400 * 3, { daily: true })` and `start = periodStart(period, portfolioToday(), dates)`.
    - For `actual`, use `actualSummary({ from: start.date, to: last(dates), rows: getPositionSnapshots([start.date, last(dates)]), realized: getRealizedGains(start.date, last(dates)), held: rows })`. Compute the sparkline from `dailyChangeSeries` over the dates in range, with the rows read from `getPositionSnapshots` for those dates.
    - For `held`, use `dayChange(getDayChangeRows({ referenceDate: start.date }))`.
  - The links keep every other param (`withParam`).
- [ ] **Step 5: Copy and docs.**
  - Rename the copy key and update the `DayChangeCopy` type to `PeriodChangeCopy`.
  - Add the labels: periods (1일, 1주, 1개월, 3개월, 연초 이후, 1년 / 1D, 1W, 1M, 3M, YTD, 1Y), bases (실제 손익 / 보유 종목 수익률), waterfall steps (시작, 투입 금액, 끝) and the clamp note.
  - The rules gain: how the period start is chosen; Actual P&L as value change minus money in, realized gains included, with per-market splits following the chart's market assignment; Holdings return as today's quantities from the period-start close, with first-close and won-crypto handling; why 1D and the last bar can differ.
  - Mirror this in the architecture doc.
- [ ] **Step 6: Run** `pnpm typecheck && pnpm lint && pnpm ui:guardrails && pnpm test`. Expected: PASS apart from the 2 known failures.
- [ ] **Step 7: Commit** with the message `"Turn the day's change into a period change card with two bases and stronger visuals"`.

### Task 7: Verification and rollout (controller)

- [ ] **Step 1: Check the sample DB in the browser** (the `observatory-visual` launch config pattern from earlier work: seeded sample plus synthetic daily closes and a backfill).
  - The market-mix tab shows the bars under the chart in 1M (daily) and 2Y (monthly), with share view percentages.
  - The holdings tab, for each period chip and both bases, shows the waterfall, markets, sparkline, movers and clamp note. There are no console errors, and the layout works at phone width.
- [ ] **Step 2: Measure the render time** of `/holdings?view=mix&trend=365` against production data on a throwaway DB copy on the ops host. If the daily series costs more than about 200 ms, memoise per request.
- [ ] **Step 3: Open the PR, wait for CI, merge, and redeploy**, as in the previous rollouts with the owner's go-ahead. Then compare the 1M Actual P&L headline against the /net-worth range breakdown for the same two dates. The totals must match.
