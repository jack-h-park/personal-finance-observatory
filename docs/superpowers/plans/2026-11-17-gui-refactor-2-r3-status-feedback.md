# GUI Refactor 2, R3: Status and Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every status one colour rule, keep the brand accent bar for the one figure a page leads with, and give saving, failing, confirming and refreshing one shape each.

**Architecture:** Two stacked pull requests off main. R3-1 (Tasks 1–4) moves the five status scales and the page-local tone helpers into `lib/tone.ts`, replaces conditional `accent` with an issue badge in the card header, and routes every enum badge through a copy label. R3-2 (Tasks 5–8) adds `FormNotice`, a two-step `ConfirmSubmitButton`, splits the `PageHeader` right slot into a linked status pill and actions, and turns auto-refresh off on form pages. Each rule that can be checked by text gets a guardrail with baseline zero, so it cannot drift back the way the first refactor's rules did.

**Tech Stack:** Next.js 15 app router, React 19 server components, Tailwind 3 with the tokenized theme, `node:test` through `tsx --test`, `renderToStaticMarkup` for component tests, the R0 guardrail script (`scripts/ui-guardrails.mjs`), the screenshot net (`scripts/snap-ui.mjs`).

**Spec:** The second GUI refactoring plan (Claude Docs, 2026-10-30, https://claude.ai/artifact/DWkduh8vd3v8xEA1kUauwJ): "R3 — 상태·피드백 체계 (2 PR)", with the diagnosis it argues from in "시인성 · 접근성 진단" → "상태 신호", "헤더 오른쪽 슬롯의 과부하" and "레이블과 배지", and the guardrail table (G5, G8). Also the R2 items parked for R3: the G5 symmetric regex, the 14 status ternaries (use a named tone map, never a flipped ternary), and G7 retirement.

## Survey (main at 7fa214d)

- Guardrails: G5 inline-sign-tone 15 hits in 11 files; G8 accent-per-page 35 hits in 14 page files, of which 27 are conditional (`accent={count > 0}`) and 8 are bare. G7 is 0 and `valueClassName` no longer exists.
- Page-local tone rules outside `lib/tone.ts`: `statusTone` in `app/health/page.tsx`, `app/reconciliation/page.tsx`, `app/data-map/page.tsx`; `retentionTone` (data-map); `coverageTone` (data-ops); `typeTone` (transactions); `eventTone` (position detail); `PRIORITY_TONE` and `TRADE_TONE` (daily-briefing); `STATUS_TONE` (`components/Freshness.tsx`); `TREATMENT_TONE` (`components/WrapperReviewCard.tsx`).
- Bug: `bucketTone` tests `bucket === 'long'`, but `/lots` passes `tax_term` values `'Long-term'`/`'Short-term'`, so every lot badge is warning.
- Enum values rendered raw in badges: `holdingBucket` (`app/tax-planning/components.tsx:32`, `components/TaxPlanTimeline.tsx:370`), tax-year profile `status` (`app/tax-planning/page.tsx:325`), filing scenarios (`app/tax-planning/page.tsx:295,332,476`, `components.tsx:396`, `opportunity-analysis.tsx:368,456`), `mapping_status` (`app/data-ops/page.tsx:252`), source issue `status` (`data-ops:358`), rebalance `action` (`app/rebalance/page.tsx:269`), the `US_AND_KR` profile badge (`TaxPlanTimeline.tsx:238`).
- Feedback today: saved = header `Badge success` (tax-settings, rebalance/settings, tax-planning plan detail, rebalance target editor); errors = header `Badge danger` (tax-planning), an `accent` card with `text-warning` list (rebalance/settings, rebalance), a bare `<p role="alert">` (taxes/records).
- `autoRefresh={false}` is set on 3 pages; four pages with POST forms still poll: tax-settings, rebalance/settings, tax-planning, tax-planning/plans/[id].
- Policy-changing submits with no confirmation, all in `app/rebalance/proposals/[id]/page.tsx`: approve targets (`copy.targets.approve`), approve plan (`copy.plan.approve`), close with no trades (`copy.plan.closeNoTrades`), close (`copy.statusCard.close`), reject (`copy.statusCard.reject`).
- `PageHeader` `action` carries a status badge on 12 pages (only cash-inflow's is a link), saved/error badges on 4, and back links on the rest. `AutoRefresh` prints the interval (`'30초 간격'`).

## Decisions this plan makes (review these)

1. **One severity scale, five steps, one tone each:** `quiet → neutral`, `info → info`, `ok → success`, `attention → warning`, `problem → danger`. Every existing mapping keeps its current colour (so R3-1 changes no status colour except the `/lots` fix): briefing `fyi` stays `quiet`, priority `low` stays `info`, freshness `drift` stays `attention`.
2. **Category colours are not severities.** Transaction type, position event, trade side, wrapper treatment, data-map retention, cost-basis status stay named tone maps, moved into `lib/tone.ts` beside the severity tables.
3. **The accent bar means "read this first", never "something is wrong".** At most one bare `accent` per page; any expression passed to `accent` is a guardrail hit. A card that lists problems shows a count badge in its header instead (`Card issues`).
4. **Market codes stay raw** (`KR`, `US`, `CRYPTO` are product terms, not enums). Every other enum shown in a badge goes through copy.
5. **Confirmation is inline and two-step**, not `window.confirm`: the first click arms the button, which then reads the confirm label and submits on the second click; it disarms after 6 seconds or on blur. It works in both languages and without a dialog.
6. **The header status pill links to the card that lists the issues** (`href="#<card id>"`) when it reports a problem, and is plain when it reports "all clear". Saved notices use the same slot.
7. **The overview market bar gradient stays for R6**, which owns gradients; the R2 note that parked it for R3 is superseded.

## Global Constraints

- Repo text (code, comments, commit messages, PR titles and bodies) is English only; Korean appears only as copy values in `lib/ui-copy/`. No real figures or identifiers from the maintainer's data anywhere, tests included.
- No new npm dependencies.
- Copy rules from R1 bind: every visible string comes from `lib/ui-copy/` (G1–G3, G12 at their baselines); one empty value `EMPTY_VALUE = '—'`; `fmtDate(value, language)` takes the language.
- Primitive rules from R2 bind: no primitive takes `className` for colour, size, padding or margin; lookups are static literal tables; primitives in `components/` are hook-free unless the file is `'use client'`; footnotes are `Note`.
- Tone rule: a status picks its colour only through `lib/tone.ts` (a severity table or a named tone map). Never a ternary between tone names (G5, extended in Task 2).
- Pixel rule: every task lists its intended visual changes. The controller captures the screenshot net before and after each task, back to back (the sample DB's crypto snapshot ages 8h after seeding), and an unlisted changed file is a defect.
- Guardrail baseline only goes down; a check this plan adds starts at zero after its own task.
- Gates after every task: `pnpm typecheck && pnpm lint && pnpm test && pnpm ui:guardrails && pnpm build` on Node 22. Two local-only failures are known and pass in CI: the Toss Bank balance test in `tests/bank-statements.test.ts` and the `parseLlmJson` 200 ms timing test under load.
- Commit after each task with a conventional subject and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A status value no table knows** (a new run status, a typo in a JSON file): it must render in the `quiet` tone with its copy fallback, never throw and never borrow the `ok` colour. Task 1 tests the fallback for each severity table.
- **The confirm button inside a form that also has a plain submit** (proposal detail has save + approve in one form): arming approve must not submit save, and pressing Enter in an input must not confirm. Task 6 tests that the armed button is the only `type="submit"` that changed and that the unarmed button is `type="button"`.
- **A header status pill whose anchor target is not rendered** (the issues card is hidden when its list is empty, or filtered out): the pill links only when it reports a problem, and the card it names is always rendered in that state. Task 7 asserts each page's problem state renders the anchor id.
- **Korean at 375 px**: the split header must not break inside a word (the diagnosis saw '리밸런싱 설/정', '30초 간/격'). Task 7 checks the mobile screenshots for the six pages with both status and actions.
- **A saved notice that survives a reload**: `?saved=1` stays in the URL, so the notice reappears on refresh. That is the current behaviour and stays; auto-refresh is off on these pages after Task 8, so the notice does not flicker either.

---

## PR R3-1 — one scale, accent once, labelled badges

### Task 1: Severity scale and tone maps in `lib/tone.ts`

**Files:**
- Modify: `lib/tone.ts`
- Modify: `app/health/page.tsx`, `app/data-ops/page.tsx`, `app/reconciliation/page.tsx`, `app/data-map/page.tsx`, `app/transactions/page.tsx`, `app/positions/[market]/[ticker]/page.tsx`, `app/daily-briefing/page.tsx`, `app/lots/page.tsx`, `components/Freshness.tsx`, `components/WrapperReviewCard.tsx`
- Test: `tests/tone.test.ts` (create)

**Interfaces:**
- Produces:
  - `export const SEVERITIES = ['quiet', 'info', 'ok', 'attention', 'problem'] as const; export type Severity`
  - `export function severityTone(severity: Severity): Tone`
  - Five tables, each `Record<string, Severity>` with a lookup that falls back to `'quiet'`: `PRIORITY_SEVERITY` (high→problem, medium→attention, low→info), `BRIEFING_SEVERITY` (act-now→problem, this-week→attention, fyi→quiet), `FRESHNESS_SEVERITY` (fresh→ok, stale→attention, drift→attention, missing→problem), `RUN_SEVERITY` (success→ok, degraded→attention, running→info, failed→problem), `COVERAGE_SEVERITY` (current→ok, due_soon→attention, unconfirmed→attention, action_needed→problem, missing→problem)
  - `export function statusTone(table: Record<string, Severity>, value: string | null | undefined): Tone`
  - Named category maps, `Record<string, Tone>`, values copied from the page-local functions they replace: `TRANSACTION_TYPE_TONE`, `POSITION_EVENT_TONE`, `TRADE_SIDE_TONE`, `WRAPPER_TREATMENT_TONE`, `INVENTORY_STATUS_TONE` and `RETENTION_TONE` (data-map), `RECONCILIATION_STATUS_TONE`, plus `categoryTone(map, value, fallback: Tone = 'neutral'): Tone`
  - `priorityTone` keeps its signature and now reads `PRIORITY_SEVERITY` (unknown → `info`, its current fallback, kept by passing the fallback explicitly)
  - `bucketTone` accepts `'long' | 'Long-term'` as long-term

Rules the page-local functions encode that a plain map does not (keep them, as entries or a documented pre-step): reconciliation `status.includes('only') → warning`; data-map `derived` and `archive` → neutral; health's fallback is `danger` for any unknown run status (`RUN_SEVERITY` falls back to `quiet` per the decision; that is an intended change for unknown values only, and no known value changes).

- [ ] **Step 1: Write the failing tests** in `tests/tone.test.ts`: `severityTone` maps all five steps to the five tones in order; each of the five tables maps every documented value as listed above; `statusTone(RUN_SEVERITY, 'nonsense')` and `statusTone(COVERAGE_SEVERITY, null)` are `'neutral'`; `priorityTone('low')`, `priorityTone(undefined)` stay `'info'`; `bucketTone('Long-term')` and `bucketTone('long')` are `'success'`, `bucketTone('Short-term')` is `'warning'`; each category map returns the value the replaced function returned for each of its branches (one assertion per branch, e.g. `categoryTone(TRANSACTION_TYPE_TONE, 'DIVIDEND') === 'success'`, `'SELL' → 'warning'`, anything else `'info'` via the map's fallback argument).
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/tone.test.ts` and confirm it fails on the missing exports.
- [ ] **Step 3: Implement** the exports in `lib/tone.ts`; replace the trailing comment that defers freshness, run status and coverage to "P2".
- [ ] **Step 4: Replace every page-local rule** listed under Files with the shared table or map and delete the local function or constant. `components/Freshness.tsx` uses `statusTone(FRESHNESS_SEVERITY, status)`.
- [ ] **Step 5: Run** the tone test and the gates. Intended visual change: `/lots` long-term badges turn success (green); nothing else.
- [ ] **Step 6: Commit** `refactor(ui): one severity scale and the page tone rules in lib/tone`.

### Task 2: No tone ternaries (G5 symmetric, baseline 0)

**Files:**
- Modify: `scripts/ui-guardrails.mjs` (G5 patterns and its doc comment), `tests/ui-guardrails.test.ts`, `scripts/ui-guardrails.baseline.json`
- Modify: the 15 G5 sites (`app/cost-basis/page.tsx:125`, `app/data-map/page.tsx:94`, `app/data-ops/page.tsx:80,358`, `app/health/page.tsx:77,109`, `app/positions/[market]/[ticker]/page.tsx:90,411`, `app/rebalance/page.tsx:269`, `app/rebalance/proposals/[id]/page.tsx:482,898`, `app/rebalance/settings/page.tsx:150`, `app/reconciliation/page.tsx:85`, `app/tax-planning/page.tsx:325`, `components/metric.tsx:232`), plus any site the extended pattern newly finds (for example `components/TaxPlanTimeline.tsx:371`'s chained role ternary and `app/tax-planning/plans/[id]/page.tsx:153`)

**Interfaces:**
- Consumes: Task 1's tables and `categoryTone`.
- Produces: G5 matches any ternary whose two branches are both tone names (`neutral|info|success|warning|danger`) or both `text-<tone>` classes, in either order, including chained ternaries. `components/metric.tsx`'s `Signed` keeps its one sign rule through `signClass` instead of a literal ternary.

- [ ] **Step 1: Add failing cases** to `tests/ui-guardrails.test.ts` for `findInlineSignTone`: `x ? 'warning' : 'success'`, `x ? 'info' : 'neutral'`, `a ? 'danger' : b ? 'info' : 'neutral'` (two hits), `x ? 'text-warning' : 'text-ink-3'` (no hit: one branch is not a tone), `cond ? copy.a : copy.b` (no hit).
- [ ] **Step 2: Run** the guardrail test; confirm the new cases fail.
- [ ] **Step 3: Extend the G5 patterns** and rewrite the doc comment to say what it now catches and why (a flipped ternary is the R2 status-vocabulary trap).
- [ ] **Step 4: Replace each site** with a severity table, `signTone`/`deltaTone`, or a named map added to `lib/tone.ts` (for example `REBALANCE_ACTION_TONE: { Hold: 'success' }` with fallback `warning`; `MAPPING_STATUS_TONE`; `SOURCE_ISSUE_SEVERITY` keyed by `severity`). Booleans become a two-key map keyed by a named state, never `flag ? 'success' : 'warning'`.
- [ ] **Step 5: Update the baseline** (`node scripts/ui-guardrails.mjs --update-baseline`), confirm G5 is gone from it and no other count rose, run the gates. Intended visual change: none.
- [ ] **Step 6: Commit** `refactor(ui): statuses pick their tone from lib/tone, never a ternary`.

### Task 3: Accent once per page; problems as a header count

**Files:**
- Modify: `components/card.tsx` (`Card`), `lib/ui-copy/common.ts` (en and ko)
- Modify: `scripts/ui-guardrails.mjs` (G8), `tests/ui-guardrails.test.ts`, `scripts/ui-guardrails.baseline.json`
- Modify: the 14 page files in the G8 baseline
- Test: `tests/ui-primitives.test.ts`

**Interfaces:**
- Produces:
  - `Card` prop `issues?: { count: number; severity?: 'attention' | 'problem' }`. When `count > 0` it renders `<Badge tone={severityTone(severity ?? 'attention')}>{common.issueCount(count)}</Badge>` in the header, before `action`; when 0 it renders nothing. A card with `issues` and no `title` is a type error (make the header the only place it renders).
  - Copy `common.issueCount: (count: number) => string` — en `` `${count} to review` ``, ko `` `확인 ${count}건` ``.
  - G8 reports (a) every `accent={…}` with an expression, and (b) every bare `accent` after the first in one `page.tsx`. Its title becomes `accent bar used as a status, or more than once on a page`.

Which bare accent survives on each page: the first card in reading order that carries the page's lead figure; on a page with no such card, none. Error cards that used `accent` (rebalance/settings errors, rebalance proposal error) lose it here and become `FormNotice` in Task 5; until then they keep no accent and their `text-warning` list.

- [ ] **Step 1: Write failing tests**: in `tests/ui-primitives.test.ts`, `Card` with `issues={{ count: 3 }}` renders a warning badge with the en copy `3 to review`, with `severity: 'problem'` a danger badge, with `count: 0` no badge; in `tests/ui-guardrails.test.ts`, `findAccentProp` (or its replacement) reports `<Card accent={n > 0}>` once, reports a second bare `accent` in one file, and does not report a single bare `accent`.
- [ ] **Step 2: Run** both tests and confirm they fail.
- [ ] **Step 3: Implement** the `Card` prop, the copy, and the new G8 rule.
- [ ] **Step 4: Convert the 27 conditional accents** to `issues={{ count, severity }}` with the count the condition already computes (`accent={ops.actionQueue.length > 0}` → `issues={{ count: ops.actionQueue.length }}`), `severity: 'problem'` where the condition is about failures (failed refresh, failed checks, missing sources, quantity breaks), `attention` otherwise. Remove all but one bare accent per page.
- [ ] **Step 5: Update the baseline** (G8 must leave the file empty), run the gates. Intended visual change: the gradient bar disappears from problem cards and from the extra cards on 14 pages; problem cards gain a count badge in their header.
- [ ] **Step 6: Commit** `refactor(ui): the accent bar marks the lead figure; problem cards show a count`.

### Task 4: Every enum badge reads a copy label; G7 retired

**Files:**
- Modify: the badge sites listed in the Survey, the page copy modules they use (`lib/ui-copy/pages/taxPlanning.ts` or the module each page already reads, `dataOps.ts`, `rebalance.ts`), `components/TaxPlanTimeline.tsx`
- Modify: `scripts/ui-guardrails.mjs` (add G13, remove G7), `tests/ui-guardrails.test.ts`, `scripts/ui-guardrails.baseline.json`
- Modify: `components/metric.tsx` (`SectionHeading` subtitle line becomes `Note`, the R2 parked item)

**Interfaces:**
- Produces:
  - Copy maps (en and ko, `satisfies Record<…, string>` over the source type where one exists): `holdingBucket`, `taxYearProfileStatus` (`confirmed`, `provisional`, …), `filingScenario` (every `FilingScenario` member from `lib/tax-planning.ts`), `taxProfile` (`US_AND_KR`, …), `mappingStatus`, `sourceIssueStatus`, `rebalanceAction`. Unknown values render the raw value (the R1 lookup idiom `labels[value] ?? value`), so new data never blanks a cell.
  - G13 `raw-enum-badge`: a `<Badge …>{expr}</Badge>` whose only child is a member expression not rooted in a copy object and not ending in `.market`. Heuristic, baseline zero after this task; document what it cannot see (a badge child built in a variable).
  - G7 removed from the check list, the report, the baseline and its tests; a one-line comment where it was says R2 deleted `valueClassName`, so the check had nothing left to find.

- [ ] **Step 1: Write failing tests** in `tests/ui-guardrails.test.ts` for G13: `<Badge tone="info">{y.filingScenario}</Badge>` hits; `<Badge>{copy.filing[y.filingScenario]}</Badge>`, `<Badge>{r.market}</Badge>`, `<Badge>{fmtNumber(n)}</Badge>` do not. Add a copy test that every `FilingScenario` member has a non-empty en and ko label and that the ko labels contain Hangul.
- [ ] **Step 2: Run** them and confirm they fail.
- [ ] **Step 3: Add the copy maps** and switch each site to `labels[value] ?? value`.
- [ ] **Step 4: Add G13, remove G7**, route the `SectionHeading` subtitle `<p>` through `Note` (same classes, so pixel-neutral), update the baseline, run the gates. Intended visual change: enum badges show words instead of codes.
- [ ] **Step 5: Commit** `refactor(ui): enum badges read copy labels; retire G7`.

Open PR R3-1 against main after Task 4.

---

## PR R3-2 — one feedback shape, confirmations, header slot

Branch off R3-1's head; retarget to main when R3-1 merges (merge the parent in; do not rebase).

### Task 5: `FormNotice`

**Files:**
- Create: `components/FormNotice.tsx`
- Modify: `components/ui.tsx` barrel (re-export), `app/tax-settings/page.tsx`, `app/rebalance/settings/page.tsx`, `app/rebalance/page.tsx` (proposal error and the target editor's saved/invalid badges at :296–297), `app/tax-planning/page.tsx`, `app/tax-planning/plans/[id]/page.tsx`, `app/taxes/records/[id]/page.tsx`
- Test: `tests/ui-primitives.test.ts`

**Interfaces:**
- Produces:
  - `FormSaved({ children }: { children: ReactNode })` — a success `Badge`, for the header status slot (Task 7 moves it there; until then it sits where the saved badge sits today).
  - `FormError({ title, messages }: { title?: ReactNode; messages: ReactNode[] })` — `Callout tone="danger" emphasis="strong" role="alert" spacing="mb-4"`, title in medium weight, messages as a list when more than one, keyed by index.
- Every saved badge becomes `FormSaved`; every error (the tax-planning `nameRequired` header badge, the rebalance/settings error card, the rebalance proposal error card, the taxes/records alert paragraph) becomes `FormError` above the page's first card. The rebalance/settings `errorsNote` stays as a `Note` after the list.

- [ ] **Step 1: Write failing tests**: `FormError` with two messages renders `role="alert"`, the danger Callout classes and two `<li>`; with one message renders no list; `FormSaved` renders the success Badge classes.
- [ ] **Step 2: Run** them and confirm they fail.
- [ ] **Step 3: Implement** both components (hook-free, no `'use client'`).
- [ ] **Step 4: Convert the sites**, run the gates. Intended visual change: errors are red callouts with `role="alert"` instead of warning-toned text in a card or a header badge.
- [ ] **Step 5: Commit** `feat(ui): one shape for saved and error feedback`.

### Task 6: Two-step confirmation for policy actions

**Files:**
- Create: `components/ConfirmSubmitButton.tsx` (`'use client'`)
- Modify: `app/rebalance/proposals/[id]/page.tsx` (the five submits in the Survey), `lib/ui-copy/common.ts` (`form.confirm`)
- Test: `tests/confirm-submit.test.ts` (create)

**Interfaces:**
- Produces:
  - `export function confirmStep(state: 'idle' | 'armed', event: 'press' | 'timeout' | 'blur'): { state: 'idle' | 'armed'; submit: boolean }` — idle+press → armed, no submit; armed+press → idle, submit; armed+timeout/blur → idle, no submit; idle+timeout/blur → idle.
  - `ConfirmSubmitButton({ children, confirmLabel, variant, size }: { children: ReactNode; confirmLabel?: ReactNode; variant?: 'solid' | 'outline' | 'ghost'; size?: 'sm' | 'md' })`. Idle renders `type="button"`; armed renders `type="submit"` showing `confirmLabel ?? common.form.confirm` with `aria-live="polite"` on the label; it disarms after 6000 ms or on blur; while the form is pending it behaves like `SubmitButton` (`useFormStatus`).
  - Copy `form.confirm` — en `'Press again to confirm'`, ko `'한 번 더 누르면 확정'`.

- [ ] **Step 1: Write failing tests**: every row of the `confirmStep` table above; `renderToStaticMarkup(<ConfirmSubmitButton>Approve</ConfirmSubmitButton>)` contains `type="button"` and not `type="submit"`.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement**, with the timer cleared on unmount.
- [ ] **Step 4: Swap the five buttons**, keeping their `variant`. Check by hand in the dev server (proposal detail is not on the net) that save still submits in one click while approve needs two, in en and ko; say so in the report.
- [ ] **Step 5: Run the gates and commit** `feat(ui): policy actions on a proposal ask for a second press`.

### Task 7: `PageHeader` status pill and actions

**Files:**
- Modify: `components/PageHeader.tsx`, `components/AutoRefresh.tsx`, `lib/ui-copy/common.ts` (drop `autoRefresh.interval`)
- Modify: the 19 `PageHeader` callers that pass `action`
- Test: `tests/ui-primitives.test.ts`

**Interfaces:**
- Consumes: `FormSaved` (Task 5), `severityTone` (Task 1).
- Produces:
  - `PageHeader` props `status?: { severity: Severity; label: ReactNode; href?: string }` and `actions?: ReactNode`; `action` is removed (every caller migrates in this task).
  - `status` renders `Badge` with `severityTone(severity)`, wrapped in `Link` with a visible focus ring when `href` is set; `actions` renders after it; the clock comes last. The slot is `flex flex-wrap items-center gap-x-3 gap-y-1` and each child is `whitespace-nowrap` so a label never breaks inside a word.
  - The `AutoRefresh` label shows only `lastRefresh` and the time; `interval` copy and its rendering are deleted (the `title` attribute keeps `auto(seconds)` so the interval is still discoverable).
- Migration rule: a status badge becomes `status` with `severity` from the badge's tone (`success → ok`, `warning → attention`, `danger → problem`, `neutral → quiet`); when it reports a problem, `href` is `#<id>` of the card whose `issues` count it summarises (add an `id` to that card's section; `Card` gains an `id?: string` prop forwarded to `<section>`). Back links and buttons go in `actions`. Saved notices are `status={{ severity: 'ok', label: copy.saved }}` when `?saved=1`.

- [ ] **Step 1: Write failing tests**: `PageHeader` with `status={{ severity: 'attention', label: 'x', href: '#a' }}` renders an `<a href="#a">` around a warning badge; without `href`, no `<a>`; `actions` render after the status; the rendered header contains no `30` interval text.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement** the props, `Card id`, and the AutoRefresh label change.
- [ ] **Step 4: Migrate the 19 callers.** For each page whose status reports a problem, assert in a test (one table-driven test over the pages' copy-free anchor ids is enough) that the anchor id exists on the card rendered in that state.
- [ ] **Step 5: Run the gates; review the 375 px Korean screenshots** of rebalance, rebalance/settings, tax-settings, tax-planning, income and cash-inflow for breaks inside a word. Intended visual change: header badges that report problems become links; the clock loses its interval.
- [ ] **Step 6: Commit** `refactor(ui): the page header separates a linked status from actions`.

### Task 8: No auto-refresh on form pages (G14)

**Files:**
- Modify: `app/tax-settings/page.tsx`, `app/rebalance/settings/page.tsx`, `app/tax-planning/page.tsx`, `app/tax-planning/plans/[id]/page.tsx`
- Modify: `scripts/ui-guardrails.mjs` (add G14), `tests/ui-guardrails.test.ts`, `scripts/ui-guardrails.baseline.json`

**Interfaces:**
- Produces: G14 `form-page-polls`: an `app/**/page.tsx` (or a file it renders from the same route folder, such as `app/tax-planning/components.tsx`, `app/taxes/view.tsx`) that renders `SubmitButton` or `ConfirmSubmitButton` and whose route's `PageHeader` lacks `autoRefresh={false}`. Scan the route folder as a unit: a hit when any file in it renders a submit button and no file in it passes `autoRefresh={false}`. GET filter forms (`method="get"`, as on `/realized`) do not use `SubmitButton` and are not hits.

- [ ] **Step 1: Write failing tests** for G14 over fixture folders: a folder with `SubmitButton` and no `autoRefresh={false}` hits once; the same with `autoRefresh={false}` in `page.tsx` does not; a folder whose only form is `method="get"` with a plain button does not.
- [ ] **Step 2: Run** and confirm they fail.
- [ ] **Step 3: Implement G14** (it needs folder grouping, unlike the per-file checks; add a `group: 'route'` option to the check runner rather than special-casing it in the loop).
- [ ] **Step 4: Add `autoRefresh={false}`** to the four pages, update the baseline (G14 empty), run the gates. Intended visual change: the clock disappears from the four form pages.
- [ ] **Step 5: Commit** `fix(ui): form pages do not reload themselves while you type`.

Open PR R3-2 after Task 8. Then update `docs/ui-guide.md` (severity scale, accent rule, `FormNotice`, `ConfirmSubmitButton`, header slots, G13/G14, G7 gone) in the same PR as a final docs commit.
