# US 2025 annual liability composition and signed difference

Status: implemented pure source library with synthetic validation; a separate [read-only history adapter](annual-comparison-adapter.md) now checks selected history/evidence/review pins. No CLI/route activation, private scenario adoption or deployment.

## Scope and ordering

The [review contract](annual-composition-contract.md) remains unchanged. The additive [calculation module](../../lib/domain/taxes/annual/us-composition.ts) applies it to the supported 2025 US federal Single/MFJ `US:federal:1040-line24` boundary. It recomputes components rather than accepting a caller-supplied result. Existing component/readiness outputs still have null annual totals/differences and false comparison eligibility.

[2025 Form 1040](https://www.irs.gov/pub/irs-pdf/f1040.pdf), lines 16–24, defines the staged calculation; [2025 Schedule 2](https://www.irs.gov/pub/irs-pdf/f1040s2.pdf) places NIIT in the other-tax subtotal. Public forms were rechecked on November 17, 2026 and identify tax year 2025. This version does not follow a future form silently or add new tax rates/methods.

| Step | Input or operation | Provenance |
| --- | --- | --- |
| Line 16 | Exactly one supported ordinary or eligible v2 QDCG component | Existing bundled calculator/pack |
| Line 17 | Reviewed fixed-stage additions, including externally resolved applicable schedules | Reviewed input or explicit reviewed not-applicable zero |
| Line 18 | Line 16 + line 17 | Exact addition |
| Line 21 | Reviewed fixed-stage nonrefundable credit total | Reviewed input or explicit reviewed not-applicable zero |
| Line 22 | Maximum of zero and line 18 minus line 21 | Floor at this stage |
| NIIT / other line 23 | Computed NIIT plus reviewed other taxes explicitly excluding that NIIT | Computed and reviewed inputs remain distinct |
| Line 24 | Line 22 + line 23 | Exact addition; native USD liability |

The floor precedes NIIT/other-tax addition; excess line-21 credits cannot erase those later taxes. This is not an automatic credit/AMT/FTC limitation engine: permitted bridge amounts must already reflect the reviewed schedules and limitations. Unsupported effects on line 16 remain blocked, even if downstream bridge values are supplied.

## Pure result and exact money

`composeUsFederalAnnualEstimate(input, review)` first snapshots JSON and applies all existing readiness gates. Missing components/bases, assumed required bases, unsupported methods, unknown bridges, NIIT inclusion or stale review identities return a blocked result with null annualTotal and an empty composition trace. Independent component outputs remain visible, never represented as a partial liability or lower bound.

A composed result has native Money `{currency: USD, minor: string}`, `calculationScope: annual-total`, `coverage: composed` and a per-stage trace of amounts, operands, operation, origin and declared sources. Component traces retain their original rounding provenance. BigInt handles all new arithmetic; already rounded form components/bridge values are not rounded again. The calculation digest includes the named calculation version, contract/input/rule identities, status, amounts, components, trace and blockers. It is deterministic for the same complete JSON metadata.

Both composed and blocked outputs say `verification: supplied-metadata-only`. Valid supplied review metadata, including a synthetic scenario, is not live evidence verification, taxpayer applicability, a complete return outside this boundary, or filing readiness. The composer always leaves comparisonEligible false until the separate comparison function applies its additional gates.

## Explicit numerical comparison approval

`compareUsFederalAnnualEstimate(input, review, recordedBoundary, approval)` re-runs composition and the existing history scope/mapping checks. Approval is a strict new envelope:

```text
schemaVersion: 1
calculationSha256: digest of the reviewed calculated result
mappingReview: existing dated, sourced contract-to-history mapping
```

A review-only mapping cannot implicitly approve new numeric output. The supplied mapping must still bind the composition contract and full selected history metadata. The envelope additionally binds actual output/trace and calculation version. A stale calculation digest blocks a difference even if the older contract mapping is otherwise ready. No caller-supplied estimate result is accepted; future persisted consumers must verify rather than trust arbitrary result objects.

Only when both gate sets pass does the library return a signed minor-unit string for **estimate liability minus recorded liability**, plus comparison/mapping/history identities. It preserves recorded cents exactly and does not round a historical fact again. A negative result is not a refund, a positive result is not an amount due, and neither is a settlement/filing status. A blocked comparison keeps an independently known estimate available but difference null and comparisonEligible false.

The recorded selection, current/evidenced flags, review and approval are caller-supplied metadata. The library does not select an effective basis from a live store, authenticate a reviewer or read evidence. `comparisonEligible: true` means eligible under those supplied metadata, not operational evidence acceptance. No UI/CLI/store adapter in this PR consumes this flag or performs a private comparison. Any later adapter must establish the actual current basis, source/evidence checks and reviewed mapping before private display or adoption.

## Synthetic proof and remaining boundaries

[Tests](../../tests/annual-composition.test.ts) anchor ordinary Single/MFJ and eligible QDCG amounts independently of this composer, then check fixed bridge arithmetic, credit-floor equality/excess, NIIT added once, explicit zero, large exact amounts, recorded cents, signed/zero differences, stale calculation/history/review identities, malformed approval, blocked methods/unknowns and input preservation. Existing annual and history contracts retain regression coverage. No private return is a fixture or input.

The separate [read-only adapter](annual-comparison-adapter.md) now verifies current selected history, related evidence and explicit review pins in source/synthetic tests. A separately authorized caller/private preview remains the next boundary, not broader unsupported tax methods. No private input, original evidence, account mapping, state writer, route, CLI or environment is changed here. KR reported-tax/Hometax, CA, actual generation, web publication and deployment remain held/outside this library; automatic briefing publication remains paused and web financial editing stays disabled.
