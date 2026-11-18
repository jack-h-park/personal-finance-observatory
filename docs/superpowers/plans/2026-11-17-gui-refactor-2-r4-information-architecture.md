# GUI Refactor 2, R4: Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organize the sidebar into the product spec's four areas plus Settings, give every data block one home, and let the reader find a page from its sidebar name and return from any nested page without a back link.

**Architecture:** Two stacked pull requests off main. R4-1 (Tasks 1–4) restructures the sidebar copy into Overview / Assets & Cash Flow / Taxes / Review & Data / Settings, adds a pure active-route resolver and a `PageHeader` `parent` breadcrumb, folds `/cost-basis` into `/holdings` and `/dividends` into `/income` behind redirects, and links a position to its lots, realized lots and transactions. R4-2 (Tasks 5–8) trims the overview and review pages to what is unique to them, makes `/data-ops` the one work queue, moves the FBAR worksheet to its own `/fbar` route under Taxes, and folds operator-only detail (paths, stderr, hashes) behind one `OperatorDetails` disclosure.

**Tech Stack:** Next.js 15 app router, React 19 server components, Tailwind 3 with the tokenized theme, `node:test` through `tsx --test`, `renderToStaticMarkup` for component tests, the guardrail script (`scripts/ui-guardrails.mjs`), the screenshot net (`scripts/snap-ui.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-10-personal-finance-observatory-design.md` §5 (product organization; binding) and §7 "Tax screens and comparison rules" (the `/taxes` routes). The second GUI refactoring plan (Claude Docs, 2026-10-30, https://claude.ai/artifact/DWkduh8vd3v8xEA1kUauwJ) argues the work item by item: "R4 — 정보 구조", "목표 정보 구조", "중첩 라우트", and the diagnosis in "직관성 진단". Where the two disagree, §5 wins: the 2차 plan's sections were drawn before the spec existed.

## Survey (main at c407d0b + R3)

- Sidebar (`lib/ui-copy/pages/sidebar.ts`): five sections — Core Workflows, Tax, Detailed Records (collapsible), All assets (`supplementary`, hidden without supplementary data), Operations & Data (collapsible). `/rebalance/settings` is in no section and unreachable from the sidebar. `ROUTE_HREFS` (`lib/page-names.ts:20-46`) has 25 entries; `tests/page-names.test.ts` and `tests/page-headings.test.ts` read the sidebar through `getPageCopy('sidebar', …)`.
- `components/Sidebar.tsx`: `isActive` special-cases `/taxes` (`:31`); nested routes with no sidebar entry (`/positions/…`) light nothing; collapsible sections use `key={section:pathname}` (`:172`), so they re-close on every navigation; two brand lockups (JHP mark + short name, then eyebrow + gradient wordmark); the language, currency and asset-view controls sit above the navigation.
- The asset-view switch option and the supplementary section are both named 전체 자산 / All assets. The default view is already `all` (`lib/asset-view.ts:5`), so §5's all-assets entry point holds.
- Back links: `PageHeader` has no back prop; `rebalance/proposals/[id]` (`:972-978`), `tax-planning/plans/[id]` (`:70-80`), `rebalance/settings` (`:109-117`) and `positions/[market]/[ticker]` (`:201-206`) pass a `TextLink` in `actions`; `taxes/records/[id]` renders a bare `TextLink` below the header (`:60`) and passes no eyebrow.
- `/cost-basis` = `/holdings` + a `status` filter group, `cost_status` badge, `cost_note`, price/day-change/percent columns, a method card and a price card (`getCostBasisHoldings` vs `getHoldings`). `/dividends` (63 lines) has nothing `/income` lacks. Existing redirects are `redirect()` in a `page.tsx` (`app/positions/page.tsx`).
- `/lots`, `/realized`, `/transactions` read `q`, `sort` and their filter groups; none reads `ticker`. Search is `applySearch` (`lib/table-filter.ts:72`); realized parsing is `queryRealized` (`lib/realized-lots-query.ts`).
- Overview (`app/page.tsx`): the cost-basis top-holdings chart (`:660`) and the largest-positions card (`:709`) both list `getTopHoldings` by base cost beside the concentration card (`:423`), which lists the same; the dividend yearly chart (`:677`) duplicates `/income`; transaction types (`:724`); a freshness card (`:411`) duplicates the header pill; in the all view the cumulative total-assets chart, range links, children toggle and event list (`:603-657`) duplicate `/net-worth` (`:222-263`) function for function.
- Review (`app/review/page.tsx`): market summary (`:118`), operational readiness (`:151`, the header pill's anchor), largest positions by value (`:161`) are not unique to the page. Concentration is by market value with cost fallback (`portfolio-db.ts:2846-2885`); the overview's is by cost; both are labelled concentration.
- Queues: `/data-ops` (`data-ops-priority-work`) and `/reconciliation` (`reconciliation-action-queue`) render the same `ActionQueueItem` type built twice (`lib/adapters/portfolio-db.ts:4565-4591`, `4775-4792`); three of eight row links point at their own page, and both lists carry `source_freshness`, `validation` and `valuation`.
- FBAR / Form 8938: a card on `/net-worth` (`:391-441`, copy `netWorth.fbar`, data `getForeignAccountMaxima`, param `fbarYear`); the CLI `pnpm fbar:table` (`lib/cli/fbar-table.ts`) uses the same function.
- Operator detail on reader pages: the data-map subtitle prints the absolute data directory (`app/data-map/page.tsx:45`); `/health` prints `stderrTail` in a `<pre>` (`:212-219`) and the refresh-runs file path (`:171`); the position page shows an evidence-summary card (`:400`) and a technical-lineage card with mtime and sha256 (`:413`); the en `dataOps` queue copy tells the reader to run `pnpm refresh` (`dataOps.ts:110,135`; ko has no command). No shared `<details>` component exists; eleven raw ones do.

## Decisions this plan makes (review these)

The maintainer chose (2026-11-17): the spec §5 four areas plus Settings; `/fbar` as a new route; `/cost-basis` and `/dividends` absorbed behind redirects; two stacked PRs. The rest are mine:

1. **Section labels:** en `Overview`, `Assets & Cash Flow`, `Taxes`, `Review & Data`, `Settings`; ko `개요`, `자산 · 현금 흐름`, `세금`, `검토 · 데이터`, `설정`. The eyebrow above a heading is always the top-level section, including for routes inside the Detailed Records group.
2. **Detailed Records becomes a collapsible group inside Assets & Cash Flow** (transactions, FX, Korea premium), open by default, and it stays as the reader left it across navigation. Review & Data is not collapsible: it holds Portfolio Review and Rebalancing, which are reader pages.
3. **Supplementary gating moves from the section to the item:** Total Assets and Pension carry `supplementary: true` and hide without supplementary data; the section stays. The asset-view switch keeps 주식 / 전체 자산 — the section of that name no longer exists, so the collision (2차 decision 4) is gone without a rename.
4. **One brand lockup, controls at the foot** (2차 decision 12): the desktop sidebar keeps the JHP mark row and drops the eyebrow + gradient wordmark block and its gradient rule; the mobile top bar is unchanged. The three switchers move below the navigation, above the footer text.
5. **Breadcrumb = eyebrow line:** `PageHeader` takes `parent?: RouteHref` and renders the eyebrow as `Section › Parent` with the parent as a link; the heading itself is the current page. `parent` and `eyebrow` are mutually exclusive by type. `/rebalance/settings` becomes a top-level sidebar route and loses its back link; `/rebalance` already links to it.
6. **Active item = the longest sidebar href that prefixes the path**, plus two aliases for routes whose parent is not a path prefix: `/positions` → `/holdings`, `/taxes/records` → `/taxes/history`.
7. **`/holdings` absorbs the cost status filter and two columns** (`cost_status` badge, `cost_note`); the method card, the price card and the price/day-change/percent columns are dropped (the price date lives on `/health`). `/cost-basis?…` redirects to `/holdings?…` with every query parameter kept, since the names match.
8. **Ticker links use an exact `ticker` parameter** with the existing `market` filter, shown as a removable chip above the table, not `q=`: substring search on a one-letter US ticker matches unrelated rows.
9. **Overview keeps the concentration card, now labelled by cost basis; review keeps its concentration card, labelled by market value.** The overview loses the cost chart, the largest-positions card, the dividend chart, the transaction-type card, the freshness card and (all view) the cumulative chart block, which lives on `/net-worth` only; the overview's total-assets card links there. Review loses market summary, operational readiness, largest positions and the freshness KPI.
10. **A header pill whose card is removed stays, unlinked** (overview, review). `/reconciliation` loses its queue card; its pill counts position breaks and links to the card that lists them, and the hero reads the same number (this closes the R3 parked follow-up on the reconciliation hero).
11. **`/fbar` reads `?year=`**; `/net-worth` keeps no FBAR card and no link (the sidebar entry is the way in). The route is always shown: foreign-account data does not depend on supplementary data.
12. **No "same block in three places" guardrail.** The duplicate inventory is a page-level judgement; the allowed repeats are listed in `docs/ui-guide.md` (Task 8) instead.

## Global Constraints

- Spec §5, verbatim: "Retain investment-focused views and existing routes during transition. A navigation change must not change the scope of an existing tax or rebalance calculation implicitly." No adapter's query scope, tax engine input or rebalance policy changes in this plan; only where a block renders.
- Repo text (code, comments, commit messages, PR titles and bodies) is English only; Korean appears only as copy values in `lib/ui-copy/`. No real figures or identifiers from the maintainer's data anywhere, tests included.
- No new npm dependencies.
- Copy rules from R1 bind: every visible string comes from `lib/ui-copy/` (G1–G3, G12 at their baselines); one empty value `EMPTY_VALUE = '—'`; `fmtDate(value, language)` takes the language.
- Primitive rules from R2 bind: no primitive takes `className` for colour, size, padding or margin; lookups are static literal tables; primitives in `components/` are hook-free unless the file is `'use client'`; footnotes are `Note`.
- Status rules from R3 bind: colours only through `lib/tone.ts`; one `PageHeader status` per header, linked only to a card on the same page that lists the issue, with the same count and colour (`lib/header-status.ts`, `tests/linked-issues.test.ts`); at most one bare `accent` per page.
- Pixel rule: every task lists its intended visual changes. The controller captures the screenshot net before and after each task, back to back, and an unlisted changed file is a defect. Removed and added routes in `scripts/snap-ui.mjs` show as removed/added, not changed.
- Guardrail baselines only go down.
- Gates after every task: `pnpm typecheck && pnpm lint && pnpm test && pnpm ui:guardrails && pnpm build` on Node 22. Known local-only failures that pass in CI: the Toss Bank balance test and the `parseLlmJson` 200 ms timing test under load.
- Commit after each task with a conventional subject and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **No supplementary data** (a fresh install with stocks only): Total Assets and Pension disappear from Assets & Cash Flow, the section and its other items remain, and no section renders empty. Task 1 tests the filtered item lists for both states.
- **A nested page reached by a pasted URL** (`/positions/KR/005930`, `/taxes/records/us-2025`, `/rebalance/proposals/<id>`, `/tax-planning/plans/<id>`, `/rebalance/settings`): exactly one sidebar item is active and the breadcrumb names a real parent. Task 1 tests `activeHref` on a table of paths; Task 3 asserts each nested page renders its parent link.
- **An old bookmark** (`/cost-basis?status=missing&market=KR&q=x`, `/dividends?year=…`): it lands on the absorbing page with the filters it can honour. Task 4 tests the redirect targets.
- **A ticker link with nothing to show** (a position with no realized lots, a ticker sold out of every lot): the target page renders its empty state with the ticker chip, whose × clears it; a ticker present in both KR and US keeps the market. Task 4 tests the filter and the chip href.
- **Korean at 375 px and in the 224 px desktop sidebar:** `자산 · 현금 흐름` and `검토 · 데이터` must not wrap inside a word, and a breadcrumb with a long position name must wrap between crumbs, not inside one. Tasks 2 and 3 check the mobile and desktop screenshots.

---

## PR R4-1 — sidebar, breadcrumbs, merges

### Task 1: Navigation model — sections, routes, active item

**Files:**
- Modify: `lib/ui-copy/pages/sidebar.ts` (en and ko), `lib/page-names.ts` (`ROUTE_HREFS`)
- Create: `lib/nav.ts`
- Modify: `tests/page-names.test.ts`, `tests/page-headings.test.ts` (only if `/rebalance/settings` needs a heading entry)
- Test: `tests/nav.test.ts`

**Interfaces:**
- Produces:
  - Sidebar copy shape: `sections: { label: string; items: NavEntry[] }[]`, where `NavEntry = { href: RouteHref; label: string; supplementary?: true } | { group: string; collapsible: true; items: { href: RouteHref; label: string }[] }`. Order and membership exactly as Decision 1–3 and this list: Overview `/`, `/daily-briefing`; Assets & Cash Flow `/holdings`, `/net-worth`*, `/pension`*, `/income`, `/cash-inflow`, group Detailed Records / 상세 기록 [`/transactions`, `/fx`, `/crypto-premium`]; Taxes `/taxes`, `/taxes/history`, `/tax-planning`, `/lots`, `/realized`; Review & Data `/review`, `/rebalance`, `/data-ops`, `/reconciliation`, `/accounts`, `/health`, `/data-map`; Settings `/tax-settings`, `/rebalance/settings` (en `Rebalancing Settings`, ko `리밸런싱 설정`). (* = `supplementary`.) `/cost-basis` and `/dividends` stay listed until Task 4 removes them, inside Detailed Records; `/fbar` arrives in Task 7.
  - `ROUTE_HREFS` gains `/rebalance/settings`.
  - `lib/nav.ts`: `navItems(sections, opts: { supplementary: boolean }): { href; label; section: string; group?: string }[]` (flattened, gated); `activeHref(pathname: string, hrefs: readonly string[]): string | null` per Decision 6, with `ACTIVE_ALIASES = { '/positions': '/holdings', '/taxes/records': '/taxes/history' } as const`.
  - `routeName` and `routeSection` in `lib/page-names.ts` read through `navItems(…, { supplementary: true })`, so group items resolve to their top-level section.

- [ ] **Step 1: Write failing tests** in `tests/nav.test.ts`: `activeHref` returns `/` only for `/`; `/taxes` for `/taxes`; `/taxes/history` for `/taxes/history` and `/taxes/records/us-2025`; `/holdings` for `/positions/KR/005930`; `/rebalance/settings` for `/rebalance/settings`; `/rebalance` for `/rebalance/proposals/abc`; `/tax-planning` for `/tax-planning/plans/x`; `null` for `/nope`. `navItems` with `supplementary: false` omits `/net-worth` and `/pension` and keeps `/holdings`; every section is non-empty in both states; `routeSection('/fx', 'ko')` is `자산 · 현금 흐름` and `routeSection('/rebalance/settings', 'en')` is `Settings`.
- [ ] **Step 2: Run** `pnpm test -- tests/nav.test.ts tests/page-names.test.ts` and confirm the new tests fail.
- [ ] **Step 3: Implement** the copy, `ROUTE_HREFS`, `lib/nav.ts`, and switch `routeName`/`routeSection` to `navItems`. Keep `components/Sidebar.tsx` compiling by reading `navItems` for now (Task 2 owns its rendering).
- [ ] **Step 4: Run the gates.** Intended visual change: every page's eyebrow reads its new section; sidebar order and labels change (rendering of the group is Task 2's).
- [ ] **Step 5: Commit** `refactor(nav): the sidebar follows the four product areas plus Settings`.

### Task 2: Sidebar rendering

**Files:**
- Modify: `components/Sidebar.tsx`
- Create: `components/SidebarNav.tsx`
- Test: `tests/sidebar-nav.test.ts` (create; same `React` import convention as the other component tests)

**Interfaces:**
- Consumes: `navItems`, `activeHref` (Task 1).
- Produces: no new exports. Behaviour: one active item from `activeHref`; collapsible groups keyed by their label only, open by default, open/closed state held in component state so navigation keeps it, and forced open when the active item is inside; supplementary items filtered by `showAllAssets`; Decision 4 layout.

- [ ] **Step 1: Write failing tests** with `renderToStaticMarkup` against a pure `SidebarNav({ sections, pathname, showAllAssets, openGroups, onToggle })` extracted into `components/SidebarNav.tsx` (no test mocks `next/navigation` today; `Sidebar` passes `usePathname()` in): at `/positions/KR/005930` exactly one `aria-current="page"` link, `href="/holdings"`; at `/fx` the Detailed Records `<details>` has `open`; with `showAllAssets={false}` no `/net-worth` link; the markup contains `BRAND.wordmark` once (mobile bar) and the switcher labels after the `<nav>`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates; controller checks the 224 px sidebar and 375 px drawer** in both languages for wrapping. Intended visual change: sidebar regrouped, one lockup, switchers at the foot, Detailed Records open.
- [ ] **Step 5: Commit** `refactor(nav): one active item, groups that stay open, controls at the foot`.

### Task 3: Breadcrumb through `PageHeader parent`

**Files:**
- Modify: `components/PageHeader.tsx`, `lib/ui-copy/common.ts` (only if a separator label is needed for screen readers)
- Modify: `app/rebalance/proposals/[id]/page.tsx`, `app/tax-planning/plans/[id]/page.tsx`, `app/positions/[market]/[ticker]/page.tsx`, `app/taxes/records/[id]/page.tsx`, `app/rebalance/settings/page.tsx`
- Test: `tests/ui-primitives.test.ts`, `tests/page-headings.test.ts`

**Interfaces:**
- Consumes: `routeName`, `routeSection` (Task 1).
- Produces: `PageHeader` prop `parent?: RouteHref`, exclusive with `eyebrow` (`{ eyebrow?: string; parent?: never } | { parent: RouteHref; eyebrow?: never }`). Renders `<nav aria-label={common.breadcrumb}>` holding the section text, a `›` separator (`aria-hidden`), and `<Link href={parent}>{routeName(parent)}</Link>`, in the eyebrow's place and style. Parents: proposals → `/rebalance`, plans → `/tax-planning`, positions → `/holdings`, tax records → `/taxes/history`. The back `TextLink`s on those four pages and on `/rebalance/settings` are removed; `/rebalance/settings` takes `eyebrow={routeSection('/rebalance/settings', language)}`.
- Copy `common.breadcrumb`: en `Breadcrumb`, ko `현재 위치`.

- [ ] **Step 1: Write failing tests:** `PageHeader` with `parent="/holdings"` renders a link to `/holdings` with the sidebar label and the section text, and no element with the eyebrow class outside the nav; a source assertion that none of the five pages contains `copy.back`, `copy.backToPlanner` or `copy.backToHoldings` in JSX.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; delete back-link copy keys no page reads any more.
- [ ] **Step 4: Run the gates.** Intended visual change: the five pages lose the right-side back link; four gain `Section › Parent` above the heading; `/taxes/records/[id]` gains the eyebrow line it lacked.
- [ ] **Step 5: Commit** `feat(nav): nested pages name their parent above the heading`.

### Task 4: Absorb `/cost-basis` and `/dividends`; ticker links

**Files:**
- Modify: `app/cost-basis/page.tsx`, `app/dividends/page.tsx` (each becomes a redirect), `app/holdings/page.tsx`, `lib/ui-copy/pages/holdings.ts` (and remove `costBasis`/`dividends` copy modules no longer read)
- Modify: `app/lots/page.tsx`, `app/realized/page.tsx`, `lib/realized-lots-query.ts`, `app/transactions/page.tsx`, `app/positions/[market]/[ticker]/page.tsx`, `lib/table-filter.ts`
- Modify: `lib/ui-copy/pages/sidebar.ts`, `lib/page-names.ts`, `scripts/snap-ui.mjs` (drop the two routes), `app/page.tsx` only if it links to either route
- Create: `components/TickerFilterChip.tsx`
- Test: `tests/redirects.test.ts` (create), `tests/table-filter.test.ts` (extend or create)

**Interfaces:**
- Produces:
  - `redirectWithQuery(path: string, searchParams: Record<string, string | string[] | undefined>): string` in `lib/table-filter.ts` (keeps every parameter, repeats arrays). `/cost-basis` → `redirect(redirectWithQuery('/holdings', params))`; `/dividends` → `redirect('/income')`.
  - `/holdings` reads `status` (filter group over `cost_status`) and shows `cost_status` (badge via `COST_BASIS_STATUS_TONE` in `lib/tone.ts`, label from the copy `/cost-basis` used) and `cost_note`. Use `getCostBasisHoldings` if it returns every field `/holdings` renders; otherwise add `cost_status` and `cost_note` to `getHoldings`' select. Either way the row count and totals of an unfiltered `/holdings` must not change (Global Constraints, scope).
  - `applyTicker<T extends { ticker: string; market?: string }>(rows: T[], ticker: string | undefined): T[]` in `lib/table-filter.ts` — exact, case-sensitive match; `undefined` or empty returns `rows`.
  - `TickerFilterChip({ ticker, clearHref, label })`: a `LinkChip` reading `label` (copy `common.tickerFilter: (ticker: string) => string`, en `` `Ticker: ${ticker}` ``, ko `` `종목: ${ticker}` ``) with an × whose href is the current URL without `ticker`. Rendered above the table only when `ticker` is set.
  - `/lots`, `/realized` (through `queryRealized`), `/transactions` read `ticker`. The position page links to `/lots?ticker=T&market=M`, `/realized?ticker=T&market=M&year=<ALL_YEARS>` (`ALL_YEARS` from `lib/realized-lots.ts`) and `/transactions?ticker=T&market=M` (copy `positionDetail.links.{lots,realized,transactions}`, en `Tax lots`/`Realized lots`/`Transactions`, ko the sidebar labels of those routes).
- [ ] **Step 1: Write failing tests:** `redirectWithQuery('/holdings', { status: 'missing', market: 'KR', q: 'x' })` keeps all three; calling the `/cost-basis` page default export throws a redirect whose digest contains `/holdings?` with `status=missing`; the `/dividends` export redirects to `/income`; `applyTicker` keeps only exact matches, returns all rows for `undefined`, returns `[]` for an unknown ticker; `queryRealized` with `ticker` filters; the chip's clear href drops `ticker` and keeps `market` and `q`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; remove `/cost-basis` and `/dividends` from the sidebar, `ROUTE_HREFS`, `scripts/snap-ui.mjs`, and any copy module only they read.
- [ ] **Step 4: Run the gates.** Intended visual change: `/holdings` gains the status chips and two columns; the position page gains three links; `cost-basis` and `dividends` captures are removed from the net.
- [ ] **Step 5: Commit** `refactor(ia): cost basis and dividends fold into holdings and income; positions link to their records`.

## PR R4-2 — one home per block, one queue, FBAR, operator detail

Stacked on R4-1's branch; after R4-1 merges, merge main into it and retarget to main.

### Task 5: Overview and review keep what is theirs

**Files:**
- Modify: `app/page.tsx`, `lib/ui-copy/pages/overview.tsx`, `app/review/page.tsx`, `lib/ui-copy/pages/review.ts`, `lib/header-status.ts` (`reviewLinkedIssues`), `tests/linked-issues.test.ts`
- Test: `tests/page-blocks.test.ts` (create: source assertions)

**Interfaces:**
- Produces:
  - Overview removes the cards listed in Decision 9 and their now-unused queries (`getTransactionTypes`, `getDividendByYear`, `getTotalAssetsSeries`, `getChildAssets`, `getAssetEvents`, the overview's `getOperationalHealth` call if only the freshness card used it — keep whatever feeds the header pill). The concentration card gets a `Note` (copy `overview.concentrationBasis`, en `By cost basis.`, ko `취득원가 기준.`). The all-view total-assets card gains `TextLink href="/net-worth"` (copy `overview.openTotalAssets`, en `Total assets history`, ko `총자산 추이 보기`).
  - Review removes market summary, operational readiness, largest positions, and the freshness item of the KPI strip. Its concentration card gets a `Note` (copy `review.concentrationBasis`, en `By market value; cost where no price.`, ko `평가금액 기준, 가격이 없으면 취득원가.`).
  - `reviewLinkedIssues` returns a status with no `href` and no card issues (Decision 10); its test changes accordingly.
- [ ] **Step 1: Write failing tests** in `tests/page-blocks.test.ts`: `app/page.tsx` source contains none of `getTransactionTypes`, `getDividendByYear`, `StackedAssetChart`, `AssetEventList`, `topHoldingsByCost`, `freshnessTitle`; `app/review/page.tsx` contains none of `marketSummary`, `operationalReadiness`, `largestPositions`; both contain their `concentrationBasis` copy key. Update `tests/linked-issues.test.ts` for the unlinked review pill.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; delete copy keys nothing reads.
- [ ] **Step 4: Run the gates.** Intended visual change: overview (both views) and review are shorter; concentration cards carry their basis note.
- [ ] **Step 5: Commit** `refactor(ia): overview and review drop the blocks other pages own`.

### Task 6: One work queue

**Files:**
- Modify: `lib/adapters/portfolio-db.ts` (`getDataOpsReview`, `getReconciliationReview`), `app/data-ops/page.tsx`, `app/reconciliation/page.tsx`, `lib/header-status.ts` (`reconciliationLinkedIssues`), `lib/ui-copy/pages/dataOps.ts`, `lib/ui-copy/pages/reconciliation.ts`
- Test: `tests/linked-issues.test.ts`, the existing data-ops/reconciliation adapter tests (find with `grep -l getDataOpsReview tests`)

**Interfaces:**
- Produces:
  - `getDataOpsReview().actionQueue` gains the `position_breaks` kind (same count rule `getReconciliationReview` uses today); `getReconciliationReview()` no longer returns `actionQueue`. One builder, one kind union.
  - Queue `href`s: never the page they are listed on. `manual_mappings` → `#<id of the data-ops card listing manual mappings>`, `valuation` → `#<id of the data-ops card listing valuation gaps>`, `position_breaks` → `/reconciliation#reconciliation-breaks`; `validation` and `source_freshness` stay `/health`. Every anchor target is a `Card id` rendered whenever its row is in the queue.
  - `/reconciliation` drops the queue card; the card listing position breaks gets `id="reconciliation-breaks"`; `reconciliationLinkedIssues(copy, breaks: number)` links there, and the hero reads the same `breaks` number.
  - en queue copy drops the `pnpm refresh` command and says what is stale, matching ko.
- [ ] **Step 1: Write failing tests:** the data-ops queue for a fixture with breaks contains `position_breaks` with href `/reconciliation#reconciliation-breaks`; no queue href equals `/data-ops`; `reconciliationLinkedIssues(copy, 3)` links to `#reconciliation-breaks` with count 3; a source assertion that `app/data-ops/page.tsx` renders `Card id=` for each in-page anchor the adapter emits.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates.** Intended visual change: `/reconciliation` loses its queue card and its pill/hero agree; `/data-ops` gains the breaks row when there are breaks; en queue text changes.
- [ ] **Step 5: Commit** `refactor(ia): the action center is the one work queue`.

### Task 7: `/fbar` under Taxes

**Files:**
- Create: `app/fbar/page.tsx`, `lib/ui-copy/pages/fbar.ts` (register it where page copy modules are registered)
- Modify: `app/net-worth/page.tsx`, `lib/ui-copy/pages/netWorth.ts` (remove `fbar`), `lib/ui-copy/pages/sidebar.ts`, `lib/page-names.ts`, `lib/page-headings.ts` and `tests/page-headings.test.ts` (heading entry), `scripts/snap-ui.mjs` (add `/fbar`), `scripts/ui-guardrails.mjs` (only if G12 flags `FBAR`: add it to the allowed acronyms beside `SHA`)
- Test: `tests/page-names.test.ts` (already covers the new route), `tests/page-blocks.test.ts`

**Interfaces:**
- Produces: route `/fbar`, last item of Taxes; sidebar label en `FBAR / Form 8938`, ko `해외 계좌 신고 (FBAR)`; heading the same label. The page renders the card body that `/net-worth` rendered (year chips, notes, table, aggregate, crypto subsection) from `getForeignAccountMaxima(year)`, with the year from `?year=` under the same `FBAR_FIRST_YEAR` and `lastCompleteYear` rules. `/net-worth` no longer imports `getForeignAccountMaxima`. Copy moves verbatim from `netWorth.fbar` to the `fbar` module.
- [ ] **Step 1: Write failing tests:** `page-blocks` asserts `app/net-worth/page.tsx` does not contain `getForeignAccountMaxima` and `app/fbar/page.tsx` does; `page-names` passes with `/fbar` in `ROUTE_HREFS` and the Taxes section.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates.** Intended visual change: `/net-worth` loses the FBAR card; `/fbar` captures are added; sidebar Taxes gains one item.
- [ ] **Step 5: Commit** `feat(ia): the FBAR worksheet gets its own page under Taxes`.

### Task 8: Operator detail behind one disclosure; the guide

**Files:**
- Create: `components/OperatorDetails.tsx`
- Modify: `lib/ui-copy/common.ts`, `app/data-map/page.tsx`, `lib/ui-copy/pages/dataMap.ts`, `app/health/page.tsx`, `app/positions/[market]/[ticker]/page.tsx`, `docs/ui-guide.md`
- Test: `tests/ui-primitives.test.ts`, `tests/page-blocks.test.ts`

**Interfaces:**
- Produces:
  - `OperatorDetails({ children }: { children: ReactNode })`: a `<details>` (closed) whose `<summary>` reads `common.operatorDetails` (en `Operator details`, ko `운영 정보`), hook-free, no `className` prop.
  - The data-map subtitle no longer contains the data directory; the directory renders inside `OperatorDetails` on that page (copy `dataMap.dataDir: (dir: string) => string`). On `/health`, the stderr tail and the refresh-runs path render inside `OperatorDetails`. On the position page, the evidence-summary and technical-lineage cards move to the bottom of the page inside one `OperatorDetails`.
  - `docs/ui-guide.md` gains an "Information architecture" section: the five sections and what belongs in each; the breadcrumb rule (`parent`, Decision 5); "one home per data block" with the allowed repeats (header pills that summarise another page's count; `/daily-briefing`'s own archive figures; the position page's per-ticker slices); `OperatorDetails` for paths, hashes, stderr and commands; ticker links (Decision 8).
- [ ] **Step 1: Write failing tests:** `OperatorDetails` renders a closed `<details>` with the en summary; `page-blocks` asserts `app/health/page.tsx` has no `stderrTail` outside an `OperatorDetails` element and the data-map subtitle call does not pass `dataDir`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement** and write the guide section.
- [ ] **Step 4: Run the gates.** Intended visual change: data-map subtitle shorter, a closed 운영 정보 disclosure on data-map, health and the position page; the position page's two lineage cards leave the main flow.
- [ ] **Step 5: Commit** `refactor(ia): operator detail folds behind one disclosure`.
