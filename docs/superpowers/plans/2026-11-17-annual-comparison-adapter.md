# Annual federal comparison read-only adapter implementation plan

Status: implemented and locally validated; source-only review with no private execution.

**Goal:** Derive the current selected federal liability from existing history and verify relevant evidence plus explicitly pinned review versions before calling the pure comparison library.

**Architecture:** A pure application selector validates history/input and an explicit boundary/profile selection review. A read-only adapter reads three explicit existing JSON files (input, history, versioned review bundle), requires externally supplied review ID/revision/canonical digest, hash-checks related evidence through the existing resolver and rechecks the read window before returning a difference. No default paths, config import, writers, relinking, latest-by-date inference or private execution.

**Tech Stack:** Existing TypeScript, Node fs/crypto, history schema/validators, annual contracts/calculator and evidence resolver. No dependency or persisted history schema change.

**Spec:** [Composition library](../../architecture/annual-composition.md) and [annual MVP §§6–8](../specs/2026-11-12-annual-tax-estimation-mvp-design.md).

## Global constraints

- US federal 2025 Single/MFJ only; source code and synthetic temporary files only.
- Current basis comes from the live obligation's explicit effectiveBasis, matching live candidate kind/ID/recordRevision; accepted return or selected assessment required. Never infer newest return or select another record on failure.
- Verify tax unit membership, obligation/basis/unit revisions and complete canonical history digest against a dated selection review. Do not require payment/settlement completeness for liability comparison.
- Explicit reporting boundary, filing/residency review and input/calculation/history mapping/approval remain required. No boundary inferred from a liability amount.
- Require nonempty live candidate and effective-basis evidence, verify file bytes using existing root/link/hash policy; review sources must be related. No search, relink, import or missing-state fallback.
- JSON files are bounded regular non-symlink files with stable descriptor/path observations. Recheck all files, used evidence roots and evidence bytes before returning; discard numerical comparison on an unstable observation. This is a bounded read window, not an atomic transaction against adversarial ABA changes.
- No cache, temporary file, lock, receipt or directory write by the adapter. No route/CLI/web activation or private-run acceptance.
- Keep unresolved facts and all financial/original/map/access/web-write protections; automatic publication stays paused, generation/publication/Hometax/deployment held.

## Review focus

- Stale history/review/evidence revisions or same-revision content changes cannot silently reuse approval.
- Missing/deleted/changed/out-of-root/symlink evidence, missing state/review files and mid-read source updates return blocked/null difference, including nested numerical output.
- Selected assessment/accepted return follows explicit history authority; known accepted superseding returns block obsolete selected returns without automatic replacement.
- Owner/profile/boundary mismatch blocks before reading unrelated evidence; settlement unknowns do not become liability blockers.
- Supplied review metadata is not authenticated human attestation or proof of taxpayer applicability; adapter receipts identify exactly which history/evidence/version checks occurred.

The shared `lib/application/evidence-index.ts` resolver also receives a bounded nonblocking read fix after independent review exposed a FIFO hang. Its existing path/hash policy, default preview limit and return shape remain unchanged; optional maxBytes only tightens that limit.

## Task 1: selector, read-only adapter and synthetic integration

- [x] Write synthetic current/stale/basis/evidence/permission/concurrency tests and observe missing-module RED.
- [x] Implement pure selection and explicit read-only files/evidence/version verification; reuse unchanged calculator contracts.
- [x] Run focused annual/history/evidence tests, typecheck/lint and independent read-only review; fix important findings with regression tests.
- [x] Run full artifact-only synthetic suite and document boundaries. PR/CI delivery is recorded separately; preserve checkout while open/follow-up remains.

Local evidence: 48 new adapter cases; 207 focused annual/history/evidence tests passed; full suite 1,759 passed / 14 skipped / zero failed; typecheck and lint passed. Independent review found an inherited FIFO/unbounded-read issue; explicit timeout/budget RED cases reproduced it, and nonblocking/bounded resolver changes plus file-growth tests passed. No private history/original was opened.
