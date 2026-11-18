# Supplementary coverage freshness contract implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and fresh whole-branch review.

**Goal:** Retain an already computed supplementary source freshness state independently of historical-gap action overrides, without changing existing decisions or reminders.

**Architecture:** Add optional `freshnessStatus: AccountCoverageStatus` to `SupplementaryCoverageRow`; every newly projected row captures the existing local status in the common push helper before the history loop. Existing `status`, `action`, `historyGap`, `staleWithHistoryGap`, thresholds and filters are unchanged. A pure `readCoverageFreshness(value: unknown): AccountCoverageStatus | null` compatibility reader returns only a valid explicit own field; older/invalid metadata remains null and is never inferred from dates, combined status or Boolean hints. No UI or briefing transport change.

**Tech Stack:** Existing TypeScript, SQLite synthetic fixtures and node:test/tsx. No dependencies.

**Spec:** Approved [next-increment scope](../../product/next-increment.md#priority-1-close-remaining-all-assets-coverage-gaps) and the preserved [summary boundary](../../architecture/account-coverage-summary.md).

## Constraints and review focus

Retain all legacy row fields, combined action/status, masking, reminder text/order, source windows, populations and unknown owner/lifecycle decisions. Missing/invalid freshness metadata is unavailable, never zero/current or a fallback from legacy status. Read-only projection only, no persisted schema/file or data change. Actual2025 comparison remains blocked; no operating generation/publication/Hometax/deployment or scheduler change.

## Task 1: additive contract with backward compatibility

- [x] Write synthetic real-adapter tests for recent/stale/due-soon/unknown-query historical gaps, no-gap and missing sources, inactive pension filtering, byte-preserved fixture inputs and unchanged complete legacy fields/actions. Observe absent-field RED before adapter implementation.
- [x] Write pure-reader tests for all explicit states, missing/invalid/inherited metadata and frozen input preservation. Observe missing-module RED, then implement the reader and capture field without changing classifiers/history loop.
- [x] Verify synthetic reminder byte-for-byte equality with additive/conflicting freshness metadata and unchanged summary rendering/projection of combined status. Existing briefing writer's explicit transport projection remains unchanged; no actual generator invoked.
- [x] Run focused inventory/coverage/reminder regressions, typecheck/lint/guardrails, independent review and artifact-only full synthetic suite/build. No operating replay.
- [ ] Update English contract/status documents and open a source PR; verify exact-head CI and retain checkout. New PR merge and any rollout require separate authorization.

## Verification checkpoint

Missing-module reader RED and absent-field real-adapter RED were observed before implementation. The affected four files passed 43 tests; the wider coverage/inventory/reminder selection passed 107. Artifact-only full validation passed 1,910 tests, skipped 14 and failed 0 (1,924 total), plus typecheck, lint, UI guardrails and production build. Independent review found no blockers. No UI consumer changed, so no new browser or operating acceptance is claimed. PR/CI delivery is recorded separately; new merge/rollout remains unauthorized.
