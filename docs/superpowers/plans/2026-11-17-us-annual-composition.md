# US 2025 annual composition and difference implementation plan

Status: implemented and locally validated, source-only review; follows the merged review contract.

**Goal:** Calculate the permitted 2025 federal line-24 liability and signed estimate-minus-recorded-liability difference under the reviewed contracts, using synthetic inputs only.

**Architecture:** An additive pure domain module recomputes component/contract readiness, evaluates stage-ordered BigInt arithmetic and binds a calculation digest to the version, reviewed identities and output trace. Numerical comparison requires the existing reviewed mapping plus an explicit accepted calculation digest. Legacy contracts keep null totals/differences and existing CLI/routes remain unchanged.

**Tech Stack:** Existing TypeScript, BigInt, canonical JSON hashing, node:test and tsx; no new dependencies.

**Spec:** [Merged review contract](../../architecture/annual-composition-contract.md) and [approved MVP §§6–8](../specs/2026-11-12-annual-tax-estimation-mvp-design.md).

## Global constraints

- Only the supported 2025 US federal Single/MFJ line-24 boundary; no new rate/method, CA/KR support or Hometax.
- `max(0, line16 + reviewedLine17 - reviewedLine21) + computedNiit + reviewedOtherLine23ExcludingNiit`; floor credits before adding line-23 taxes. Never floor the final line-24 sum instead.
- Use native USD minor-unit strings and BigInt. Existing components supply whole-dollar outputs; bridges must already satisfy the reviewed contract. Do not round inputs or recorded liability again.
- Unknown/unsupported/stale/unreviewed inputs yield blocked/null totals; never treat independent partial outputs as a liability or lower bound.
- Comparison re-runs composition and scope/mapping checks; no caller-supplied result is trusted. Difference direction is estimate minus recorded liability, with no settlement/refund/due interpretation.
- Add a separate strict approval envelope pinning the calculation digest, so old review-only mapping cannot implicitly approve new numerical output. Supplied metadata is not live evidence/store verification.
- All operational holds remain; no private writer, original/map/access edit, actual generation, publication or deployment.

## Review focus

- Credit-floor position, line-17 placement and NIIT/other-line-23 accounting must match independently derived cases.
- Large exact inputs and signed/zero differences must avoid Number coercion, repeated rounding or unsafe serialization.
- Missing/unsupported components, unknown bridges, assumptions and stale reviews retain blockers and no annual amount.
- History profile/boundary/current/evidence changes or calculation/mapping version changes invalidate comparison approval.
- Freeze caller inputs through JSON snapshots before validation and never accept a forged result; preserve existing component/contract/history interfaces.

## Task 1: pure arithmetic and comparison with synthetic proof

Files: create `lib/domain/taxes/annual/us-composition.ts`, `tests/annual-composition.test.ts`, `docs/architecture/annual-composition.md`; update linked contract/foundation/product status documents.

- [x] Add independent synthetic arithmetic anchors and failure/identity regression tests; observe missing-module RED.
- [x] Implement composition, trace, calculation identity and comparison approval/enforcement.
- [x] Run new and focused annual/history tests, typecheck and lint; obtain an independent read-only review.
- [x] Run full artifact-isolated synthetic tests; record evidence separately from source/merge/operating adoption.

Local evidence: 39 new cases, 139 focused annual/history tests, full synthetic suite 1,709 passed / 14 skipped / zero failed, typecheck and lint passed. Independent read-only review ran 80 composition/contract cases and found no important findings. GitHub sample-build/PR status is a separate delivery gate; this source plan does not assert its outcome.

No numerical result is a filing-readiness or settlement claim. A later independently authorized adapter must establish the selected current history/evidence basis before any private use or UI integration.
