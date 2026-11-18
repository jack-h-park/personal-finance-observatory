# Read-only account coverage summary implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation; preserve the approved source-only scope.

**Goal:** Summarize existing investment, bank/CMA and other supplementary source statuses and link to existing review sections without changing their classifications or financial records.

**Architecture:** A pure typed projector counts existing status rows and independent history-gap signals. A server component renders a compact bilingual table and links. Inventory stays navigation-only on `/data-ops`; it is not loaded again and no inventory state/denominator is inferred. Add a supplementary-details link to the existing inventory card.

**Tech Stack:** Existing TypeScript, React server components, copy registry and node:test/tsx. No dependencies.

**Spec:** [Approved follow-up scope](../../product/account-coverage-follow-up-scope.md).

## Global constraints

No new classifier, threshold, DB query, network request, writer, refresh/collection or user acceptance. Summary populations are configured rows, never unique accounts or a completeness denominator. Independent history signals can overlap freshness. Closed/non-loaded pension policies and unknown inventory fields remain unchanged. Actual 2025 comparison blocked; all operating/data/map/access/web-write and publication/Hometax/deployment holds retained.

## Review focus

Unknown query periods must remain unknown despite recent dates. A recent source with a history gap must retain its existing action-needed override and gap; independent pre-gap freshness is unavailable and must not be reconstructed. Empty groups are no configured rows, not complete coverage. Repeated aliases and overlapping signal groups cannot create a unique-account total. No private labels or per-account action strings appear in the new summary.

## Task 1: pure summary and bilingual read-only navigation

- [x] Write `tests/account-coverage-summary.test.ts`: independent invented status counts across current investments/stale bank, missing/unknown interval/due rows, history overlaps, empty groups, repeated labels and frozen input preservation; render both languages with scoped links/no account data or write controls; extend existing pension display regression to preserve policy with new navigation.
- [x] Observe missing-module RED, then implement `summarizeAccountCoverage` in `lib/application/account-coverage-summary.ts` over structural readonly status/optional-historyGap inputs and supplementary kinds. Return three named groups with independent status buckets, row count and history-gap count; no grand total or I/O.
- [x] Implement `components/AccountCoverageSummary.tsx` and bilingual `coverageSummary` copy registry entry. Render summary before existing `/data-ops` sections using already loaded adapter rows; add supplementary navigation to `AccountInventoryReview` and its copy. Keep all old tables and actions.
- [x] Run focused inventory/coverage/render regressions, typecheck/lint/UI guardrails; review TSX quality and independent branch review. Validate full suite/build in artifact-only synthetic repo, never the private operating context.
- [ ] Update source status/scope docs, open PR and verify exact-head CI. Keep checkout for the open PR. No merge or operating rollout is authorized.

## Verification checkpoint

Observed missing-module RED, then 7 passing tests. Independent review found the adapter history-gap override: realistic action-needed fixtures and a bilingual unavailable-pre-gap-freshness notice were added with observed RED/GREEN. Re-review found no remaining blocking issues. Artifact-only validation passed 1,903 tests, skipped 14, failed 0 (1,917 total), plus typecheck/lint/UI guardrails and production build. Synthetic localhost browser checks passed English/Korean at 1280px and 390px with bounded summary layout, three source groups, scoped anchors and no new summary write controls. The browser/server were closed. The source-row label was subsequently made count-neutral; focused checks cover that copy-only change, and exact-head PR CI remains a separate delivery gate. No operating context or real finance data was used.
