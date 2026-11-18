# Private annual federal comparison preview: authority and acceptance design

Date: November 17, 2026 (America/Los_Angeles).
Status: **design proposal only**. The owner authorized merging #339 and preparing this design PR. No private path, human role assignment, scenario, review bundle or execution has been adopted. Source merge does not authorize preparation writes, private execution, installation or deployment.

## Outcome and existing boundary

Make one later, explicitly authorized private comparison reproducible: identify the correct history authority, separately reviewed input and approval versions, then read them without changing the financial record. This is a bounded 2025 US federal liability comparison, not a filing review, settlement reconciliation or complete KR/US planner.

The [composition contract](../../architecture/annual-composition-contract.md) #332, arithmetic #336, [adapter](../../architecture/annual-comparison-adapter.md) #338 and [explicit-file CLI](../../architecture/annual-comparison-cli.md) #339 are merged. They already implement current-basis selection, evidence hash checks, version pins and stdout-only results. Do not reimplement them. Their synthetic proof does not select the private authority or appoint a human reviewer.

Keep the accepted final 2025 return version as the historical reference; do not reopen its filing or resolve the earlier immaterial document discrepancy. A filename/version label alone does not establish that the operating history selected that reference. Observe the current explicit effective basis later; if inconsistent, stop and report the mismatch without importing, relinking or replacing it. Do not reconstruct income from original returns to obtain a passing comparison.

## Approaches and recommendation

| Approach | Advantage | Decision / cost |
| --- | --- | --- |
| Run against convenient local files or infer latest review | Minimal preparation | Reject: file equality cannot identify the operating authority or grant review consent |
| Explicit private authority binding and scoped human acceptance, using the existing CLI | Reuses delivered code and preserves current paths | Recommended design: small private preparation/approval record, with no new runtime store |
| Add web review forms, automatic extraction or a second comparison service | Broader automation | Defer: new writers, access and deployment scope are unnecessary for one preview |

The second approach is the author's recommendation. Approving this design does not itself accept any actual path, reviewer assignment, tax treatment or later execution.

## Path contract: preserve the existing authority

All names below are logical bindings, not installed paths, new environment variables or CLI defaults. Keep their host-specific absolute values in a private acceptance record, never in public git or a PR body.

| Binding | Proposed source and identity | Restriction |
| --- | --- | --- |
| Execution host and checkout | Designated application authority host; exact source commit and dependency/runtime identity containing #339 | No assumption that an arbitrary MacBook copy is current. No service restart or deployment is needed for a separately approved one-shot source invocation; installing/copying code or dependencies is a separate write |
| History file | Existing resolved `config.finance.stateDir` plus `tax-history.json`, as used by [taxHistoryPath](../../../lib/adapters/tax-history-store.ts) | Observe the real application's resolver context, including its working directory and reviewed allowlisted settings. Never select from shell defaults, another checkout's `data/`, a restore specimen or a new copy |
| Records and tax evidence roots | Existing [finance resolver](../../../scripts/finance-paths.mjs) bindings used by the selected history/evidence reader | Retain per-file override precedence and current evidence-root policy; explicitly record absent tax root as null. Do not move/relink originals or search for a replacement to make a check pass |
| Estimate input and review bundle | Proposed immutable versioned files under a separately accepted private review location | These are calculation/review artifacts, not imported history or new canonical financial records. No file location is currently accepted |
| Approval and optional result receipt | Separate private operator review record outside public source, static publishing roots and finance-readable briefing archives | Do not introduce a second history authority, auto-approved pin file or web-visible report |

Recommended layout after separate acceptance: an `annual-tax-comparison/2025/<review-session-id>/` namespace under the already designated private operator-state root, with immutable `input.rN.json`, `review.rN.json` and distinct acceptance/result records. This is a relative namespace proposal, not permission to create it or reuse a briefing approval schema. No new config key, resolver default, backup target or directory is added by this PR. Reject any location that aliases an original, history, mapping, generated cache, briefing archive or public static directory. Review ID/session path components must be safe literal names with no traversal.

The CLI requires normalized absolute JSON paths and rejects linked JSON files/parents. Use a reviewed canonical path that meets that existing rule; do not modify a symlink or relax the adapter to accommodate a convenient location. Evidence roots retain the resolver's existing rules. Bind host identity as well as path strings; identical paths on different machines are not the same authority.

A copied history is not the live authority. An isolated-copy rehearsal may be separately approved, but must be labeled a snapshot rehearsal and never accepted as a current operating comparison. No history copy is needed by the recommended flow.

## Human responsibility and version acceptance

Roles are responsibilities, not inferred from Unix ownership, SSH access, evidence presence or existing FX curator assignments. The owner can explicitly appoint one person to multiple roles; an agent may assist preparation but cannot assert its own human acceptance. Actual assignments remain pending.

| Role | Responsibility | Cannot authorize by implication |
| --- | --- | --- |
| Financial owner / scope approver | Accept the named people, one tax unit/year/authority/profile, paths and permitted one-shot action | New account ownership, cross-border treatment, publication or writes outside that action |
| Tax-input reviewer | Accept the already determined taxable base, filing/residency/method eligibility, component applicability, credits and source references | A document hash does not prove tax treatment; unknown or unsupported inputs cannot be relabeled reviewed |
| Comparison reviewer | Accept explicit current history basis, line-24 mapping, membership and numerical calculation approval | Cannot replace liability with a payment/refund sum or attest settlement completeness |
| Application operator | Bind the correct host/files/source commit, check permissions and custody, then run only the accepted invocation | Cannot derive approval by reading the same selected bundle, enable web writes or repair a failed gate |

The private acceptance record should state its record ID, status (`proposed`, `accepted`, `superseded` or `withdrawn`), dated human acceptance and role assignments; the bounded purpose/action; host and source identity; all selected absolute file/root bindings; tax unit/year/authority/profile; and the accepted input/history/basis/review/calculation identities. Keep pending roles/fields explicitly pending rather than inserting example names or the current date as approval.

Record the existing review bundle ID/revision/canonical SHA256 separately from that selected bundle. Also retain input canonical digest/revision, rule-pack identity, complete history canonical digest/revision, selected obligation/unit/basis revisions, composition contract/calculation digests and related evidence IDs/revisions/hashes. Preserve the existing contracts rather than inventing another hash algorithm. Raw-byte hashes, if retained for preservation checks, are labeled separately from canonical JSON digests.

Approval is of the actual values and numerical result, not just a hash string. A prior synthetic expected amount, computed pin or successful component cannot constitute human approval. Obtain the calculation identity through a separately permitted preparation/rehearsal step and show the reviewed amount/mapping before acceptance. If no reviewed preparation artifact exists, stop; the comparison invocation must not fabricate its own approval. This design supplies no preparer, digest helper or review writer.

## Staged gates and stop conditions

| Stage | Required evidence before proceeding | Permitted outcome after its own authorization |
| --- | --- | --- |
| 0: this design | Source/contracts reviewed, private execution still held | Public design PR only; no operating discovery, file creation or actual comparison |
| 1: read-only readiness observation | Owner selects target host and observation scope | Observe allowlisted resolver/path settings, selected source identity, file availability/access, existing reviews and backup scope without comparing, parsing new original tax documents or preparing files. Keep observations private; do not dump environment/credentials |
| 2: private preparation and acceptance | Explicit permission to create specific input/review/acceptance files, named human roles, source references and a permitted private destination | Create only the accepted artifacts without changing history/originals/maps. Review scope and actual numerical approval. If inputs are unsupported or unavailable, leave blocked; do not start historical-return investigation |
| 3: one-shot read-only comparison | Accepted unchanged versions, correct authority/path binding, custody/output destination and exact CLI invocation | Read the explicit files; no application writer, importer, generator, scheduler, network publication or refresh. Optional redirected output is a separate approved private artifact write |
| 4: result acceptance | Exit/status, current identities, blockers and preservation observations reviewed | Accept only this bounded observation, or retain blocked/failed status. Do not promote it to a web estimate, ledger update or renewed schedule |

Stages are permission boundaries, not an automatic pipeline. A source PR merge does not cross any operating stage. The next proposed action is Stage 1 only, if separately authorized. Existing files may make some preparation unnecessary, but presence never waives human acceptance or execution authorization. No new tool implementation is a prerequisite when the existing CLI and a concise private record suffice.

Before Stage 3, record read-only permissions/process scope, preserve `FINANCE_STATE_WRITABLE=0` for the operating application and the automatic briefing pause, and ensure the invocation contains every required path and external review pin. CLI read-only behavior does not depend on the application's write flag; neither setting is a universal filesystem permission guard. Do not change permissions or settings just to satisfy the plan.

Stop on absent/mismatched authority, pending human scope, unsupported tax treatment, stale or changed input/history/review/evidence, unreadable/linked/oversized sources, uncertain approved output destination or incomplete preservation/custody evidence. Do not select latest, update a pin, fill a missing value with zero, retry against changed versions, run an importer or correct an effective basis. Refresh observations and obtain renewed acceptance for affected identities; unrelated unresolved account questions stay unresolved.

A new source version requires an operator compatibility review; accepted input/history/review identities never automatically authorize a changed executable. A changed target host/path/root requires a new binding review. A stale date alone is not a new version, but approval must still cover the actual intended use and all current identities.

## Result, custody and recovery

The current CLI returns eligible comparisons with exit 0, blocked JSON with exit 1, invalid invocation/unexpected failure with exit 2 and no result. Sole help exits 0 and prints usage. Preserve the complete result and exit separately if output retention was authorized; never treat an exit-1 null difference as zero. Treat stdout, command history, terminal capture and error context as private. No PR attachment, public logs, briefing archive write, browser activation or unattended redirection is allowed by this design.

A future private result receipt should bind its acceptance record and exact invocation/source identity, observation time, exit/status, result digest, observed review/history/evidence identities, blockers, comparison direction and preservation checks. A result is an observation, not an authenticated reviewer signature, atomic cross-file transaction, correct-tax certificate or payment/refund receipt. Both adapter pin/evidence verification and nested `supplied-metadata-only` limitations remain visible. Later use requires fresh observation; a stored result is not permanently current.

Before accepting new retained artifacts, verify exact-path backup inclusion and exclusions, access and restore placement against the [existing custody record](../../operations/finance-state-backup-and-restore.md#briefing-scope-activation-and-isolated-recovery-november-17-2026). The operator root has bounded prior recovery proof, but future annual-comparison files have not been captured or recovered. A new custodian/host/root or output outside the established scope is a gap requiring a separate plan, not an implied backup change. Never run a backup/restore or copy credentials under this design's authority.

No financial rollback should be needed after a correctly bounded read-only preview. On failure, stop the invocation and retain only separately approved private diagnostics; do not restore over live state or delete original files. Mark a superseded acceptance/result explicitly rather than overwrite it; no automatic cleanup, expiry or retention change is proposed. Artifact creation or unexpected mutation is an incident to review, not permission for an automatic undo.

## Design acceptance and remaining work

This PR is complete when all logical paths map to existing interfaces, responsibilities and unknown assignments are distinct, the canonical/raw-digest and numerical approval boundaries are explicit, and each operating stage has a separate acceptance/stop condition. Documentation links, privacy and diff scope must pass review. No new runtime tests or private replay are necessary for this documentation-only change; existing synthetic CLI proof is retained, and repository CI remains separate evidence.

Next, seek authorization only for the bounded Stage 1 readiness observation, not all later stages. Report whether usable reviewed artifacts already exist and list only the missing assignments/inputs/custody facts. If the selected real profile is unsupported, record that blocker and return to broader PFO coverage/planning work rather than expand this into filing preparation. Korean reported-tax/Hometax, California, unsupported methods and a future web estimate remain separate scope.

Preserve unresolved account/curator decisions, actual financial data, original evidence, account mappings, owner-device access and disabled web editing. Automatic briefing publication stays paused. Actual briefing generation, web publication, Hometax, deployment and operating settings changes remain held.
