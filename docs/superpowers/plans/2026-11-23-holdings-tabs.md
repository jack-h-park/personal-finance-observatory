# /holdings Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared `Tabs` read as a page-level switch, then split `/holdings` into three URL tabs.

**Architecture:** `components/Tabs.tsx` gains bigger labels, a stronger selected state, an optional per-item description and in-bar horizontal scroll. `/holdings` reads `?view=`; the holdings table stays in `app/holdings/page.tsx`, and the two trend cards move into their own async server components, so only the active tab's data is loaded.

**Tech Stack:** Next.js app router (server components), Tailwind, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-holdings-tabs-design.md`

## Global Constraints

- Repository text is English; Korean appears only as UI copy in `lib/ui-copy/pages/*.ts`.
- Tab label at the panel size: `--t-panel` (16px) / `--lh-panel`, through a Tailwind token, never a raw `text-[16px]`.
- Tab item height at least 44px; selected indicator 3px in `info`; unselected `text-ink-2`.
- No horizontal page scroll at 375px.
- Existing `Tabs` callers (`/spending`, `/data-connections`, `/rebalance/proposals/[id]`) keep compiling with no change.
- No change to what any chart, panel or table on `/holdings` computes or shows.
- `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm ui:guardrails` pass before push.

## Review Focus

- Unknown `?view=` value (`?view=foo`, `?view=` repeated): lands on the holdings tab, no error.
- Switching tabs keeps the other params: `?market=US&sort=…&view=mix` → holdings tab link keeps `market` and `sort`; mix link keeps `trend`.
- The holdings tab's link drops `view` entirely (no `?view=` in the URL), so the canonical URL is unchanged.
- The weight chart's range selection (`from`/`to`) still links within the weights tab (its `baseHref`/`clearHref` keep `view=weights`).
- At 375px the three Korean labels fit or scroll inside the bar; the page itself does not scroll sideways.

---

### Task 1: Shared `Tabs` — size, contrast, description, scroll

**Files:**
- Modify: `tailwind.config.ts` (fontSize: add `'role-panel': ['var(--t-panel)', { lineHeight: 'var(--lh-panel)' }]`)
- Modify: `components/Tabs.tsx`
- Test: `tests/ui-primitives.test.ts` (the `Tabs nav and items` test, `TAB_BASE` constant)

**Interfaces:**
- Produces: `Tabs<K>({ label, items, current, scroll? })` where `items: { key: K; href: string; label: ReactNode; description?: ReactNode }[]`.

- [ ] **Step 1: Update the test to the new markup**

Set `TAB_BASE = '-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-[3px] px-4 text-role-panel font-semibold'`. Assert:
- the nav class is `flex gap-1 overflow-x-auto border-b border-line-subtle` (no `flex-wrap`, no `mb-5`);
- selected item class `${TAB_BASE} border-info text-ink`, `aria-current="page"`;
- unselected item class `${TAB_BASE} border-transparent text-ink-2 hover:text-ink`;
- with no descriptions, the output is a wrapper `<div class="mb-6">` holding only the nav;
- new test `Tabs shows the selected item's description`: items `s` (description `'About S'`) and `t` (description `'About T'`), current `t` → output contains `<p class="mt-2 text-role-ui text-ink-2">About T</p>` and not `About S`.

- [ ] **Step 2: Run** `pnpm exec tsx --test tests/ui-primitives.test.ts` — expect the Tabs tests to FAIL.

- [ ] **Step 3: Implement** — add the token; in `Tabs`, wrap in `<div className="mb-6">`, render the nav with the classes above, then the selected item's `description` (if any) as the `<p>`. Keep links, `aria-label`, `aria-current`, `scroll`.

- [ ] **Step 4: Run** the same test — PASS. Run `pnpm exec tsc --noEmit` — clean (existing callers unchanged).

- [ ] **Step 5: Commit** `Make shared tabs read as the page-level switch`

### Task 2: Descriptions on `/spending` tabs

**Files:**
- Modify: `lib/ui-copy/pages/spending.ts` (add `viewDescriptions`, en and ko, same keys as `views`)
- Modify: `app/spending/page.tsx:130-131` (pass `description: copy.viewDescriptions[item]`)
- Test: `tests/spending-page.test.ts`

Copy (exact):

| key | en | ko |
|---|---|---|
| summary | Net spending for the period, by month and category. | 기간 순지출을 월별·카테고리별로 봅니다. |
| transactions | Each spending transaction, filterable by month and category. | 지출 거래를 하나씩, 월·카테고리로 걸러 봅니다. |
| review | Holds and uncategorized rows that need a decision. | 확인이 필요한 보류·미분류 거래입니다. |

- [ ] **Step 1: Write the failing test** `every spending view has a description in both languages`: for `en` and `ko`, `Object.keys(copy.viewDescriptions)` deep-equals `Object.keys(copy.views)` and every value is non-empty.
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/spending-page.test.ts` — FAIL.
- [ ] **Step 3: Add the copy and pass it through.**
- [ ] **Step 4: Run** — PASS; `pnpm ui:guardrails` — clean.
- [ ] **Step 5: Commit** `Say what each spending tab holds`

### Task 3: `/holdings` view resolution and tab links

**Files:**
- Create: `lib/holdings-tabs.ts`
- Modify: `lib/ui-copy/pages/holdings.ts` (add `views` and `viewDescriptions`, en and ko)
- Test: `tests/holdings-tabs.test.ts`

**Interfaces:**
- Produces:
  - `HOLDINGS_VIEWS = ['holdings', 'mix', 'weights'] as const`; `type HoldingsView = (typeof HOLDINGS_VIEWS)[number]`
  - `resolveHoldingsView(value: string | string[] | undefined): HoldingsView` — first value if array; unknown or missing → `'holdings'`
  - `holdingsViewHref(params: Record<string, string | string[] | undefined>, view: HoldingsView): string` — built with `withParam('/holdings', params, 'view', view === 'holdings' ? null : view)` from `lib/table-filter`

Copy (exact):

| key | en label | ko label | en description | ko description |
|---|---|---|---|---|
| holdings | Holdings | 보유 현황 | What you hold now, with gains. The filters below apply to this tab. | 지금 보유한 종목과 손익입니다. 아래 필터는 이 탭에만 적용됩니다. |
| mix | Market mix | 시장 구성 | How the split between Korea, US and crypto has moved. | 한국·미국·암호화폐 비중이 어떻게 바뀌었는지 봅니다. |
| weights | Weights | 종목 비중 | Which securities' weights moved over a period, and why. | 어떤 종목의 비중이 기간 동안 왜 움직였는지 봅니다. |

- [ ] **Step 1: Write failing tests:**
  - `resolveHoldingsView(undefined) === 'holdings'`, `('mix') === 'mix'`, `(['weights','mix']) === 'weights'`, `('foo') === 'holdings'`, `('') === 'holdings'`
  - `holdingsViewHref({ market: 'US', sort: 'weight:desc', view: 'mix' }, 'holdings')` has no `view` and keeps `market=US` and `sort`
  - `holdingsViewHref({ trend: '1y' }, 'mix') === '/holdings?trend=1y&view=mix'` (match `withParam`'s actual ordering if it differs; the assertion is that both params are present)
  - copy: for both languages, `views` and `viewDescriptions` keys deep-equal `HOLDINGS_VIEWS`
- [ ] **Step 2: Run** `pnpm exec tsx --test tests/holdings-tabs.test.ts` — FAIL.
- [ ] **Step 3: Implement** `lib/holdings-tabs.ts` and the copy.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Add /holdings view resolution and tab copy`

### Task 4: Split `/holdings` into tabs

**Files:**
- Create: `app/holdings/MarketMixView.tsx` — the market mix card (today `page.tsx` mix computation + first `<Card>`)
- Create: `app/holdings/WeightsView.tsx` — the weights card and the weight-change card, with their computation (weights, pins, `changes`, `changeColumns`, `clearRangeHref`, `keepParams`)
- Modify: `app/holdings/page.tsx` — header, `<Tabs>`, then one view
- Test: `tests/holdings-tabs.test.ts` (source assertions), existing `tests/holdings-columns.test.ts` and `tests/table-priority.test.ts` keep reading `app/holdings/page.tsx` (the holdings columns stay there)

**Interfaces:**
- Consumes: Task 1 `Tabs` with `description`; Task 3 `HOLDINGS_VIEWS`, `resolveHoldingsView`, `holdingsViewHref`.
- Produces: `MarketMixView({ params, rows, language }): Promise<JSX.Element>` and `WeightsView({ params, rows, language }): Promise<JSX.Element>`, async server components; `params` is the page's resolved `searchParams`, `rows` is `getHoldings(1000, true)`'s result, `language` from `getLanguage()`. Each loads its own copy, currency preferences and snapshots.

- [ ] **Step 1: Write failing source tests** in `tests/holdings-tabs.test.ts`:
  - `app/holdings/page.tsx` contains `<Tabs` and `resolveHoldingsView(params.view)` and does not contain `marketMixSeries(` or `positionShares(`;
  - `MarketMixView.tsx` contains `marketMixSeries(`; `WeightsView.tsx` contains `positionShares(` and `weightChanges(`;
  - `WeightsView.tsx` still builds `clearRangeHref` by dropping only `from` and `to` (contains `key !== 'from' && key !== 'to'`), so the range links keep `view=weights`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Move the code.** In `page.tsx`, compute `view = resolveHoldingsView(params.view)`; render `PageHeader`, then `<Tabs label={copy.title} current={view} items={HOLDINGS_VIEWS.map(v => ({ key: v, href: holdingsViewHref(params, v), label: copy.views[v], description: copy.viewDescriptions[v] }))} />`, then `view === 'mix' ? <MarketMixView …/> : view === 'weights' ? <WeightsView …/> : <holdings card>`. The holdings card's computation (filters, columns, totals, composition, trend sparkline rows) runs only on the holdings tab: move it below the view branch or into a local function so `getPositionTrendRows()` and `getOperationalHealth()` are not called on the other tabs. Move code verbatim; the only edits are imports and passing `params`/`rows`/`language` in. Drop the outer `className="mb-5"` spacing only where a card is now the last on its tab.
- [ ] **Step 4: Run** `pnpm test` — all PASS (including `holdings-columns` and `table-priority`); `pnpm exec tsc --noEmit`; `pnpm lint` (see memory note on worktree lint workarounds if it fails for env reasons).
- [ ] **Step 5: Commit** `Split /holdings into holdings, market mix and weights tabs`

### Task 5: Visual check and baselines

**Files:**
- Modify: screenshot baselines under `tests/__screenshots__/` only if the repo's PR convention expects them (follow the most recent GUI PR).

- [ ] **Step 1:** Start a dev server on a non-production port against the sample DB; open `/holdings`, `/holdings?view=mix`, `/holdings?view=weights`, `/holdings?view=foo`, `/spending` in ko and en, at desktop and 375px. Check: tab bar above filters reads clearly; description line shows; no page-level horizontal scroll at 375px; the weight chart's range drag stays on the weights tab; holdings tab filters survive a round trip through another tab.
- [ ] **Step 2:** Capture `snap-ui` before/after in this worktree, back to back on one seed; confirm only `/holdings`, `/spending`, `/data-connections` and the rebalance proposal page changed.
- [ ] **Step 3:** `pnpm ui:guardrails` — clean.
- [ ] **Step 4: Commit** any baseline updates.
