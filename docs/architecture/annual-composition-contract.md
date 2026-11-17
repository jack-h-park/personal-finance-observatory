# US 2025 federal composition and comparison review contract

Status: source-only review contract and synthetic validation. No annual composer, numerical comparison, CLI/route integration, private input adoption or deployment.

## Delivered boundary

The [approved MVP sections 6–8](../superpowers/specs/2026-11-12-annual-tax-estimation-mvp-design.md) distinguish independent components, composed annual liability and recorded settlements. The new [isolated contract module](../../lib/domain/taxes/annual/us-composition-contract.ts) implements typed metadata, strict runtime validation and pure readiness assessment for one future boundary: `US:federal:1040-line24`, 2025 Single/MFJ.

The [official 2025 Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf), lines 16–24, places line-17 additions before the line-21 credit reduction/floor, then adds line-23 taxes. [2025 Schedule 2](https://www.irs.gov/pub/irs-pdf/f1040s2.pdf), line 12, includes NIIT in the total carried to Form 1040 line 23. These public forms were checked on November 17, 2026 and display tax year 2025; the future implementation must retain a versioned rule/source boundary rather than silently follow a later document at the same URL.

The named contract is:

```text
line24 = max(0, line16 + reviewedLine17 - reviewedLine21)
         + computedNiit + reviewedOtherLine23ExcludingNiit
```

This expression defines the future arithmetic; this increment does not execute it or test its numeric floor/aggregation behavior. It does execute its prerequisite and exclusion checks. Withholding, estimated payments, refundable payment-side credits, requested/received refunds and payment penalties are outside this liability boundary and cannot be additional contract fields. A component-only result is not relabeled annual-total.

## Supplied review metadata

`UsFederalCompositionReview` binds to the exact validated scenario input digest and bundled rule-pack digest. It carries a reviewed boundary-coverage assertion, NIIT placement and three fixed-stage bridges: line 17, line 21 and other line 23 excluding NIIT. Review metadata identifies date, reason and declared source references; reasons/sources must explain externally resolved schedules, limitations and applicability. The contract cannot verify that the reviewer actually examined them.

- Known bridge amounts are nonnegative canonical USD minor-unit strings divisible by 100, reflecting the existing whole-dollar form mode. `reviewed-input` visibly differs from app computation. Explicit `not-applicable` needs dated source metadata and exactly zero; unknown/unsupported amounts must be null.
- NIIT is recomputed independently and must be expressly excluded from the reviewed other-line-23 bridge. An included or unknown placement blocks readiness; no gross line-23 replacement or balancing adjustment is accepted.
- The existing calculators recompute one supported regular component and NIIT from supplied bases. Missing components/bases, unsupported methods or required-base assumptions block readiness. A downstream bridge cannot rescue an unsupported line-16 method.
- Input source IDs must resolve and review dates/reference lists must be valid. Sparse/non-JSON metadata, missing/extra fields and ambiguous money are rejected. Inputs are cloned rather than mutated.

Supplied hashes, references, current/evidenced flags and dates are **metadata claims**, not file verification, authentication or human attestation. Synthetic examples may satisfy this contract without representing a real return. `contract-ready` therefore means only that these supplied prerequisites are internally consistent; `annualTotal` is always null and `comparisonEligible` always false.

## Comparison mapping

`RecordedFederalBoundary` is a caller-supplied history selection, not a store reader or history-schema change. It contains the obligation/effective basis identity, store revision/digest, basis revision, liability and evidence identifiers together with the tax boundary/profile. Missing form-line mapping stays null; it is never inferred from a liability amount.

`assessUsFederalComparison` recomputes composition readiness and requires equal tax unit, year, authority, currency, income-tax type, line-24 boundary, annual-total history scope, filing status and reviewed residency. It also requires a declared current basis with known liability/evidence and a reviewed mapping. The mapping references those history evidence identifiers and pins both the complete history-selection digest and composition-contract digest. The latter includes the contract definition, complete input digest, current rule-pack digest and all composition review metadata. Changed bases, liability, evidence, input/review or rule versions invalidate old mapping anchors. Changing the mapping itself produces a new mapping digest; consumers must retain that identity if acceptance is later persisted.

This is a contract for a future verified caller: it does not inspect the live store, resolve conflicting effective bases or open evidence. Reusing the older `canCompareTaxEstimate` helper alone would miss these additional gates; that helper and its existing callers are deliberately unchanged. No estimate-versus-history difference is returned, even when contract-ready. Neither an estimate comparison nor a payment-side overage would prove actual settlement.

## Validation and next increment

[The synthetic tests](../../tests/annual-composition-contract.test.ts) exercise valid review metadata, malformed/unknown values, explicit zero, stale review/mapping identities, NIIT inclusion, missing/unsupported components, assumptions, eligible v2 QDCG versus blocked v1, mismatched history boundary/profile and input preservation. They use public invented scenarios only. Existing annual components, rule packs, preview CLI and history projections retain their contracts.

A later separately scoped increment can implement actual line-by-line composition, credit-floor/NIIT reconciliation traces and numerical comparison behind these gates, including independently anchored arithmetic cases. It must establish a verified history selection and mapping before enabling any numerical comparison. No web surface, real scenario, state writer, scheduler or deployment follows from this PR. KR reported-tax/Hometax, CA and unsupported methods remain blocked or outside this federal contract. Actual financial records, originals, maps, access rules and disabled web editing are untouched; automatic briefing publication remains paused and actual generation/publication remains held.
