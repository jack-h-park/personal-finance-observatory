# Supplementary freshness display implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline and a fresh whole-branch review. Steps use checkbox syntax.

**Goal:** Show explicit source freshness separately from recorded historical gaps while preserving all existing combined decisions and notifications.

**Architecture:** Keep the existing summary projector and status/action columns unchanged. Add a pure supplementary freshness summary consuming the #350 reader, a second labelled summary table and separate detail columns. Reuse the rows already loaded by data-ops; no extra query, clock, inference or persistence.

**Tech Stack:** TypeScript, React server components, node:test and static rendering.

**Spec:** [Additive source contract](../../architecture/supplementary-coverage-freshness.md), plus the user's November 18 authorization for its read-only UI consumer.

## Scope and choices

The existing combined summary is retained rather than reinterpreted. A compact second table covers banks/CMA and other supplementary sources only; investment rows have no new freshness assertion. Detail rows retain their status/action, adding explicit freshness and the recorded gap interval. Missing or invalid metadata says unavailable, distinct from explicit unconfirmed. No recorded gap means only that, never complete history. Historical-only rows have no freshness assertion.

This is the direct consumer of the approved contract. Replacing combined status would change decisions; inferring freshness from dates would violate the compatibility contract, so neither is used.

## Global constraints

- No adapter/classifier/threshold/reminder/writer changes.
- Actual 2025 tax comparison remains blocked; unknown decisions remain unknown.
- No financial, original-evidence, mapping, access or web-write-setting changes.
- Automatic briefing stays paused; actual generation, briefing publication, Hometax and additional deployment remain held.
- English repository prose; bilingual user copy. Synthetic fixtures only.

## Review focus

- Current freshness plus a gap must still show combined action-needed and the existing action.
- Due-soon, stale, missing and unconfirmed remain distinct; unavailable metadata is not unconfirmed.
- Invalid/old metadata is unavailable even with recent dates or partial flags.
- No-gap and historical-only rows do not become complete/current assertions.
- Empty groups and both languages preserve read-only links and existing warnings.

## Task 1: Pure summary and read-only surfaces

Files: create `lib/application/coverage-freshness-summary.ts` and `tests/coverage-freshness-display.test.ts`; modify `components/AccountCoverageSummary.tsx`, `components/SupplementaryCoverageTable.tsx`, `app/data-ops/page.tsx` and `lib/ui-copy/pages/coverageSummary.ts`.

Interface: `summarizeSupplementaryFreshness(rows)` returns bank/CMA and other group counts with five explicit freshness buckets, unavailable count and independent recorded gap count. Existing `summarizeAccountCoverage` is unchanged. `AccountCoverageSummary` accepts optional `freshness` output for its second table.

- [x] Add literal synthetic cases and watch missing consumer tests fail.
- [x] Implement pure reader-based projection, bilingual second table and detail columns; retain status/action logic.
- [x] Verify frozen input, old/invalid metadata, empty groups, all source states and both-language render behavior; rerun legacy summary/reminder/adapter tests.

## Task 2: Verification and delivery

- [x] Update architecture and source/deployed status documentation, without claiming rollout.
- [x] Run full tests, typecheck, lint, guardrails and sample build in a synthetic artifact checkout.
- [x] Inspect local synthetic desktop/narrow layout and obtain fresh whole-branch review; resolve findings.
- [ ] Commit, push and open a new PR; confirm exact-head CI and retain the checkout while open. No merge or deployment of the new PR.

## Verification receipt

The five focused suites passed 51 tests. The isolated artifact checkout passed the full repository suite (2,001 passed, 14 skipped, zero failures), typecheck, lint, UI guardrails and sample production build. A fresh reviewer found no blockers and independently repeated the 51 tests.

Local sample `/data-ops` rendered the connected consumer. Static synthetic component previews covered current-plus-gap, all five source states and unavailable metadata in English/Korean at 1440px and 390px. Narrow tables scroll within their containers without page-width overflow. These are local browser/layout checks, not physical-device/assistive-technology validation or operating acceptance. The initial local server selected an incompatible Node runtime; restarting that disposable server with the same explicit Node 22 used for validation resolved the local startup issue without source changes.

All operating holds remain intact. This plan and PR do not authorize deployment or private-data adoption. Keep the task checkout while its PR is open or follow-up remains.
