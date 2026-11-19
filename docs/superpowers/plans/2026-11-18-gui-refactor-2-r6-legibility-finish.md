# GUI Refactor 2, R6: Legibility and Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every page reads at the same type scale, spends at most three gradients, shows one account cell per row, draws charts through one contract with Korean units in Korean, and passes 0 axe violations and 0 mobile findings at 375 px.

**Architecture:** Three stacked pull requests off main, as the second plan splits R6. R6-1 (Tasks 1–3) fixes the type scale, the gradient and motion budget and the one remaining contrast failure. R6-2 (Tasks 4–6) merges the broker and account columns, fills in mobile column priority, and moves every chart onto one value/axis/tooltip/empty contract. R6-3 (Tasks 7–9) fixes the mobile layout and the remaining small targets, adds a loading skeleton, and writes the guide. Only presentation changes; no adapter, engine or query does.

**Tech Stack:** Next.js 15 app router, React 19 server components, Tailwind 3 with the tokenized theme (`tailwind.config.ts`, `styles/jp-theme.css`, `styles/globals.css`), recharts (`components/charts.tsx`), `node:test` through `tsx --test`, `renderToStaticMarkup` for component tests, Playwright (`scripts/snap-ui.mjs`, `scripts/a11y-audit.mjs`, `scripts/mobile-audit.mjs`, `scripts/page-shape.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-10-personal-finance-observatory-design.md` §5 (binding). The second GUI refactoring plan (Claude Docs, 2026-10-30, https://claude.ai/artifact/DWkduh8vd3v8xEA1kUauwJ) argues the work: "R6 — 시인성·심미 마감 (3 PR)" and decisions 7–12. Where the two disagree, §5 wins. `docs/ui-guide.md` binds every task.

## Survey (main at 9680b68, R5 merged)

- **Dark tokens (decision 8)** are already gone: `styles/jp-theme.css` (170 lines) holds light tokens only, and no `prefers-color-scheme` or `.dark` rule exists anywhere. Nothing to do; the guide records the decision.
- **P/L colour (decision 7)** is already Western: `signedTone` (`lib/tone.ts:41`) returns `success` for ≥ 0. Kept.
- **`/review` (decision 10)** was kept slim in R4/R5. Nothing to do.
- **Hero size.** `MetricHeroCard` (`components/card.tsx:266`) renders `text-hero` (42 px) below `sm` and `sm:text-display` (52 px) above. `display` has no other user. The overview's two companion figures (`app/page.tsx:378,398`) use `text-hero`, so they would match the hero once it is 42.
- **Label tracking.** `Label` (`components/metric.tsx:271`) is uppercase with `tracking-[0.1em]`/`[0.08em]` in both languages, as is the table header (`components/table.tsx:52`, `tracking-[0.06em]`). Korean has no case, so the spacing only loosens it. `<html lang={language}>` (`app/layout.tsx:53`), so `:lang(ko)` resolves on every element.
- **Gradients on one screen today:**
  - Sidebar: the active item's marker bar (`components/SidebarNav.tsx:48`, `--gradient-mini`), the active label clipped to `t-emph-gradient` (`:51`), and the mobile top bar's wordmark (`components/Sidebar.tsx:73-74`, `--gradient-text`).
  - Header: the eyebrow and breadcrumb clipped to the gradient (`.t-eyebrow` in `jp-theme.css`, used at `components/PageHeader.tsx:80,107`), the 44 px tick (`.ai-page-header::before`), and the emphasis word (`t-emph-gradient`, `PageHeader.tsx:84`; 33 pages pass `emphasis`).
  - The lead card's accent bar (`card.tsx:59`, `--gradient-full`).
  - That is up to seven on one screen.
- **Motion.** `<main className="jp-stagger …">` (`app/layout.tsx:71`). The layout persists across navigations but `main`'s children are new nodes, so the 400 ms fade-up replays on every page change.
- **Contrast.** axe reports one rule, `color-contrast`, on 58 route-languages:
  - The warning pill (`components/controls.tsx:36,85`: `text-warning` on `bg-warning/10`) is 4.45:1 on `--bg-surface`. `--accent-warning` `#8F570A` would give 4.79:1 on surface, 5.15:1 on white and 5.50:1 as plain text on surface.
  - `EmptyState`'s hint `text-ink-3/80` (`card.tsx:293`, e.g. the first-snapshot hint) is 3.12:1.
- **Tables.**
  - `/holdings`, `/lots`, `/transactions` and `/realized` show the broker and the masked account as two sortable columns (`brokerage`, `account`), and the position page's accounts table does too (`app/positions/[market]/[ticker]/page.tsx:270-271`).
  - Sort icons already appear only on sortable columns (`components/DataTable.tsx:107-114`). Nothing to do.
  - Column `priority` is unset on every `DataTable` in `/reconciliation` (4 tables), `/income` (3), `/rebalance` (5) and the position page (5).
- **Charts** (`components/charts.tsx`, 510 lines; five charts used by `/`, `/net-worth`, `/income`, `/fx`, `/crypto-premium`, `/cash-inflow`):
  - Pages pre-divide values by 1,000,000 (`app/page.tsx:70`, `app/net-worth/page.tsx:41`), and the charts append a literal `M`.
  - `PortfolioMultiTrendChart` defaults to `valuePrefix='₩'`, `valueSuffix='M'` and `axisLabel='KRW million'` (English, in both languages); `StackedAssetChart` hard-codes the `M` (`:332`).
  - Tooltips reuse the axis formatter, so a hover shows `₩123.4M` rather than the amount.
  - `/` and `/crypto-premium` guard empty data; `/net-worth`, `/income`, `/fx` and `/cash-inflow` do not.
  - Legends are drawn by the charts; no page draws its own beside a recharts chart.
- **Mobile, 375 px.** `mobile-audit` reports 5 of 29 routes. All findings are targets under 24 px:
  - `AssetCoverageNote` (`components/AssetCoverageNote.tsx:28,49,65`) has two summaries and four links, on `/` and `/net-worth`.
  - `AnnualTaxSummary` (`components/AnnualTaxSummary.tsx:40-42`) has three links, on `/` in the stocks view.
  - The `/daily-briefing` "open published page" link.
  - The `/realized` "not covered" summary.
- **Mobile layout.**
  - `KpiBand` (`components/layout.tsx:88-101`) is one column below `sm`. `StatStrip` is already two.
  - The three sidebar controls sit directly under the nav (`Sidebar.tsx:123-136`), above the read-only footer (`:138`).
- **Loading.** No `loading.tsx` exists under `app/`.
- **R5 leftovers.**
  - `Stat` (`layout.tsx:139`) has no `info` slot, so `/review`'s unrealized figure and the position page's freshness lost their glossary tooltips.
  - `enums.taxYearProfileStatus` (`lib/ui-copy/pages/taxPlanning.ts:15,412`) and `TAX_PROFILE_STATUS_SEVERITY` (`lib/tone.ts:337`) are read only by tests.

## Decisions this plan makes (review these)

The maintainer chose (2026-11-18):
- hero 42 px with 36 px on a phone;
- Korean chart amounts in 억/만;
- the sidebar controls in the footer;
- the entrance motion on first load only.

The rest are mine:

1. **Type scale.**
   - `fontSize` gains `'hero-sm': '36px'`, and `display` is deleted.
   - `MetricHeroCard` renders `text-hero-sm sm:text-hero`.
   - The overview companions drop to `text-metric` (28 px), so the hero stays the largest figure on the page.
2. **Label tracking by language.** `Label` and the table header add `[&:lang(ko)]:tracking-normal`, so English keeps its overline spacing and Korean sets solid. This is a class on the shared primitive, not a `language` prop, since `<html lang>` already carries it.
3. **Gradient budget, at most three on a screen:**
   - sidebar: the active marker bar only;
   - title: one, which is the emphasis word when the page passes `emphasis`, else the tick (`PageHeader` adds `ai-page-header` only when no emphasis renders);
   - lead: the accent bar.

   Removed:
   - the gradient on `.t-eyebrow`, which becomes `--text-secondary` as its own typography rule already says;
   - the active label's `t-emph-gradient`, which becomes `font-medium text-ink`;
   - the mobile wordmark gradient, which becomes `text-ink`.

   A source test pins the files that may name a gradient.
4. **First-load motion.**
   - A client component `EntranceMotion` (`components/EntranceMotion.tsx`) sets `document.documentElement.dataset.entered = 'true'` 600 ms after mount.
   - The stagger rule becomes `[data-theme="jp"]:not([data-entered]) .jp-stagger > *`, still inside `prefers-reduced-motion: no-preference`.
5. **Contrast.**
   - `--accent-warning` becomes `#8F570A`, which changes every warning text and border by one step darker.
   - The `text-ink-3/80` hint becomes `text-ink-3`.
6. **One account cell.**
   - `AccountCell({ brokerage, account })` in `components/PositionCell.tsx` renders the broker on the first line and `maskAccountLabel(account)` on the second, each `truncate` in a `max-w-[14rem]` block.
   - It carries `title="{brokerage} · {masked}"`. The title uses the masked label, never the raw one.
   - The column key is `account`, with `sortValue` `${brokerage} ${account}`; the `brokerage` column goes.
   - The broker filter group and search stay.
   - A URL still carrying `sort=brokerage:…` falls back to the page's default sort.
7. **Mobile priority** on the four pages above. In every table with six or more columns, the identity column and the one amount the card exists for stay `primary`. Source, page, notes and identifiers become `tertiary`, and the rest become `secondary` until at most four columns are `primary`.
8. **Chart contract:**
   - Charts take raw values and a `unit` prop: `{ kind: 'money'; currency: 'KRW' | 'USD' } | { kind: 'percent' } | { kind: 'number'; suffix?: string }`. They also take `language`.
   - Axis ticks come from `axisTick(value, unit, language)` in a new `lib/chart-format.ts`.
   - The tooltip shows the full value through `tooltipValue(value, unit, language)`, which uses `fmtMoney(value, currency)` (`lib/format.ts:16`) for money, because chart values are already in the display currency.
   - `axisLabel` has no default; pages pass copy from `lib/ui-copy/`.
   - Every chart takes `emptyMessage: ReactNode` and renders `EmptyState` with it when no point in `data` is a finite number.
   - Pages stop dividing by 1,000,000.
9. **`axisTick` values:**
   - Korean KRW: ≥ 1억 → `1.2억` (one decimal, trailing `.0` dropped); ≥ 1만 → `3,500만`; else the number.
   - English KRW: `₩1.2M`, `₩350K`, `₩900`.
   - USD in both languages: `$1.2M`, `$350K`, `$900`.
   - Values round half away from zero at the shown precision (one decimal for 억, M and K; whole numbers for 만); a value whose rounded form reaches the next unit prints in that unit (`999_999` → `₩1M`, `99_999_999` → `1억`).
- Negative values get a leading `-`, the same character `fmtNumber` already prints. `0` → `0`.
   - Percent → `fmtPct(value, { digits: 0 })`.
10. **Mobile layout.**
    - `KpiBand` becomes `grid-cols-2` below `sm`.
    - The three sidebar controls move into the `mt-auto` footer block, above the read-only note, unchanged otherwise.
11. **Small targets.**
    - Summaries get `min-h-6 leading-6` (the R5 rule).
    - Inline text links get `inline-flex min-h-6 items-center`.
    - This applies in `AssetCoverageNote`, `AnnualTaxSummary`, the briefing link and the realized summary.
12. **Loading.**
    - One `app/loading.tsx` renders `PageSkeleton` (`components/PageSkeleton.tsx`): a header bar, a hero-height card and two card outlines, inside `role="status" aria-busy="true"`, with `common.loading` as its `sr-only` text.
    - It pulses with `motion-safe:animate-pulse` only.
    - Per-route files are not needed: every route shares the same header, then lead, then cards shape that R5 enforced.

## Global Constraints

- **Spec §5, verbatim:** "Retain investment-focused views and existing routes during transition. A navigation change must not change the scope of an existing tax or rebalance calculation implicitly." No adapter query, engine, policy format or calculation changes. Charts receive the same series, only unscaled.
- **Language and data:**
  - Repo text (code, comments, commit messages, PR titles and bodies) is English only.
  - Korean appears only as copy values in `lib/ui-copy/` and as the `억`/`만` unit strings that `lib/chart-format.ts` emits, which tests assert verbatim.
  - No real figures or identifiers from the maintainer's data anywhere, tests included.
  - PR bodies use one line per paragraph.
- No new npm dependencies.
- **R1 copy rules:**
  - every visible string comes from `lib/ui-copy/` (G1–G3, G12 at baseline);
  - `EMPTY_VALUE = '—'`;
  - `fmtDate(value, language)`.
- **R2 primitive rules:**
  - no hand-written grid outside `components/layout.tsx` (baselines only go down);
  - no primitive takes `className` for colour, size, padding or margin;
  - footnotes are `Note`.
- **R3 status rules:**
  - colours go through `lib/tone.ts`;
  - one `PageHeader status`, linked as `lib/header-status.ts` requires;
  - one bare `accent` per page.
- **R4/R5 rules:**
  - `navSections()`/`activeHref` are untouched;
  - ticker links keep exact `ticker` + `market`;
  - operator detail stays in `OperatorDetails`;
  - one home per data block (`tests/page-blocks.test.ts`);
  - the R5 page shape still passes: `pnpm ui:shape`, at most 10 cards, lead top ≤ 840 px at 1440×1000, en and ko.
- **Pixel rule:**
  - Every task lists its intended visual changes.
  - The controller captures the screenshot net (`node scripts/snap-ui.mjs`, sample server on 127.0.0.1:3120) before and after each task, back to back in this worktree. The first baseline is captured at the R6 base.
  - Tasks 1–3 change nearly every page by design; their review reads the compare list against each task's intended list, page by page.
  - An unlisted changed file is a defect.
  - After any `pnpm build`, `rm -rf .next` and restart the server.
- **Gates after every task**, on Node 22 (`export PATH=/Users/jackpark/.nvm/versions/node/v22.22.3/bin:$PATH`): `pnpm typecheck && pnpm lint && pnpm test && pnpm ui:guardrails && pnpm build`.
  - Known local-only failures that pass in CI: the Toss Bank balance test and the `parseLlmJson` 200 ms timing test under load.
- **Long account names** are checked with sample rows only. The second plan suggests a development copy pulled from production for table work; that needs the maintainer's explicit OK before any command touches the ops host.
- Commit after each task with a conventional subject and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **An old sort bookmark** (`/holdings?sort=brokerage:asc`, and the same on `/lots`, `/transactions` and `/realized`) renders the page's default sort with no error and no header marked sorted. Task 4 tests `parseSort` + `sortRows` with an unknown key.
- **Axis values at the edges:**
  - `0`, `-120,000,000`, `9,999`, `10,000`, `99,999,999` and `100,000,000` in KRW, in both languages;
  - `1,500` in USD with `language: 'ko'`;
  - `NaN` must not reach a tick.

  Task 6 tests each value.
- **A chart whose series are all `null`**, or which has an empty `data` array, renders its `emptyMessage` instead of an axis drawn from `-Infinity`. A one-point series renders normally. Task 6 tests the guard helper.
- **A very long broker or account name** stays on one line in the table and at 375 px. The `title` carries the masked label, never the raw account number. Task 4 tests `AccountCell` with a 40-character account.
- **Reduced motion and back/forward:** nothing animates under `prefers-reduced-motion: reduce`, a client-side navigation after the first load does not replay the fade, and the skeleton does not pulse under reduced motion.
  - Task 2 tests the CSS selector text and that `EntranceMotion` sets the attribute.
  - Task 8 tests the skeleton markup.
  - Both are confirmed by hand in the browser pane.

---

## R6-1 — Type and colour (branch `claude/gui-refactor-2-r6-1`, PR base `main`)

### Task 1: Type scale, label tracking, and `Stat` info

**Files:**
- Modify: `tailwind.config.ts:69-79`, `components/card.tsx:266`, `app/page.tsx:378,398`, `components/metric.tsx:268-276`, `components/table.tsx:52`, `components/layout.tsx:139-162`, `app/review/page.tsx` (unrealized `Stat`), `app/positions/[market]/[ticker]/page.tsx` (freshness `Stat`)
- Test: `tests/ui-primitives.test.ts`

**Interfaces:**
- Produces: `Stat` gains `info?: ReactNode`, rendered as a `HelpPopover` after the label, the same way `MetricField` renders `info`. The `fontSize` key `hero-sm` exists; `display` does not.

- [ ] **Step 1: Write the failing tests** in `tests/ui-primitives.test.ts`:
  - `MetricHeroCard renders the hero at 36px on a phone and 42px from sm`: the markup contains `text-hero-sm` and `sm:text-hero`, and does not contain `text-display`.
  - `Label sets Korean solid`: `renderToStaticMarkup(<Label>x</Label>)` contains `[&amp;:lang(ko)]:tracking-normal`. Also assert this for the `eyebrow` variant.
  - `Stat renders an info popover when given info`: the markup contains `getUiCopy('en').common.help` (the `HelpPopover` trigger's `aria-label`). Without `info`, it does not.
- [ ] **Step 2: Run** `node --import tsx --test tests/ui-primitives.test.ts`. Expected: the three new tests FAIL.
- [ ] **Step 3: Implement.**
  - `tailwind.config.ts` `fontSize`: add `'hero-sm': '36px'` and delete `display`.
  - `MetricHeroCard` value: `text-hero-sm … sm:text-hero`.
  - `app/page.tsx:378,398`: `text-hero` → `text-metric`.
  - `Label` and `table.tsx:52`: append `[&:lang(ko)]:tracking-normal`.
  - `Stat`: add `info`, using the same `HelpPopover` as `MetricField` (`components/metric.tsx`).
  - Restore the glossary text on `/review`'s unrealized `Stat` and the position page's freshness `Stat`, from the same `glossary` keys they used before R5 (`git show 713dbcc:app/review/page.tsx` and `git show 713dbcc:'app/positions/[market]/[ticker]/page.tsx'` show the old `info`).
- [ ] **Step 4: Run** the focused test (PASS), then the gates.
- [ ] **Step 5: Intended visual changes.**
  - Every page with a `MetricHeroCard`: the hero figure is 42 px on desktop (was 52) and 36 px on a phone (was 42).
  - `/`: the two companion figures are 28 px.
  - Every Korean page: overline labels and table headers lose their letter spacing.
  - `/review` and the position page: an info trigger beside one stat.
- [ ] **Step 6: Commit** `refactor(ui): hero 42/36, Korean labels set solid, Stat takes info`.

### Task 2: Gradient budget and first-load motion

**Files:**
- Create: `components/EntranceMotion.tsx`, `tests/gradient-budget.test.ts`
- Modify: `styles/jp-theme.css` (`.t-eyebrow` gradient block, stagger selectors, header comment), `components/PageHeader.tsx:75,84`, `components/SidebarNav.tsx:51`, `components/Sidebar.tsx:72-77`, `app/layout.tsx` (mount `EntranceMotion`)

**Interfaces:**
- Produces: `EntranceMotion(): null`, a `'use client'` component mounted once in the root layout. `PageHeader` keeps its props; only its classes change.

- [ ] **Step 1: Write the failing tests** in `tests/gradient-budget.test.ts`:
  - `gradients are named only where the budget allows`: scan `app/**/*.tsx`, `components/**/*.tsx` and `styles/*.css` for `--gradient-full`, `--gradient-mini`, `--gradient-text` and `t-emph-gradient`.
    - Assert that the set of files using them is exactly `components/card.tsx`, `components/SidebarNav.tsx`, `components/PageHeader.tsx`, `styles/jp-theme.css` and `styles/globals.css`.
    - Assert that `components/SidebarNav.tsx` names `--gradient-mini` and not `t-emph-gradient`.
  - `the title spends one gradient`:
    - `PageHeader` with `emphasis` renders `t-emph-gradient` and not the class `ai-page-header`.
    - Without `emphasis`, it renders `ai-page-header` and not `t-emph-gradient`.
  - `the eyebrow is not clipped to a gradient`: the `.t-eyebrow` rules in `jp-theme.css` contain no `background-clip`.
  - `the entrance fade runs on first load only`: `jp-theme.css` contains `:not([data-entered]) .jp-stagger > *` and no bare `[data-theme="jp"] .jp-stagger > *` selector.
- [ ] **Step 2: Run** `node --import tsx --test tests/gradient-budget.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** Decision 3 and Decision 4.
  - `EntranceMotion` uses one `useEffect` with `setTimeout(…, 600)` and a cleanup that clears the timer.
  - Update the comment at the top of `jp-theme.css` to list the live classes and the budget.
- [ ] **Step 4: Run** the focused test (PASS), then the gates. In the browser pane, confirm by hand:
  - load `/`: the cards fade in;
  - click a sidebar link: no fade;
  - emulate reduced motion: no fade at all.
- [ ] **Step 5: Intended visual changes.**
  - Every page: the eyebrow and breadcrumb text are plain grey.
  - Pages without an emphasis word keep the tick. Pages with one lose the tick above the title.
  - In the sidebar, the active label is plain ink, and the bar stays.
  - On a phone, the top-bar wordmark is plain ink.
  - No other pixels change. The net is captured after the 600 ms settle, so the motion change does not show.
- [ ] **Step 6: Commit** `refactor(ui): three gradients per screen; entrance motion on first load only`.

### Task 3: The last contrast failure

**Files:**
- Modify: `styles/jp-theme.css` (`--accent-warning` and its comment), `components/card.tsx:293`
- Test: `tests/ui-primitives.test.ts`

**Interfaces:**
- Consumes/Produces: none new.

- [ ] **Step 1: Write the failing tests.**
  - `the warning token clears AA inside its own pill`: read `--accent-warning` from `jp-theme.css`. Compute the WCAG ratio of that colour against the 10% blend of itself over `#F7F6F3`, with a small luminance helper in the test. Assert ≥ 4.5.
  - `EmptyState hint is full-strength tertiary`: `<EmptyState hint="h">x</EmptyState>` has `text-ink-3` and not `text-ink-3/80`.
- [ ] **Step 2: Run.** Expected: FAIL. The current token gives 4.45.
- [ ] **Step 3: Implement.**
  - `--accent-warning: #8F570A`. Update the comment to give the three ratios from the survey.
  - `card.tsx:293`: `text-ink-3`.
- [ ] **Step 4: Run** the focused test, the gates, then `node scripts/a11y-audit.mjs --base http://127.0.0.1:3120`. Expected: `0 distinct violation(s)`.
- [ ] **Step 5: Intended visual changes.** Warning text, pills and borders on every page that shows one are one step darker. `EmptyState` hints are slightly darker.
- [ ] **Step 6: Commit** `fix(a11y): warning token and metric hint clear AA`. Open the R6-1 PR after this task.

## R6-2 — Tables and charts (branch `claude/gui-refactor-2-r6-2`, stacked on R6-1)

### Task 4: One account cell

**Files:**
- Modify: `components/PositionCell.tsx` (add `AccountCell`), `app/holdings/page.tsx:110-111`, `app/lots/page.tsx:105-106`, `app/transactions/page.tsx:86-87`, `app/realized/page.tsx:178-179`, `app/positions/[market]/[ticker]/page.tsx:270-271`, the copy modules of those pages (drop the unused `broker` column label only where nothing else reads it)
- Test: `tests/ui-primitives.test.ts`, `tests/table-sort.test.ts` (new)

**Interfaces:**
- Produces: `AccountCell({ brokerage, account }: { brokerage: string | null; account: string | null }): JSX.Element`.

- [ ] **Step 1: Write the failing tests.**
  - `AccountCell shows broker over the masked account on one line each`:
    - For `brokerage: 'Sample Securities'` and an `account` of 40 characters ending in digits, the markup contains both lines.
    - Both lines carry `truncate`.
    - `title` equals `` `Sample Securities · ${maskAccountLabel(account)}` ``, and the raw `account` string does not appear anywhere in the markup.
  - `AccountCell with no broker shows the account alone`: there is no empty first line and no leading `·` in `title`.
  - `an unknown sort key falls back`:
    - `parseSort('brokerage:asc', fallback)` gives `{ key: 'brokerage', … }`.
    - `sortRows(rows, thatSort, columns)` with no `brokerage` column returns rows in their input order. If today's behaviour differs, the test pins input order, and the pages pass the default sort when the parsed key matches no column.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** Decision 6 on the five tables.
  - The merged column keeps `priority: 'secondary'` where the account column had it.
  - On the position page, it is `primary`, because that table exists to list accounts.
- [ ] **Step 4: Run** the focused tests and the gates.
- [ ] **Step 5: Intended visual changes.**
  - `/holdings`, `/lots`, `/transactions`, `/realized` and the position page: one account column replaces two.
  - Rows may get shorter because names no longer wrap.
- [ ] **Step 6: Commit** `refactor(tables): one account cell for broker and account`.

### Task 5: Mobile column priority on four pages

**Files:**
- Modify: `app/reconciliation/page.tsx`, `app/income/page.tsx`, `app/rebalance/page.tsx`, `app/positions/[market]/[ticker]/page.tsx` (column definitions only)
- Test: `tests/page-blocks.test.ts` is unchanged. Add `tests/table-priority.test.ts`.

**Interfaces:** none.

- [ ] **Step 1: Write the failing test.** `tables with six or more columns hide some below md`:
  - For each of the four page files, parse each `columns={[ … ]}` literal with a regex over `key:` entries, and `priority:` within the same object.
  - Assert that every array with ≥ 6 keys has at most 4 entries without a `priority`, or with `priority: 'primary'`.
- [ ] **Step 2: Run** `node --import tsx --test tests/table-priority.test.ts`. Expected: FAIL on all four files.
- [ ] **Step 3: Implement** Decision 7. Do not change column order, labels or renderers.
- [ ] **Step 4: Run** the focused test and the gates.
- [ ] **Step 5: Intended visual changes.** None at 1440, because `secondary` shows from `md` and `tertiary` from `xl`. At 375 the four pages show fewer columns.
- [ ] **Step 6: Commit** `refactor(tables): column priority on reconciliation, income, rebalance, position`.

### Task 6: The chart contract

**Files:**
- Create: `lib/chart-format.ts`, `tests/chart-format.test.ts`
- Modify: `components/charts.tsx` (all five charts), `app/page.tsx:70-73,207,450,523-545`, `app/net-worth/page.tsx:41,187-202`, `app/income/page.tsx:147`, `app/fx/page.tsx:129`, `app/crypto-premium/page.tsx:171-180`, `app/cash-inflow/page.tsx:253`, the copy modules of those pages (axis labels and empty messages; delete `chartAxisKrw`/`chartAxisUsd` text that says "million")

**Interfaces:**
- Produces, in `lib/chart-format.ts`:

```ts
export type ChartUnit =
  | { kind: 'money'; currency: 'KRW' | 'USD' }
  | { kind: 'percent' }
  | { kind: 'number'; suffix?: string }
export function axisTick(value: number, unit: ChartUnit, language: Language): string
export function tooltipValue(value: number | null | undefined, unit: ChartUnit, language: Language): string
export function hasPlottablePoint(data: Record<string, unknown>[], keys: string[]): boolean
```

- Every chart in `components/charts.tsx` takes `unit: ChartUnit`, `language: Language` and `emptyMessage: ReactNode`. `valuePrefix`, `valueSuffix` and `yAxisPrefix`/`yAxisSuffix` are removed, and `axisLabel` stays optional with no default.

- [ ] **Step 1: Write the failing tests** in `tests/chart-format.test.ts`:
  - `axisTick ko KRW`: `0 → '0'`, `9_999 → '9,999'`, `10_000 → '1만'`, `35_000_000 → '3,500만'`, `99_999_999 → '1억'` (rounding reached 10,000만, so it promotes), `100_000_000 → '1억'`, `120_000_000 → '1.2억'`, `-120_000_000 → '-1.2억'`.
  - `axisTick en KRW`: `900 → '₩900'`, `350_000 → '₩350K'`, `1_200_000 → '₩1.2M'`, `-1_200_000 → '-₩1.2M'`.
  - `axisTick USD ignores language`: `1_500` gives `'$1.5K'` for both `'ko'` and `'en'`.
  - `axisTick percent`: `12.34 → fmtPct(12.34, { digits: 0 })`.
  - `tooltipValue money is the full amount`: equals `fmtMoney(value, currency)` for one KRW and one USD value. `null → EMPTY_VALUE`.
  - `hasPlottablePoint`:
    - `[]` → false;
    - all-null rows → false;
    - a row with `NaN` only → false;
    - one finite value → true.
- [ ] **Step 2: Run** `node --import tsx --test tests/chart-format.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `lib/chart-format.ts` per Decisions 8–9. Then:
  - Move each chart onto it. The Y-axis `tickFormatter` is `(v) => axisTick(v, unit, language)`, and one shared tooltip `formatter` uses `tooltipValue`.
  - Each chart returns `<EmptyState>{emptyMessage}</EmptyState>` when `!hasPlottablePoint(data, seriesKeys)`.
  - Pages pass raw values (remove `displayBaseMillions` and the net-worth division) and keep `money(value, …)` where they format a single figure.
  - Add the empty messages to the copy modules that lack them.
  - Pages that already guard keep their guard; it simply never triggers the chart's own.
- [ ] **Step 4: Run** the focused test and the gates. In the browser pane, open `/`, `/net-worth`, `/fx` and `/cash-inflow` in both languages and hover one point on each. The axis reads in 억/만 in Korean and ₩M/K in English, and the tooltip shows the full amount.
- [ ] **Step 5: Intended visual changes.**
  - The axis ticks and tooltips of every chart.
  - The axis titles on `/`, `/net-worth` and `/fx` (no more "million").
  - `/net-worth`, `/income`, `/fx` and `/cash-inflow` show an empty state where the sample has no history.
- [ ] **Step 6: Commit** `refactor(charts): one value, axis, tooltip and empty contract; Korean units`. Open the R6-2 PR after this task.

## R6-3 — Mobile, loading, guide (branch `claude/gui-refactor-2-r6-3`, stacked on R6-2)

### Task 7: Mobile layout and the remaining small targets

**Files:**
- Modify: `components/layout.tsx:88-101`, `components/Sidebar.tsx:123-142`, `components/AssetCoverageNote.tsx:28,49,65`, `components/AnnualTaxSummary.tsx:40-42`, `app/daily-briefing/page.tsx` (the published-page link), `app/realized/page.tsx` (the not-covered summary)
- Test: `tests/ui-primitives.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests.**
  - `KpiBand is two across on a phone`: the markup contains `grid-cols-2`.
  - `AnnualTaxSummary links have a 24px target`: each of its three links has `min-h-6`.
  - `AssetCoverageNote summaries have a 24px target`: both `<summary>` elements carry `min-h-6 leading-6`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** Decisions 10 and 11. The sidebar controls block moves inside the `mt-auto` footer `div`, before `copy.readOnly`, with its spacing kept.
- [ ] **Step 4: Run** the focused test, the gates, then `node scripts/mobile-audit.mjs --base http://127.0.0.1:3120`. Expected: `0 of 29 routes with findings`.
- [ ] **Step 5: Intended visual changes.**
  - Every page with a `KpiBand`, at 375: two columns.
  - Every page: the sidebar controls sit at the bottom.
  - `/`, `/net-worth`, `/daily-briefing` and `/realized`: links and summaries gain a few pixels of height.
- [ ] **Step 6: Commit** `fix(mobile): two-across KPI band, controls in the sidebar footer, 24px targets`.

### Task 8: Loading skeleton

**Files:**
- Create: `components/PageSkeleton.tsx`, `app/loading.tsx`
- Modify: `lib/ui-copy/common.ts` (`loading`: en `'Loading'`, ko `'불러오는 중'`)
- Test: `tests/ui-primitives.test.ts`

**Interfaces:**
- Produces: `PageSkeleton({ language }: { language: Language }): JSX.Element`. `app/loading.tsx` reads the language the way `app/not-found.tsx` does (`await getLanguage()` from `@/lib/i18n-server`).

- [ ] **Step 1: Write the failing test.** `PageSkeleton announces loading without motion by default`:
  - the markup has `role="status"`, `aria-busy="true"` and an `sr-only` element containing `getUiCopy('ko').common.loading`;
  - it has `motion-safe:animate-pulse` and no bare `animate-pulse`;
  - it has exactly three `rounded-md` card outlines.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** Decision 12. Use layout primitives only (no hand-written grid). Use `bg-surface` blocks and no copy other than the `sr-only` line.
- [ ] **Step 4: Run** the focused test and the gates. In the browser pane, throttle the network and navigate between two routes to see the skeleton.
- [ ] **Step 5: Intended visual changes.** None in the net, since captures wait for the page.
- [ ] **Step 6: Commit** `feat(ui): route loading skeleton`.

### Task 9: Guide, dead code, acceptance

**Files:**
- Modify: `docs/ui-guide.md` ("Type and colour", "Layout", "Checking a change", plus a new "Charts" and "Tables" subsection), `lib/ui-copy/pages/taxPlanning.ts:15,412`, `lib/tone.ts:337`, the tests that read them
- Test: existing suites

**Interfaces:** none.

- [ ] **Step 1: Delete** `enums.taxYearProfileStatus` and `TAX_PROFILE_STATUS_SEVERITY`, along with the assertions that read only them. Run `command grep -rn "taxYearProfileStatus\|TAX_PROFILE_STATUS_SEVERITY" app components lib scripts tests` and expect no output.
- [ ] **Step 2: Write the guide.** Each subsection gives its rule and names its check:
  - hero 42/36 with companions at `metric`;
  - Korean labels set solid;
  - the three-gradient budget and its test;
  - first-load motion;
  - warning token ratios;
  - `AccountCell` and the masked `title`;
  - the column priority rule and its test;
  - the chart contract (`ChartUnit`, `axisTick`, `tooltipValue`, `emptyMessage`, no pre-scaled data);
  - the two-across `KpiBand`;
  - the sidebar footer;
  - the 24 px target recipes;
  - `PageSkeleton`.

  Also record decisions 7, 8 and 10 as already true.
- [ ] **Step 3: Acceptance.** Run the gates, then:
  - `node scripts/a11y-audit.mjs` → 0 violations;
  - `node scripts/mobile-audit.mjs` → 0 routes;
  - `pnpm ui:shape` → pass in en and ko.

  Capture the final net back to back with the R6 base and attach the changed-file list, grouped by task, to the PR.
- [ ] **Step 4: Commit** `docs(ui-guide): R6 type, gradient, table, chart, mobile and loading rules`. Open the R6-3 PR.
