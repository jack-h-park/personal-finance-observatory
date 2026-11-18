# GUI Refactor 2, R5: Page Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/tax-planning`, `/rebalance`, the position page, `/cash-inflow` and `/review`, the reader meets the page's key figure in the first screen, then what blocks acting on it, then the controls, then the detail — in at most ten cards.

**Architecture:** Two stacked pull requests off main. R5-1 (Tasks 1–5) adds a page-shape check that measures the acceptance criteria, then reorders `/tax-planning` (one input bar, the two engines as two labelled sections, the settings echo cards gone) and `/rebalance` (one policy model, the inline target form gone, guardrail figures and reasons from code and copy). R5-2 (Tasks 6–8) reorders the position page into hero → reconciliation → accounts → lots → activity with any open wash-sale window, moves the cash-inflow view switch into its filter bar, tidies `/review`, and writes the page-order rules into the guide. Only where a block renders and which URL inputs a page reads change; no engine, adapter query or policy computation does.

**Tech Stack:** Next.js 15 app router, React 19 server components, Tailwind 3 with the tokenized theme, `node:test` through `tsx --test`, `renderToStaticMarkup` for component tests, Playwright (already used by `scripts/snap-ui.mjs`), the guardrail script (`scripts/ui-guardrails.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-10-personal-finance-observatory-design.md` §5 (binding) and §7 "Tax screens and comparison rules". The second GUI refactoring plan (Claude Docs, 2026-10-30, https://claude.ai/artifact/DWkduh8vd3v8xEA1kUauwJ) argues the work: "R5 — 페이지 재구성 (4 PR)", "페이지 안 순서 (리드가 파묻힌 페이지)", "중첩 라우트", and 부록 A rows for these pages. Where the two disagree, §5 wins. `docs/ui-guide.md` (R3: status, feedback, header; R4: information architecture) binds every task.

## Survey (main at 0e34ab6, R4 merged)

- **`/tax-planning`** (`app/tax-planning/page.tsx`, 505 lines). Order: `FormError` (`:161`), `WashSaleBanner` (`:163`), `WrapperEstimateNote` (`:165`), a settings `<section>` with a numbered three-field GET form and a hand-written `lg:grid-cols-[…]` (`:167-218`), then the hero `MasterPlanOverview` (`components.tsx:72`, `accent`) at `:220`, `SavedPlansPanel`, `MasterScenarioComparison`, `TaxPlanTimeline`, `MasterPlanAnnualTax` (`:229-255`), a closed `<details>` holding `DecisionSummary` + `PlanningMap` (`:257-282`), two echo cards of `/tax-settings` — annual filing profile and base assumptions (`:284-361`) — the annual-target comparison or its "hidden" card (`:363-414`), up to four `ScenarioTimeline` cards (`:416-422`), the single-year tax split and the warnings card (`:424-453`, warnings two screens down), recommended sale lot sequence and all open lot candidates (`:455-461`). Roughly 15 cards.
- Two engines feed it: `buildMonthlySalePlanSet` (hero, scenario comparison, timeline, annual tax, saved plans) and `buildTaxPlan` / `buildMultiYearTaxPlan` (single-year split, warnings, lot sequence, candidates, annual-target comparison, opportunity analysis). Nothing on the page says which figures come from which.
- URL inputs (`:74-98`): `horizon`, `master`, `pace` come from the form; `month`, `page` from the timeline; `scenario`, `objective`, `target`, `annualTarget` have no control. `target` drives `buildTaxPlan`'s `targetCashKrw`; `annualTarget ?? target` drives `buildMultiYearTaxPlan`. The annual amount input existed until `8a36931` removed it; the hidden-comparison copy (`taxPlanning.ts:67-68`) still tells the reader to "enter a KRW amount above". The only link carrying `scenario`/`objective` is the position page's tax preview (`app/positions/[market]/[ticker]/page.tsx:414`), with the policy's own scenario and `minimize-tax`, both defaults.
- Header status (`:149`) reports only example assumptions; the warnings card's count (`plan.summary.warnings.length + operational.staleItems.length`, `:441`) has no pill.
- **`/rebalance`** (`app/rebalance/page.tsx`, 427 lines). First row: allocation by sleeve and proposals (`:105-205`); the hero `MetricHeroCard` (largest market gap) and `HeroAside` are the second row (`:207-252`). Then market target gaps beside the target editor (`:254-296`): with an allocation policy the editor shows the derived US share; without one it is a form posting `saveRebalanceTargets` (`actions.ts:9-15`) to the separate market-split file (`lib/rebalance-policy.ts`). Then add context, outside policy and execution guardrails (`:298-359`), reduce candidates and the tax-sensitive watchlist (`:361-396`), hold/watch (`:398-424`). 12 cards.
- `getRebalanceReview` (`lib/adapters/portfolio-db.ts:3438`) takes the market split from the allocation policy when one exists, else from `getRebalancePolicy()` (saved file or 50%); hard-codes the 2 pp hold band (`:3514`) and the 50% short-term threshold (`:3540`), which the guardrail card repeats as literals `2%` and `50%+` (`page.tsx:344,352`); writes English `reason` sentences on watch and tax-sensitive rows (`:3537,3541`), rendered raw in the reason columns. `scripts/write-briefing-summary.ts:420-424` copies `reason` into the briefing artifact, so the English field is a contract.
- `/rebalance/settings` edits only the allocation policy; nothing but the inline form writes the market-split file.
- **Position page** (`app/positions/[market]/[ticker]/page.tsx`, 540 lines). Order: freshness card (`:211`), first checks — reconciliation status, evidence links, activity coverage (`:222-249`), hero + coverage aside (`:251-297`), R4's record-link row (`:301-305`), reconciliation (second time) / holding mix / transaction mix (`:307-347`), account holdings / account lot profile — the same accounts twice (`:349-388`), activity timeline (`:390-408`), tax preview / open tax lots / transactions / dividends (`:410-507`), `OperatorDetails` with evidence summary and lineage (`:509-537`). 14 cards in the flow, 16 with the two inside the disclosure. No wash-sale signal; `WashSaleBanner` renders on `/` and `/tax-planning` only, from `getWashSaleReview()` (`portfolio-db.ts:5570`, US windows keyed by `ticker`).
- **`/cash-inflow`** (`app/cash-inflow/page.tsx`): the monthly/yearly switch is two `Button`s in the header `actions` (`:195-200`), apart from the `FilterBar` (`:203-212`) that folds on a phone. Each unclassified group's `<details>` shows the JSON rule `<pre>` (`:355`) as soon as it opens. Four cards.
- **`/review`** (`app/review/page.tsx`, R4-trimmed): five cards; the summary is a hand-written `grid grid-cols-2 … sm:grid-cols-3` (`:86`); the concentration rows print the literals `Top 1`, `Top 5`, `Top 10` (`:111-119`).
- `MetricHeroCard` (`components/card.tsx:242`) takes no `id`. `Card` renders `<section class="… shadow-card">`; pages render inside `<main id="main-content">`. Guardrail baseline `hand-written-grid`: position page 4, rebalance 1, review 1, tax-planning page 2.

## Decisions this plan makes (review these)

The maintainer chose (2026-11-17): the allocation policy is the one rebalance model; `/tax-planning` gets an annual-amount control and stops reading the other URL-only inputs; the position page keeps a timeline and a dividends table and drops its full transactions table; two stacked PRs. The rest are mine:

1. **Page order** on every R5 page: lead figure (the page's one `accent` card, with an `id`) → an issues card directly under it, rendered only when it has rows → input controls as a toolbar that is not a card → the detail. An alert that blocks a trade (`WashSaleBanner`) stays above the lead: it renders nothing when no window is open, and its component documents why it goes first.
2. **Card budget:** at most ten `section.shadow-card` inside `<main>` at 1440×1000, not counting cards inside a `<details>`. The lead's top edge sits at or above 840 px, so its title and figure are on the first screen. `scripts/page-shape.mjs` (Task 1) measures both; each page names its lead by `id`.
3. **`/tax-planning` inputs:** the toolbar holds strategy, execution window, horizon and a new annual test amount (`annualTarget`, KRW, commas allowed), with the hints moved into each field's `HelpPopover` and no numbered circles or badge. `scenario` is always the tax policy's `activeScenario`, `objective` always `minimize-tax`; `target` is no longer read, so `buildTaxPlan` gets `targetCashKrw: 0` (today's value whenever the URL lacks it) and `annualTarget` alone drives the multi-year comparison. An old bookmark with these parameters renders the default plan.
4. **`/tax-planning` sections:** a `SectionHeading` "Monthly sale plan" over scenario comparison, timeline, annual tax and saved plans; "Lot-level estimate" over the single-year split, the sale lot sequence, the annual-target comparison and the closed opportunity-analysis disclosure. The two echo cards go; the header's "Edit assumptions" link is the way to them. The recommended sequence and all open candidates share one card (all candidates in a closed `<details>`); the four scenario timelines render inside the annual-target card.
5. **`/tax-planning` header status** gets a `taxPlanningLinkedIssues` helper (R3 pattern): warnings link to `#tax-planning-warnings` and win; with example assumptions too, one label names both; example assumptions alone stay an unlinked attention pill.
6. **`/rebalance` model:** the allocation card is the model; market gaps are labelled as derived from it. Without an allocation policy (or with an invalid one) the market view still reads the saved split or the 50% default, read-only, with a note and a link to `/rebalance/settings`. The inline form, `saveRebalanceTargets`, `saveRebalancePolicy` and the editor copy are deleted; `getRebalancePolicy` stays (it is the fallback).
7. **`/rebalance` cards:** hero row first; hold/watch under it; market gaps (gaining an "existing positions" column for Add rows, replacing the add-context card, and a guardrail `Note` replacing the guardrail card) beside allocation; reduce candidates beside the tax-sensitive watchlist; outside policy beside proposals. 12 → 9.
8. **Guardrail figures come from one place:** `MARKET_GAP_HOLD_PCT = 2` and `SHORT_TERM_WATCH_PCT = 50` exported from `lib/rebalance-policy.ts`, read by the adapter (replacing its literals, same values) and the page; the position cap comes from `rebalance.policy.positionCapPct` as today.
9. **Reasons become codes** beside the English: watch and tax-sensitive rows gain `reasonCode: 'missing_market_value' | 'short_term_heavy'`; the page renders `copy.reasons[reasonCode]`; `reason` stays for the briefing artifact.
10. **Position page cards:** hero (freshness of price and FX folded in as a note line) and coverage aside; wash-sale banner filtered to this ticker; one reconciliation card (status badge in its action; the first-checks card goes, its evidence count moves into `OperatorDetails`, its activity counts are already in the subtitle); one accounts table merging holdings and lot profile; lots (long/short quantities and lot counts as a `TotalsStrip`, links to `/lots` and `/realized` in its action); tax preview (link to plain `/tax-planning`); activity (transaction types as a `TotalsStrip`, the 40-event timeline, link to `/transactions`); dividends. Evidence summary and lineage merge into one sources table inside `OperatorDetails`. Main flow 8, plus the banner when a window is open.
11. **`/cash-inflow`:** the view switch is the first `FilterBar` group (`view`, default `month`), and `FilterBar` groups gain `countsAsFilter?: false` so the switch does not count as an active filter in the folded summary. The JSON rule sits in a nested closed `<details>` inside its group.
12. **`/review`:** the summary becomes a `StatStrip` of `Stat`, the `Top N` literals become `copy.topShare(n)`; nothing else moves.

## Global Constraints

- Spec §5, verbatim: "Retain investment-focused views and existing routes during transition. A navigation change must not change the scope of an existing tax or rebalance calculation implicitly." Concretely: for a URL without the dropped parameters, every `buildTaxPlan`, `buildMultiYearTaxPlan` and `buildMonthlySalePlanSet` input is unchanged; `getRebalanceReview` returns the same figures (constants replace literals of equal value); no adapter query, policy file format or engine changes.
- Repo text (code, comments, commit messages, PR titles and bodies) is English only; Korean appears only as copy values in `lib/ui-copy/`. No real figures or identifiers from the maintainer's data anywhere, tests included. PR bodies use one line per paragraph.
- No new npm dependencies.
- R1 copy rules: every visible string from `lib/ui-copy/` (G1–G3, G12 at baseline); `EMPTY_VALUE = '—'`; `fmtDate(value, language)`.
- R2 primitive rules: no hand-written grid outside `components/layout.tsx` (baselines only go down); no primitive takes `className` for colour, size, padding or margin; footnotes are `Note`.
- R3 status rules: colours through `lib/tone.ts`; one `PageHeader status`, linked only to a card on the page that lists the issue, same count and colour (`lib/header-status.ts`, `tests/linked-issues.test.ts`); one bare `accent` per page; form pages keep `autoRefresh={false}`; policy-changing submits use `ConfirmSubmitButton`.
- R4 rules: `navSections()`/`activeHref` untouched; ticker links keep exact `ticker` + `market`; operator detail stays in `OperatorDetails`; one home per data block (`tests/page-blocks.test.ts`).
- Pixel rule: every task lists its intended visual changes. The controller captures the screenshot net (`node scripts/snap-ui.mjs`, sample server on 127.0.0.1:3120) before and after each task, back to back in this worktree; the first baseline is captured at the R5 base, not copied from `r4-final`. An unlisted changed file is a defect. After any `pnpm build`, `rm -rf .next` and restart the server.
- Gates after every task, on Node 22 (`export PATH=/Users/jackpark/.nvm/versions/node/v22.22.3/bin:$PATH`): `pnpm typecheck && pnpm lint && pnpm test && pnpm ui:guardrails && pnpm build`. Known local-only failures that pass in CI: the Toss Bank balance test and the `parseLlmJson` 200 ms timing test under load.
- The allocation-policy path of `/rebalance` needs `private-data/personal-finance-sample/state/allocation-policy.json` copied from the example for a hand check; remove it afterwards.
- Commit after each task with a conventional subject and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **An old bookmark** (`/tax-planning?scenario=KR_ONLY&objective=harvest-loss&target=5000000`): renders exactly the default plan, no error; `annualTarget=50,000,000` and `₩50000000` both parse to 50,000,000. Task 2 tests `planningInputs`.
- **`/tax-planning` with no warnings and saved assumptions:** no warnings card and no pill; with warnings and example assumptions, one attention pill naming both, linked to `#tax-planning-warnings`. Task 3 extends `tests/linked-issues.test.ts`.
- **`/rebalance` with no allocation policy** (fresh install, the sample) **or an invalid one:** market gaps still render from the saved split or 50%, read-only, with the settings link; no form anywhere on the page. Task 5 asserts the source and the controller checks both states by hand.
- **A position with nothing to show** (no lots, no transactions, no dividends), a KR ticker, and a US ticker with an open window on another ticker: empty states render; the banner appears only for this ticker's own window. Task 6 tests `washSaleForTicker` and `accountRows`.
- **Korean at 375 px:** the tax-planning toolbar and the cash-inflow view chips wrap between controls, never inside a label, and the amount input keeps a 24 px target. Tasks 2 and 7 run `pnpm ui:mobile`.

---

## PR R5-1 — acceptance check, tax planning, rebalancing

### Task 1: Page-shape check

**Files:**
- Create: `scripts/page-shape.mjs`
- Modify: `package.json` (`"ui:shape": "node scripts/page-shape.mjs"`), `components/card.tsx` (`MetricHeroCard` gains `id?: string`, passed to its `Card`)
- Test: `tests/page-shape.test.ts`, `tests/ui-primitives.test.ts`

**Interfaces:**
- Produces:
  - `export const SHAPE_ROUTES = [{ path: '/tax-planning', lead: '#tax-plan-overview' }, { path: '/rebalance', lead: '#rebalance-lead' }, { path: '/positions/KR/005930', lead: '#position-lead' }, { path: '/cash-inflow', lead: '#cash-inflow-lead' }, { path: '/review', lead: '#review-summary' }]` (later tasks add the ids).
  - `export function shapeVerdict(m: { cards: number; leadTop: number | null }, limits = { maxCards: 10, maxLeadTop: 840 }): string[]` — empty when both hold; one message per failure; a missing lead (`null`) fails.
  - CLI: `node scripts/page-shape.mjs --base <url>` visits each route in en and ko at 1440×1000 (same language cookie as `snap-ui.mjs`), counts `main section.shadow-card` with no `details` ancestor, reads the lead's `getBoundingClientRect().top`, prints one line per route-language, exits 1 on any failure. The main body runs only when the file is executed directly, so the test can import it.
- [ ] **Step 1: Write failing tests:** `shapeVerdict({ cards: 10, leadTop: 840 })` is `[]`; `{ cards: 11, leadTop: 100 }` has one message naming 11; `{ cards: 3, leadTop: 900 }` has one message; `{ cards: 3, leadTop: null }` has one message. `MetricHeroCard` with `id="x"` renders `id="x"` on its section.
- [ ] **Step 2: Run** `pnpm test -- tests/page-shape.test.ts tests/ui-primitives.test.ts`; the new tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates, then `pnpm ui:shape --base http://127.0.0.1:3120`** and record the baseline counts in the task report (it fails today; that is the point). Intended visual change: none.
- [ ] **Step 5: Commit** `test(ui): measure card count and lead position on the R5 pages`.

### Task 2: Tax-planning inputs

**Files:**
- Create: `lib/tax-planning-params.ts`
- Modify: `app/tax-planning/page.tsx` (inputs and the toolbar), `lib/ui-copy/pages/taxPlanning.ts`, `app/positions/[market]/[ticker]/page.tsx` (`:414` link only)
- Test: `tests/tax-planning-params.test.ts`

**Interfaces:**
- Produces:
  - `planningInputs(params: Record<string, string | undefined>, policy: TaxPolicy): { scenario: FilingScenario; objective: 'minimize-tax'; targetCashKrw: 0; annualTargetCashKrw: number; horizonYears: number; master: MasterPlanStrategyKey; executionMonths: number }` — `scenario` is `policy.activeScenario`; `annualTargetCashKrw` from `annualTarget` only, non-digits stripped, non-finite or negative → 0; `horizonYears` and `master` and `executionMonths` keep today's rules (`page.tsx:43-64,96-98`). The page's local `scenario`, `amountParam`, `masterStrategy` helpers move here.
  - The page stops declaring `scenario`, `objective`, `target` in its `searchParams` type.
  - Toolbar: a GET `<form>` outside any `Card`, laid out with flex-wrap (no grid), fields `master`, `pace`, `horizon` (existing selects and options) and `annualTarget` (text input, `inputMode="numeric"`, placeholder from copy, `defaultValue` the current amount formatted with `fmtNumber` or empty), each label with its `HelpPopover` (the old hint text joins the existing info text), and the rebuild button. Copy `taxPlanning.settings.annualTarget` (en `Annual test amount (KRW)`, ko `연간 테스트 금액 (원)`), `annualTargetInfo` (en `A yearly sale amount to compare execution scenarios against. Leave empty to skip the comparison.`, ko `실행 시나리오를 비교할 연간 매도 금액입니다. 비워 두면 비교하지 않습니다.`), `annualTargetPlaceholder` (en/ko `50,000,000`). Delete `settings.badge` and the hint keys no longer read.
  - Position page tax preview links to `/tax-planning`.
- [ ] **Step 1: Write failing tests** in `tests/tax-planning-params.test.ts` with a minimal policy fixture: empty params → `{ scenario: policy.activeScenario, objective: 'minimize-tax', targetCashKrw: 0, annualTargetCashKrw: 0, executionMonths: 24, master: 'STAGED' }` and the policy horizon; `{ scenario: 'KR_ONLY', objective: 'harvest-loss', target: '5000000' }` → deep-equals the empty-params result; `annualTarget: '50,000,000'` and `'₩50000000'` → 50000000; `annualTarget: 'abc'` → 0; `horizon: '99'` → 10, `'0'` → 1; `pace: '13'` → 24; `master: 'NOPE'` → `'STAGED'`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates and `pnpm ui:mobile`.** Intended visual change: `/tax-planning` settings block becomes a one-line toolbar (wrapping on a phone) with a fourth field, no numbered circles, no badge, no hint lines.
- [ ] **Step 5: Commit** `feat(tax-planning): an annual amount field; stop reading inputs the page cannot set`.

### Task 3: Tax-planning order and sections

**Files:**
- Modify: `app/tax-planning/page.tsx`, `app/tax-planning/components.tsx` (`MasterPlanOverview` card `id="tax-plan-overview"`), `lib/ui-copy/pages/taxPlanning.ts`, `lib/header-status.ts`, `tests/linked-issues.test.ts`
- Test: `tests/page-blocks.test.ts`

**Interfaces:**
- Consumes: `planningInputs` and the toolbar (Task 2); `SHAPE_ROUTES` lead `#tax-plan-overview` (Task 1).
- Produces:
  - Order (Decisions 1, 4): `FormError` → `WashSaleBanner` → `MasterPlanOverview` → warnings `Card id="tax-planning-warnings"` with `issues`, only when its count > 0, followed by `WrapperEstimateNote` → toolbar → `SectionHeading` monthly plan → `MasterScenarioComparison`, `TaxPlanTimeline`, `MasterPlanAnnualTax`, `SavedPlansPanel` → `SectionHeading` lot-level → single-year split card → one sale-lot card (`CandidateTable` of `plan.recommended`, then a closed `<details>` whose summary is `copy.page.allOpenLotCandidates` holding `CandidateTable` of the first 80 candidates) → annual-target card (comparison table plus the `ScenarioTimeline` bodies as `Panel`s inside it when a target is set; the hidden text otherwise) → the closed opportunity-analysis `<details>`.
  - Deleted: the annual filing profile and base assumptions cards and every copy key only they read.
  - Copy `taxPlanning.sections`: `monthlyPlan` (en `Monthly sale plan`, ko `월별 매도 계획`), `monthlyPlanNote` (en `Schedules sales month by month under the strategy and window above.`, ko `위 전략과 실행 기간으로 매도를 월별로 배치합니다.`), `lotEstimate` (en `Lot-level estimate`, ko `세금 단위별 추정`), `lotEstimateNote` (en `Estimates this year's tax lot by lot, and compares scenarios when an annual amount is set.`, ko `올해 세금을 세금 단위별로 추정하고, 연간 금액이 있으면 시나리오를 비교합니다.`).
  - `taxPlanningLinkedIssues(copy, input: { warnings: number; example: boolean }): { status: HeaderStatus | undefined; issues?: { count: number } }` — warnings > 0: attention, `href '#tax-planning-warnings'`, label `copy.page.warningsCount(n)` (en `` `${n} planner warnings` ``, ko `` `계획 경고 ${n}건` ``) or, when `example` too, `copy.page.warningsAndExample(n)` (en `` `${n} planner warnings · example assumptions` ``, ko `` `계획 경고 ${n}건 · 예시 가정` ``); else example → today's unlinked pill; else `undefined`. The card's `issues` count comes from the same helper.
- [ ] **Step 1: Write failing tests:** `linked-issues` rows for the three helper states and the page/card pairing (`tax-planning-warnings`); `page-blocks` asserts `app/tax-planning/page.tsx` contains neither `annualFilingProfile` nor `baseAssumptions`, contains both section keys, and places `MasterPlanOverview` before the toolbar `<form` and before `MasterScenarioComparison`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; lower the guardrail baselines the change drops below.
- [ ] **Step 4: Run the gates and `pnpm ui:shape`** — `/tax-planning` passes in both languages. Intended visual change: hero first; warnings under it; two section headings; two echo cards gone; candidates folded; scenario timelines inside the annual-target card; header pill as Decision 5.
- [ ] **Step 5: Commit** `refactor(tax-planning): lead with the plan, then warnings, then the two engines as sections`.

### Task 4: Rebalance guardrail constants and reason codes

**Files:**
- Modify: `lib/rebalance-policy.ts`, `lib/adapters/portfolio-db.ts` (`getRebalanceReview` and the `RebalanceReview` type at `:652-677`), `lib/ui-copy/pages/rebalance.ts`
- Test: `tests/rebalance-policy.test.ts`, `tests/page-blocks.test.ts`

**Interfaces:**
- Produces:
  - `export const MARKET_GAP_HOLD_PCT = 2` and `export const SHORT_TERM_WATCH_PCT = 50` in `lib/rebalance-policy.ts`; the adapter's `< 2` and `>= 50` read them.
  - `RebalanceReview.watchCandidates[number]` and `taxSensitive[number]` gain `reasonCode: RebalanceReasonCode`, `export type RebalanceReasonCode = 'missing_market_value' | 'short_term_heavy'`; `reason` is unchanged.
  - Copy `rebalance.reasons: Record<RebalanceReasonCode, string>` — en `Missing market value; refresh prices before sizing.` / `High short-term lot exposure; review lots before reducing.`, ko `평가금액이 없습니다. 비중을 정하기 전에 가격을 갱신하세요.` / `단기 보유 세금 단위 비중이 높습니다. 줄이기 전에 세금 단위를 확인하세요.`; `rebalance.guardrails: (holdPct: string, capPct: string, shortPct: string) => string` — en `` `Hold within ±${holdPct} · position cap ${capPct} · short-term watch from ${shortPct}` ``, ko `` `±${holdPct} 안은 유지 · 종목 상한 ${capPct} · 단기 보유 ${shortPct} 이상 주의` ``.
- [ ] **Step 1: Write failing tests:** the two constants equal 2 and 50; `getRebalanceReview`'s source in `portfolio-db.ts` contains `MARKET_GAP_HOLD_PCT` and `SHORT_TERM_WATCH_PCT` and no `< 2 ?` or `>= 50 &&`; both languages define a non-empty string for each `RebalanceReasonCode`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gates.** Intended visual change: none (the page reads the new fields in Task 5).
- [ ] **Step 5: Commit** `refactor(rebalance): guardrail thresholds and row reasons as named values`.

### Task 5: Rebalance — one model, hero first

**Files:**
- Modify: `app/rebalance/page.tsx`, `app/rebalance/actions.ts` (delete `saveRebalanceTargets`), `lib/rebalance-policy.ts` (delete `saveRebalancePolicy`), `tests/rebalance-policy.test.ts` (drop its save tests), `lib/ui-copy/pages/rebalance.ts`
- Test: `tests/page-blocks.test.ts`, `tests/linked-issues.test.ts` (unchanged pairing must still pass)

**Interfaces:**
- Consumes: constants, `reasonCode`, `copy.reasons`, `copy.guardrails` (Task 4); `MetricHeroCard id` (Task 1).
- Produces:
  - Order (Decision 7): hero row (`MetricHeroCard id="rebalance-lead"` + `HeroAside`) → `Card id="rebalance-hold-watch"` (always rendered: its pill pairing is R3's) → `CardRow`: market gaps | allocation → `CardRow`: reduce candidates | tax-sensitive → `CardRow`: outside policy | proposals.
  - Market gaps card: table gains column `existingPositions` (en `Existing positions`, ko `보유 종목 수`) filled for Add rows from `rebalance.addContext` by market, `EMPTY_VALUE` otherwise; under the table a `Note` with `copy.guardrails(fmtPct(MARKET_GAP_HOLD_PCT, {digits:0}), fmtPct(positionCapPct, {digits:0}), fmtPct(SHORT_TERM_WATCH_PCT, {digits:0}))` and a `Note` that reads `copy.marketSource.derived` (en `Split derived from the allocation policy.`, ko `자산 배분 정책에서 나온 비중입니다.`) when `marketSplitSource === 'allocation_policy'`, else `copy.marketSource.fallback` (en `No allocation policy yet: measured against the saved or default split.`, ko `자산 배분 정책이 아직 없어 저장된 비중이나 기본 비중으로 계산합니다.`) followed by a `TextLink` to `/rebalance/settings`.
  - Reason columns render `copy.reasons[r.reasonCode]`.
  - Deleted: the editor card, add-context card, guardrail card, the `target` search param and its `FormError`/`FormSaved`, copy keys `targetEditor`, `addContext`, `noMarketAddGap`, `executionGuardrails`, `marketGapTolerance`, `singlePositionCap`, `shortTermWarning`, `guardrailNote` and any other key nothing reads.
- [ ] **Step 1: Write failing tests** in `page-blocks`: `app/rebalance/page.tsx` contains none of `saveRebalanceTargets`, `targetEditor`, `'2%'`, `'50%+'`, `addContext.map`, or a `key: 'reason'` column without a `render`; contains `MARKET_GAP_HOLD_PCT`, `copy.reasons[`, `id="rebalance-lead"`; `MetricHeroCard` appears before `copy.allocation` / `ac.title`; `app/rebalance/actions.ts` does not export `saveRebalanceTargets`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; lower guardrail baselines that dropped.
- [ ] **Step 4: Run the gates and `pnpm ui:shape`; the controller checks `/rebalance` by hand with the example allocation policy copied in, with it removed, and with an invalid file** (Review Focus 3). Intended visual change: hero row first; hold/watch second; editor, add-context and guardrail cards gone; market gaps gain a column and two notes; reason cells read copy (Korean in ko).
- [ ] **Step 5: Commit** `refactor(rebalance): one policy model, the lead figure first`.

## PR R5-2 — position page, cash inflow, review, guide

Stacked on R5-1's branch; after R5-1 merges, merge main into it (take this branch's side where main equals the R5-1 head) and retarget to main.

### Task 6: Position page

**Files:**
- Create: `lib/position-detail.ts`
- Modify: `app/positions/[market]/[ticker]/page.tsx`, `lib/ui-copy/pages/positionDetail.ts`, `tests/page-blocks.test.ts` (the R4 `OperatorDetails` assertion follows the merged sources card)
- Test: `tests/position-detail.test.ts`

**Interfaces:**
- Consumes: `MetricHeroCard id` (Task 1); `WashSaleBanner`, `getWashSaleReview`, `OperatorDetails`, `TotalsStrip`/`Total`.
- Produces:
  - `washSaleForTicker(review: WashSaleReview, market: string, ticker: string): WashSaleReview` — `windows` filtered to `w.ticker === ticker` when `market === 'US'`, `[]` otherwise; other fields kept.
  - `accountRows(holdings: PositionDetail['holdings'], lots: PositionDetail['lots']): AccountRow[]` — one row per `(brokerage, account)` holding: `quantity`, `native_cost`, `native_market_value`, `native_unrealized_gl`, `currency`, `lot_count`, `long_count`, `short_count`, `lot_cost_krw` (today's `accountLotProfile` rule, `page.tsx:134-149`).
  - Order (Decision 10): hero `CardRow` (`MetricHeroCard id="position-lead"` whose children add, under the `KpiBand`, a `Note` with the price and FX `FreshnessInline` items) → `WashSaleBanner` with `washSaleForTicker(...)` → reconciliation `Card` (two strips; status badge as `action`) → accounts `Card` (one `DataTable` over `accountRows`) → lots `Card` (`TotalsStrip` of long qty, short qty, long/short lot counts; open lots table; `action` = the `/lots` and `/realized` links) → tax preview `Card` → activity `Card` (`TotalsStrip` of transaction types with count and amount; the timeline; `action` = the `/transactions` link) → dividends `Card` → `OperatorDetails` holding one sources `Card` (status, file, usage, rows, modified, sha) plus the evidence-count line.
  - Deleted: freshness card, first-checks card, holding-mix and transaction-mix cards, the second accounts table, the full transactions table, the record-link row, copy keys nothing reads.
- [ ] **Step 1: Write failing tests:** `washSaleForTicker` keeps only `AAA` from windows `[AAA, BBB]` for `('US','AAA')`, returns `[]` for `('KR','AAA')` and for an absent ticker; `accountRows` over two accounts with mixed long/short lots returns two rows with the right counts and `lot_cost_krw`, and a holding with no lots has zeros. `page-blocks`: the position page contains no `copy.firstChecks`, `copy.holdingMix`, `copy.transactionMix`, `copy.accountLotProfile`, `copy.freshness}`; contains `washSaleForTicker` and `id="position-lead"`; `MetricHeroCard` precedes `copy.reconciliation`, which precedes `copy.accountHoldings`, `copy.openTaxLots` and `copy.activityTimeline` in that order; the sources table is inside `OperatorDetails`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; lower guardrail baselines that dropped.
- [ ] **Step 4: Run the gates and `pnpm ui:shape`.** Intended visual change: `/positions/KR/005930` reordered and shortened to the Decision 10 cards; freshness under the hero figures; one sources table in the closed disclosure.
- [ ] **Step 5: Commit** `refactor(positions): hero, reconciliation once, accounts, lots, activity`.

### Task 7: Cash inflow and review

**Files:**
- Modify: `components/FilterBar.tsx`, `app/cash-inflow/page.tsx`, `lib/ui-copy/pages/cashInflow.ts`, `app/review/page.tsx`, `lib/ui-copy/pages/review.ts`
- Test: `tests/filter-bar.test.ts` (create; same `React` import convention as the other component tests), `tests/page-blocks.test.ts`

**Interfaces:**
- Consumes: `MetricHeroCard id` (Task 1).
- Produces:
  - `FilterBar` group type gains `countsAsFilter?: false`; such a group is excluded from `active`.
  - `/cash-inflow`: first group `{ key: 'view', label: copy.viewLabel, options: [{ value: 'month', label: copy.monthly }, { value: 'year', label: copy.yearly }], selected: view, defaultValue: 'month', countsAsFilter: false }` (copy `viewLabel` en `View`, ko `보기`); header `actions` removed; `MetricHeroCard id="cash-inflow-lead"`; in each unclassified group, the `Note` + `<pre>` move inside a nested `<details>` whose `<summary>` is `copy.triage.rule`.
  - `/review`: summary is `<div id="review-summary">` holding `<StatStrip columns="sm-3">` of three `Stat`s (same labels, values, `sub` = old hints, tone for the unrealized figure); concentration rows read `copy.topShare(n)` (en `` `Top ${n}` ``, ko `` `상위 ${n}` ``).
- [ ] **Step 1: Write failing tests:** `FilterBar` with one filter group selected off-default and one `countsAsFilter: false` group off-default reports one active filter in its folded summary; `page-blocks`: `app/cash-inflow/page.tsx` has no `copy.monthly` inside `actions=` and passes `key: 'view'` to `FilterBar`; the `<pre` is preceded by a `<details` opened after the group's `<summary`; `app/review/page.tsx` contains `StatStrip` and `topShare` and no `'Top 1'`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**; lower guardrail baselines that dropped.
- [ ] **Step 4: Run the gates, `pnpm ui:shape` and `pnpm ui:mobile`.** Intended visual change: cash-inflow header loses its two buttons and the filter bar gains a View row; JSON rule closed until asked; review summary drawn by `StatStrip`, Korean shows 상위 N.
- [ ] **Step 5: Commit** `refactor(cash-inflow, review): the view switch joins the filters; review uses the strip`.

### Task 8: Page order in the guide; acceptance run

**Files:**
- Modify: `docs/ui-guide.md`
- Test: none new (this task runs the acceptance gates)

**Interfaces:**
- Produces: `docs/ui-guide.md` gains a "Page order" section after "Layout": Decision 1's order; the card budget and how `pnpm ui:shape` measures it (Decision 2, the `id` on the lead); input controls as a toolbar, not a card; a page fed by two engines labels each group with `SectionHeading`; a policy figure shown on a page comes from the named constant or the policy, never a literal. "Checking a change" lists `pnpm ui:shape --base …` beside `ui:a11y` and `ui:mobile`.
- [ ] **Step 1: Write the section.**
- [ ] **Step 2: Run** `pnpm ui:shape`, `pnpm ui:a11y`, `pnpm ui:mobile` against the sample server: 0 shape failures on the five routes in both languages, 0 axe violations, 0 mobile findings. Record the counts per page in the task report and the PR body.
- [ ] **Step 3: Run the gates.** Intended visual change: none.
- [ ] **Step 4: Commit** `docs(ui-guide): page order and the card budget`.
