# Curated finance authority and briefing archive path contract

Status: **design with first recorded-observation foundation in source review; not operationally activated**. November 15, 2026 (America/Los_Angeles). PR #322 records the preceding read-only audit. This proposal addresses its FX/evidence editing and briefing producer/consumer path gaps. It neither appoints an unconfirmed human curator nor applies a private configuration change.

## Intent and boundaries

A financial input needs a known editing authority, and a briefing producer and reader need to refer to the same archive. File ownership, a successful job status, a fresh snapshot, or an existing directory cannot establish those contracts by themselves.

Keep actual records, original evidence, account mappings, current paths, access restrictions and disabled web writes unchanged. Account-holder, co-owner, lifecycle and inventory-scope questions stay unresolved. Hometax, implementation, operating setting changes, source acquisition, publish, backup/restore execution and deployment are outside this PR. Approval or merge of this design does not authorize any of them.

This is a small contract design for existing producers and consumers, not a new inventory store, general permission system, archive migration or shared configuration service. Human assignments and any execution approval remain explicit later decisions.

## Observed facts versus proposed decisions

The [November 15 audit](../../operations/finance-state-backup-and-restore.md#read-only-follow-up-november-15-2026) established that curated FX inputs are runtime-owned and included in the operating-host backup listing. The current application archive entries are also listed. No logical human FX curator was established. The briefing entrypoint exists, but its default archive location differs from the application's configured location and is absent; historical publish logs refer to the legacy location. Effective job-time overrides remain unproven. Backup inclusion is independent of correct producer routing and is not a new restore proof.

This design proposes roles and acceptance conditions. It does not turn those observations into an accepted editing assignment, an operating binding, or proof that a future scheduled publish will use the current archive.

## Approaches considered

| Approach | Benefit | Cost or boundary |
| --- | --- | --- |
| Document each existing default and keep manual coordination | Smallest source change | Cannot detect divergent producer and reader environments before a job acts |
| Explicit role/path contract with read-only preflight and private review receipts | Preserves current locations and existing interfaces; makes disagreements inspectable | Requires coordinated follow-up in PFO and the external briefing repository |
| Move inputs and archive into a new common root or one universal writer | Could simplify a future layout | Requires migration, consumer cutover, backup and operational changes outside the approved scope |

**Author recommendation:** the second approach. This is a review proposal, not an owner-selected operational configuration. No new path or named human assignment is accepted by writing this document.

## Logical authority matrix

Roles identify responsibilities; a Unix account or filesystem mode is not an appointment to a role. One person may hold several roles, but the private assignment must name which responsibility is exercised.

| Resource | Proposed logical authority | Permitted responsibility after separate authorization | Readers and prohibited writes |
| --- | --- | --- | --- |
| Original institution statements, tax documents and screenshot files | Source custodian; retain existing custody | Acquire and preserve originals, record provenance, approve additional evidence copies | PFO and extractors read. No replacement, annotation in place, cleanup or mutation by a web evidence view |
| `fx-rate-observations.json` | Finance curator proposes; application operator commits on the authoritative host | Review a dated rate observation with cited evidence and expected base hash | FX extraction reads. No source push, automatic repair or inferred value from a missing input |
| `fx-hana-screenshot-evidence.json` | Same proposed curator/operator split | Review an annotation linking a screenshot to an observation; preserve original screenshot bytes | Reader validates references. The annotation is not the screenshot and cannot authorize editing it |
| `fx-transfer-overrides.json` | Same proposed curator/operator split | Review a specific transfer interpretation, evidence and reason | FX ledger reads. No blanket override, new account identity or undocumented owner assignment |
| Generated FX ledger, rate cache and extracted evidence projections | Existing generator under application-operator responsibility | Rebuild only through a separately authorized extraction/refresh | Not an authority for manual curation; never hand-edit to make a check pass |
| Tax-history evidence references and relink revisions | Existing single history writer under application operator | Separately authorized, revision-checked history operation | Existing root/hash validation remains; relinking changes a reference, not original document bytes. Web writes stay disabled |
| Briefing documents, benchmark archive and private archive history | Briefing producer operator | Sole normal producer of the reviewed archive; explicit serialized correction/backfill only in a later scope | PFO and rendering consumers read. PFO refresh/source sync must not generate, commit or backfill briefing documents |
| Existing account map and source-push mapping allowlist | Source custodian; unchanged | Existing reviewed mapping workflow only | This contract adds no map edits or private ownership metadata |

The human finance curator, any delegate and the producer's effective archive binding remain **unconfirmed**. The application-operator commit role is a proposed responsibility, not a claim that all legacy modules enforce one writer. Existing evidence access and tax-history guards must not be represented as universal filesystem protection.

### Curated-input review protocol

A future implementation should prepare a private candidate and review receipt before any operating write. The receipt records resource key, resolved authority path, current content hash, candidate hash, reason, evidence document references/hashes, proposed curator, committing role and acceptance status. Do not copy secret values or full source document contents into it. This is an input-file change receipt, not an account `inventoryReview` receipt or a tax-history revision.

A missing curator assignment, unresolved evidence, invalid candidate, changed base hash or a destination outside the reviewed authority blocks application; none is replaced by a default actor or a zero value. Evidence that has moved must be explicitly reviewed using existing root/hash rules, not silently relinked by this protocol. Original documents are never edited by the candidate application.

Only a later authorized implementation may add the guarded write operation: serialize with a module-specific lock, re-read and compare the expected content hash, validate the full candidate and verify backup readiness. Before replacement, durably preserve the candidate, prior revision and a private intent receipt with operation identity, before/after hashes, actor and reason. Atomically replace only the reviewed input, then finalize the completion receipt. Failures before replacement leave the input unchanged; failures after replacement are **committed, receipt finalization pending**, not unchanged-input failures. On retry, compare current content with the intent's base and candidate hashes: base means not committed, candidate means completion pending, and any other hash is a conflict requiring review. Never automatically replay or undo a financial input to repair a receipt. An authorized recovery may finalize the same receipt without another input replacement. Release process locks while retaining recovery evidence. No second writer, source-sync target or web editor is introduced.

Rollback is a separately reviewed input revision, not restoration of a whole data directory or replay of evidence. Changing these inputs can change calculated outputs; a refresh or ingest is a separate action and must not be hidden in candidate validation. This design provides no apply command.

## Path identity contract

Preserve existing per-file overrides, resolver behavior and sample isolation in [finance paths](../../../scripts/finance-paths.mjs). The contract describes resolved paths, not a mandatory physical relocation.

| Identity | Current owning interface | Proposed invariant |
| --- | --- | --- |
| Curated observation input | `STOCK_FX_RATE_OBSERVATIONS_PATH` and existing finance resolver | Reviewed input path on the designated authority; generator output cannot alias it |
| Screenshot annotation input | `STOCK_HANA_FX_SCREENSHOT_EVIDENCE_PATH` and existing finance resolver | Separate annotation path and validated original-evidence references |
| Transfer interpretation input | Extractor's `STOCK_FX_TRANSFER_OVERRIDES_PATH` / existing fallback | Explicitly inventory this legacy extractor override; do not assume it already belongs to the generic `FINANCE_FILES` registry |
| Briefing producer source checkout | External wrapper's `BRIEFING_REPO` | Exact reviewed producer checkout and entrypoint, distinct from archive storage |
| Briefing producer archive | External wrapper/publisher's `BRIEFING_ARCHIVE_DIR` | Explicit private configuration, identical for wrapper, document writer, benchmark updater, archive commit and renderer |
| PFO archive reader | `STOCK_BRIEFING_ARCHIVE_DIR` | Same existing canonical directory as the producer, resolved using PFO's actual configuration |
| Briefing input summary | `STOCK_BRIEFING_SUMMARY_PATH` | Separate generated input, not a destination for briefing history |

The proposed private archive authority is the **existing application archive**. Using it is a recommendation requiring confirmation of the producer binding, not permission to move or merge archives. `FINANCE_RECORDS_DIR` alone does not set every archive default. Neither repository should assume that the other's environment variable names are aliases.

Compare canonical existing directories after resolving each endpoint under its own actual working directory and configuration. Also compare host identity: an identical path string on two hosts does not identify shared storage. Remote/mirrored archives require a separately designed replication/authority contract; they cannot pass as the same archive here. Existing reviewed symlinks may resolve to the same directory, but no symlink may be created, redirected or inferred by the checker. Reject missing paths, loops and roots outside the private allowed location. A missing archive is an unresolved setup condition, not permission to create it.

The intended sole producer may have serialized stages writing different archive artifacts. Its wrapper, writer, benchmark updater, commit helper and renderer must receive one resolved archive identity explicitly. No stage may independently fall back to a legacy path after preflight succeeds. Preserve daily document schema, filenames, timezone/date semantics, benchmark layout and private Git history; there is no backfill or schema migration in this contract.

## Read-only preflight contract

A future checker should accept an explicit nonempty requested-contract set (`archive_path`, `curated_fx_authority`, or both), with a separate status and reason list for each, plus private endpoint descriptions prepared from the actual application resolver and producer job environment. An archive-only invocation must not require an assigned FX curator. The producer integration requests `archive_path`; a later curated-input apply operation requests `curated_fx_authority`. Aggregate success requires every requested contract to match, without promoting an unrequested contract to accepted. It must not depend solely on a login shell or assume profile `.env` inheritance. It may parse the supplied allowlisted configuration; it must not source arbitrary environment scripts or run a producer to discover its paths.

Return `matched`, `mismatch`, `unavailable`, or `conflict` with stable reason codes and a private receipt containing:

- Contract version, observation time, endpoint role, host identity, working directory and configuration-source fingerprint.
- Resolved logical/canonical paths and relevant file hashes, without credential values or entire environment dumps.
- Explicit authority assignments and whether they are pending, proposed or accepted. Unassigned human authority is distinct from path mismatch.
- For the archive, whether every stage uses the same identity; for curated inputs, whether reviewed input/output roots remain distinct.
- Backup coverage observation scope and time, if supplied. `not_checked` is not `covered`, and listing inclusion is not restore acceptance.

An exit success for the future checker should mean a fully matched requested contract; mismatch, unavailable inputs or conflicts return a nonzero diagnostic outcome. A partial report must still be available for review. This proposed tool is distinct from the annual-tax CLI, whose valid blocked results intentionally exit zero; do not alter that existing interface.

The checker itself must make no directory, lock, cache, candidate, permission, marker or configuration changes; emit the receipt to stdout and let the caller decide where to retain it privately. It must not use a universal environment dump, acquisition request, extraction, Git update, archive commit, publish, service restart, backup or restore. Testing read access cannot be described as proof of write access.

For a later authorized producer integration, the job must perform this check **before** artifact writes, archive Git changes, remote publishing, notifications or external generation. Block on any path mismatch or unavailable endpoint; do not fall back to the legacy path. A successful preflight is not authorization to publish. Keep the checked configuration fixed for the invocation; reject changed endpoint identity before writing. PFO's read-only view should continue to show an available existing archive when producer readiness is unknown, with a separate readiness warning rather than deleting or fabricating history.

No new preflight gate runs on the current schedule merely because this design merges.

## Implementation and acceptance packages

| Later package | Deliverable | Evidence required | Execution boundary |
| --- | --- | --- | --- |
| PFO contract foundation | Typed endpoint/authority receipt, pure canonical-path comparisons, read-only checker and synthetic cases | Deterministic fixture results and no-write/no-network proof | Source PR only; no operating file discovery or write helper in this first increment |
| Briefing producer integration | Explicit shared archive identity passed through all stages; preflight before side effects | Stubbed producer/benchmark/commit/render calls, fixed job environment, fail-before-side-effect cases | Separate source PR in the producer repository; no scheduler or environment change |
| Curated FX change review | Validated candidate/receipt and later guarded commit design | Actor/base-hash/schema/evidence/rollback tests, backup readiness | Must have a confirmed human role assignment and separate implementation/write authorization |
| Private operating preparation | Actual endpoint/environment and authority assignment receipt, backup/rollback review | Read-only check in the real job context without executing the producer | No path move, backup/restore run, publish or configuration edit |
| Operating adoption | Reviewed settings or input change and bounded acceptance | Approved exact change, preflight, preservation and rollback checks | Separate explicit authorization; not granted here |

The first package is intentionally independent of unresolved personal account ownership. Keep all unresolved account and curator decisions unknown; an endpoint contract cannot certify a complete inventory or correct financial totals.

### Synthetic verification matrix for later code

Cover equal lexical paths with different working directories; equal strings on different hosts; different paths resolving to the same reviewed directory; absent target; root escape; symlink loop; changed configuration/path identity; unknown curator; archive-only success with FX authority unresolved; combined-contract partial failure; wrong writer role; input/output collision; legacy transfer override precedence; sample/private isolation; changed base hash; invalid candidate; missing or hash-mismatched evidence; unrelated-root evidence; and read-only access without write permission.

Producer tests must show zero generation, publication, notification, benchmark, archive-write and Git-commit calls on failed preflight; all stages receive exactly the matched identity on success. Curated-input tests must show unchanged originals, mappings and operating files on pre-commit rejection or interruption. Also cover interruption before and after replacement, receipt-write failure, same-operation finalization without a second replacement, and conflict when current bytes match neither recorded hash. A historical empty archive, a fresh file or a loaded schedule must not create a completeness or recovery claim. Do not use real account labels, paths, original documents, financial values or production receipts as fixtures.

## Remaining owner decisions and preserved holds

Before any operating adoption, confirm the human finance curator/delegate, the operator who may commit a curated change, and the existing application's archive as the producer's intended shared authority. Establish the actual job-time environment and backed-up destination without replaying a job. No percentage allocation, additional account input or new tax investigation is required by this design.

Keep private web writes disabled and approved-device access unchanged. Shared backup-runtime update drift and the held monthly drill remain separate from path reconciliation; neither may be repaired or activated incidentally. Existing backup and recovery evidence retains its scope. No automatic cleanup, source push expansion, FX re-extraction, briefing backfill, repository rename or deployment is proposed.

## References

- [Compatibility inventory](../../architecture/compatibility-inventory.md)
- [Finance paths](../../../scripts/finance-paths.mjs) and [source-push allowlist](../../../scripts/push-sources.sh)
- [FX extractor input/output contracts](../../../scripts/extract-fx-ledger.py)
- [Existing evidence root/hash reader](../../../lib/application/evidence-index.ts) and [reviewed history edits](../../../lib/application/tax-history-edit.ts)
- [Current operating priorities](../../product/next-increment.md)


## First source increment

The [recorded-observation foundation](../../architecture/finance-preflight.md) implements types, strict validation, pure requested-scope assessment and an explicit-file CLI. It intentionally does not observe endpoint/evidence paths or establish actual job-time environment. Its matched receipts are not live publish gates or operational authority; producer integration and curated writes remain separate.
