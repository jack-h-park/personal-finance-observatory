# US 2025 composition/comparison contract implementation plan

Status: implemented and locally validated, source-only review; extends the previously approved annual MVP composition boundary.

**Goal:** Validate the reviewed bridges and comparison mapping needed for a future 2025 federal line-24 estimate without emitting an annual amount or a difference.

**Architecture:** Add an isolated domain contract module that validates plain JSON review metadata and recomputes existing components for readiness. Bind composition reviews to input/rule hashes and comparison mapping to the complete composition/history metadata digests. Keep the existing component CLI, history helper, routes, state and rule packs unchanged.

**Tech Stack:** Existing TypeScript, node:test, tsx and canonical annual JSON hashing; no new dependency.

**Spec:** [Approved annual MVP sections 6–8](../specs/2026-11-12-annual-tax-estimation-mvp-design.md).

## Global constraints

- US federal 2025, supported single/MFJ component methods only; no CA or KR composition, Hometax, new tax rules or private input access.
- Reviewed bridges are line 17, line 21 and other line 23 excluding computed NIIT. Unknown is not zero; explicit not-applicable requires reviewed zero. Bridge values are nonnegative USD whole-dollar form amounts encoded in minor-unit strings.
- Required regular-tax and NIIT components must be computed from supported complete bases. Assumptions and unsupported line-16 methods cannot be fixed downstream.
- Reviews and evidence references are supplied metadata, not evidence verification or authority attestation.
- Readiness is not an annual calculation or comparison acceptance: annualTotal/difference remain null and comparisonEligible stays false.
- No production changes, original/map edits, writer changes, generation, publication or schedule resume.

## Review focus

- Sparse/unknown/extra fields, invalid money/date/source references and non-JSON objects fail validation.
- Missing NIIT, double-counting, unsupported regular methods, assumptions and incomplete coverage block readiness without erasing independent components.
- Every input/rule/review/history version or liability/evidence change invalidates stale mapping hashes.
- Matching broad tax identity alone never permits a different form boundary, filing/residency profile, stale/unevidenced basis or component-only history.
- No caller-supplied component amount is trusted, no output promotes component scope and no I/O is introduced.

## Task 1: executable review contracts and synthetic failure cases

Files: create `lib/domain/taxes/annual/us-composition-contract.ts`, `tests/annual-composition-contract.test.ts`, and `docs/architecture/annual-composition-contract.md`; link the contract from the existing foundation document.

- [x] Write synthetic valid/invalid composition and comparison readiness cases, using only the public example and bundled component rules.
- [x] Run the new tests and record their expected missing-module RED result.
- [x] Implement strict typed review validation, recomputed component readiness and digest-bound comparison readiness; no amount composition or difference calculation.
- [x] Run focused annual/history regression tests, typecheck and lint. Add missing adversarial cases discovered in review and prove RED/GREEN.
- [x] Run the synthetic full suite; document source-only delivery and remaining arithmetic/application gates.

Local evidence: 41 contract cases and 100 focused annual/history tests passed; full synthetic suite 1,670 passed / 14 skipped / zero failed; typecheck and lint passed. Independent read-only review found no important issues. PR/CI delivery is recorded separately; no merge or operating adoption is implied.

## Validation and delivery

Use `pnpm exec tsx --test tests/annual-composition-contract.test.ts` for the new contract. Focused regression includes annual-* and tax-history-query tests. Run `pnpm typecheck`, `pnpm lint` and the full synthetic `pnpm test`, retaining logs outside the public repository. GitHub CI provides its separate sample build. This PR does not authorize merge, deployment or private scenario adoption.
