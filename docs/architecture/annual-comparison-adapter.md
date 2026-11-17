# Read-only annual federal history comparison adapter

Status: implemented source library and synthetic validation; no private execution, CLI/route activation, writer or deployment.

## Scope and explicit inputs

The [pure selector](../../lib/application/annual-tax-history-selection.ts) and [read-only adapter](../../lib/adapters/annual-tax-comparison.ts) connect the [federal composition library](annual-composition.md) to the existing history model. They support the same 2025 federal Single/MFJ line-24 scope, without extending tax methods or changing the history schema, original evidence, maps or operating configuration.

`readAnnualFederalComparison` requires explicit absolute paths for three existing JSON files: estimate input, history and a review bundle. It also requires named evidence roots and an externally pinned review ID/revision/canonical SHA256. No config/env/default root is imported, and missing history is never synthesized as empty state. JSON file/parent links are refused; callers must supply canonical regular-file paths. The existing evidence resolver retains its named-root/link/hash policy.

The new review bundle is a supplied private artifact format, not a new runtime review store:

```text
schemaVersion: 1
id, revision
selectionReview: explicit current-basis, profile and history-version review
compositionReview: existing composition review contract
comparisonApproval: existing numerical approval envelope, including calculation digest
```

Current means the observed explicit history file, not proof that the caller chose the sole operating authority. A future private caller must bind the correct configured authority/path. No canonical operating review location, human owner appointment or review writer is introduced. The caller pins the whole canonical bundle digest, not just its revision label; same-revision content edits therefore require a new accepted pin. This proves equality with the requested review metadata, not authenticated reviewer identity or operating authorization.

## Current history selection

The selector validates the whole history and estimate input before deriving `RecordedFederalBoundary`. It uses the obligation's explicit effectiveBasis; it does not choose the largest/newest liability or another candidate when a reference fails. The selected candidate must be live, match kind/ID/recordRevision and obligation, and be an accepted return or an explicitly selected assessment. A known live accepted superseding return blocks an obsolete selected return. An unaccepted amendment does not automatically replace the selected accepted basis.

A dated `selectionReview` pins the complete canonical history digest/revision, obligation and tax-unit revisions, basis kind/ID/revision, explicit line-24 boundary, filing status and residency review. Tax unit kind/members must match the estimate, not merely share its ID. Missing/deleted/stale records, unsafe version numbers, unknown profile/boundary or mismatched scope remain blocked. Neither a form boundary nor residence is inferred from a liability amount or institution name.

Liability comparison does **not** require complete settlement coverage or authority-confirmed payment/refund events. Those remain separate history questions. The selected liability/evidence is never replaced by a net outstanding or payment sum.

## Evidence and stable observations

Candidate and effective-basis evidence must both be nonempty and live. The selector combines their IDs deterministically; the selection review's source references must belong to that set. The adapter hash-checks every related document using the existing resolver, then validates the numerical mapping's references against the derived IDs. No directory search, hash-matched relink, original rewrite or guessed source is performed. Estimate base preparation and its separate input-source metadata remain reviewed claims; this adapter does not extract or verify taxable amounts from documents.

JSON reads are bounded (2 MiB each for input/review, 20 MiB for history), strict UTF-8, regular-file/no-follow descriptor reads with initial/final identity and metadata observations. They are read-only: no lock, cache, temporary file, receipt or directory is written by the adapter. The shared evidence resolver retains its default 32 MiB preview limit and path/hash policy, but now opens nonblocking, rejects non-regular descriptors before reading and bounds read chunks (at most one extra detection byte). Its additive optional maxBytes can only tighten the default limit. The adapter passes the remaining aggregate budget, with a maximum 32 related documents and 64 MiB accepted evidence per verification pass. Returned receipts contain identifiers/revisions/hashes, not document bytes or private paths.

Before returning, the adapter verifies evidence again, checks used-root identity and rereads all three JSON files, comparing raw hashes and file identity/metadata with the initial observations. Observed instability blocks, marks provisional evidence receipts blocked and discards the entire nested numerical comparison, so a stale difference cannot survive behind an outer blocked flag. This is a bounded, rechecked read window, not an atomic cross-file transaction or protection against an adversarial ABA replacement after observation. Results must be re-observed when used later rather than cached as permanently current.

## Output and verification boundary

A successful adapter result says `selected-history-evidence-and-review-pins-checked` and includes the observed history/review identities, evidence receipts and unchanged pure-library comparison. The nested calculation retains `supplied-metadata-only`: bytes/hash/version agreement does not establish legal tax treatment, actual authority acceptance, reviewer authentication, source completeness or settlement. A blocked result keeps difference null and eligibility false; no missing state becomes zero. Pure comparison blockers, including stale calculation approval or mapping, are retained.

Synthetic tests cover accepted/assessed selection, explicit authority and membership, stale revisions/content, supersession, deleted/empty evidence, hash/path/link failures, strict review pinning, missing/malformed/oversized/non-UTF-8 sources, no write calls and mid-read changes. Filesystem fixtures and numerical inputs are invented and disposable. No current private tax record or original was opened to validate this PR.

The next boundary is a separately reviewed read-only caller and owner-reviewed private preview, with current pins and permitted paths. No CLI, web route, background refresh, input adoption, import, filing/payment, generator/publisher, access change or write activation follows from this library. Automatic briefing publication remains paused; actual generation, web publication, Hometax and deployment remain held. Unresolved owner/curator/account decisions remain unchanged.
