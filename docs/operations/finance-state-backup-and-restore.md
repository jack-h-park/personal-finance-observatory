# Finance state backup and restore

Durable state includes tax history and its embedded audit log, saved tax plans, rebalance proposals/fills/events, policies, account mappings, trigger state, and notification deduplication. Briefing archives and irreplaceable fetched history also need retention even when kept outside the state root.

The application host is the sole tax-history writer. Source-custodian mapping files and application-host policies retain their existing ownership until an explicit migration changes it. Source sync must not overwrite host-owned state.

## Before enabling private writes

Confirm the resolved state root is included in the host's actual backup target list. A parent records backup may already cover it; verify exclusions and restore behavior rather than inferring inclusion from the directory name. If outside existing coverage, add and verify a backup target first. This repository does not establish that any particular host's external backup is configured.

## Restore proof

1. For a rehearsal, keep live paths untouched and select compatible pinned snapshots with independent capture receipts. Stop live writers only for a separately authorized authority switch; an isolated read-only rehearsal must not pause services merely to compare with moving live files.
2. Preserve the current state, backup metadata, and configured path overrides. Do not overwrite the only recoverable copy.
3. Restore into a separate private validation destination. Validate the schema and inspect state revision, audit log, representative effective bases, and settlements.
4. Rebuild the disposable portfolio DB in isolation and confirm tax history remains unchanged. The history MVP reads durable state directly, so an unavailable or rebuilding portfolio DB does not invalidate its records.
5. Compare the restored history projection with the backup's expected record counts and reviewed example obligations. Reopening the application alone is insufficient proof.
6. Only then prepare the configured authority switch. Keep the former state read-only for rollback; never leave two active writers. Resume operations separately and record acceptance.

Synthetic automated proof is in `tests/tax-history-durability.test.ts`; it runs the actual isolated ingest and checks restoration without accessing private data. Private backup acceptance remains an operator task.

## Observed operating acceptance: November 13, 2026

The owner-specific durable-state audit established three distinct encrypted scopes: custodian sources/connector records, application-host records/state and fleet configuration/delivery state. An existing source-push allowlist is not a full archive backup. Filesystem ownership alone is not a universal writer guard; keep per-module logical authority explicit.

The custodian scope was expanded through workspace-governance [#241](https://github.com/jack-h-park/workspace-governance/pull/241), which is merged. Independent password/authentication-store access was confirmed by the owner, configuration content/hashes were reviewed, and share-quota headroom was checked before activation. Only the daily backup and its shared scope helpers were installed. Original roots and the existing mapping targets were retained, full financial history and connector records/runtime/state added, and reviewed configuration files explicitly allowlisted. Authentication files remained separately held.

The first expanded snapshot's actual target listing and all captured file hashes/link texts matched its independent baseline. It was then restored into a new private destination under an acquisition process sandbox, followed by an offline, read-only check with external communication and operating-path access blocked. File integrity, required evidence-link closure, JSON readability, read-only SQLite structural checks and connector run/payload/provenance relationships passed for that snapshot. Two external generated dependency-cache links were explicitly left unrecovered; neither is original financial evidence. The accepted final return files were hash-verified without recalculating the return.

This is single-snapshot custodian recovery proof. It does not prove operating-host recovery, cross-repository atomic consistency, provider reauthentication, full application/browser acceptance or physical host-loss recovery. No restored code or production workflow was executed or promoted. Operating records/evidence, gateway/access configuration and disabled web writes were preserved; a transient live SQLite shared-memory mtime-only change was recorded separately with unchanged bytes. Private snapshots, figures, account identifiers, paths and detailed receipts are not public fixtures.

Daily attempts retain their existing schedule and skip after that day's success. Scope-version markers prevented an old success from skipping the first expanded capture. The monthly drill was not replaced or run: its new marker namespace could make it newly eligible. Its operating rollout and later application/cross-repository recovery are separate gates. The loaded registration and manually verified capture do not prove a later ordinary scheduled run.

Keep the decrypted recovery specimen private/read-only until an explicit retention decision; preserve receipts before any later cleanup. Broader shared-runtime updates must review the held drill rather than incidentally enabling it. Curated FX editing authority, the briefing producer's effective archive path, and compatible operating-state/delivery-state recovery remain bounded follow-ups. See [next priorities](../product/next-increment.md).


## Read-only follow-up: November 15, 2026

A later audit corroborated ordinary daily captures using the loaded custodian schedule, timestamped backup logs and dated repository snapshots, together with the operating-host job metadata and a later stock-state snapshot. This is evidence beyond the earlier manually initiated first capture. It does not establish future schedule reliability, all daily captures, snapshot integrity by restore, or cross-repository consistency. Restic inspection used metadata/listing commands with locks and cache disabled; no backup, restore, maintenance or scheduled job was invoked by this audit.

The installed expanded daily script and scope helpers still matched their approved installation receipt. Shared-runtime automatic pulls failed because retained local changes prevent the update; the wrapper then used its last-good installed code and produced the later daily snapshots. Treat update drift separately from backup failure. Resolving it must preserve the separately held monthly drill and reviewed scope; this audit did not pull that runtime, edit files, clear markers, restart schedules or repair configuration.

All inspected curated FX inputs and the existing application briefing archive entries were present in the latest operating-host snapshot listing. This proves path inclusion for that capture, not content-level restore acceptance. The FX files are owned by the runtime account; source code reads those curated inputs and produces separate generated outputs. No universal edit guard or authorized human curation owner was established. Original financial documents remain under source-custodian authority; hash-checked evidence views and blocked web editing do not transfer authority to mutate originals.

The briefing producer entrypoint exists and the registered weekly job remains enabled. Its default archive destination differs from the application's resolved archive and is absent on the inspected host. Inspected profile environment files do not establish a corrective override. Historical producer logs show writes to the legacy destination, not proof of a future write to the application's current archive. Effective job-time environment and the intended archive authority therefore remain unresolved. Existing archive backup coverage is established independently of that producer-path gap. Do not run a publish, create a compatibility path, move an archive or change an environment to resolve the audit question.

Unanswered private account-holder, co-owner, lifecycle and inclusion decisions remain unknown. Actual financial records, source evidence, account mappings, environment, service and gateway configuration, access restrictions and disabled web writes were preserved within the recorded audit scope. Hometax and additional deployment remain held. Private paths, identifiers, snapshots, hashes and log details are retained outside this public repository.


The follow-up [authority/path design](../superpowers/specs/2026-11-15-finance-authority-path-design.md) defines proposed editing roles, one archive identity and a future read-only preflight. It does not resolve pending human assignments, change backup targets, invoke a producer or authorize configuration changes.


## Briefing scope activation and isolated recovery: November 17, 2026

The application-host briefing/operator gap identified after the November 15 audit is closed for the inspected captures. This acceptance supplements the earlier custodian recovery; it does not replace that evidence or establish complete host recovery.

| Stage | Accepted evidence | Boundary |
| --- | --- | --- |
| Producer source and inactive installation | Briefing producer [#75](https://github.com/jack-h-park/stock-portfolio-briefing/pull/75) and [#76](https://github.com/jack-h-park/stock-portfolio-briefing/pull/76) merged; the two-stage producer is installed with reviewed host/archive bindings | Generation/archive writes and reviewed static publication are separate stages; neither has run under this rollout |
| Backup source and installation | Control-plane [#1924](https://github.com/jack-h-park/hermes-control-plane/pull/1924) merged after CI success; both installed financial backup/drill scripts match the approved source | Existing targets, credentials, schedules and retention retained; the drill was updated but not executed |
| First expanded financial capture | New pinned snapshot includes the complete operator-state root, existing financial/application targets and empty review/work directories; selected capture hashes match independent source hashes | The existing same-day marker was retained; a direct exact-scope capture avoided a wrapper no-op. No future review/receipt/run is invented |
| Selected fleet controls | A separately pinned existing fleet snapshot contains the current held launcher and disabled/paused job; generation manifest/checksum and selected control hashes verified | Only four fleet files were restored; this is not a full fleet/credential-store recovery or an atomic financial/fleet snapshot pair |
| Separate-location restore | Complete financial snapshot restored outside operating paths; all 664 regular-file hashes/sizes/original modes and two literal link targets matched the independent capture baseline | Links remain quarantined. No restored launcher, scheduler or application entry point ran; no input was promoted |
| Isolated data reading | Network, all writes and live-home reads were blocked and probed; credential-free trusted reader parsed archive/app JSON and passed the primary SQLite integrity check with a zero-byte captured WAL | Read-only data checks are not web-app startup, browser acceptance, provider reauthentication or full failover |
| Preservation | Financial contents, maps, app data, credentials metadata, backup settings and publication pause retained; restored inputs reverified after reading | An existing SQLite SHM mtime-only difference retained identical bytes. A concurrent gateway edit changed whole-file hashes; exact before/after/live finance-route equality was verified without reverting that edit |

The operator root now has demonstrated encrypted custody and isolated recovery. It currently contains only reviewed nonsecret bindings; future private review manifests, nested publication receipts and full run payloads remain in the full backup scope. No cleanup or expiry policy was applied. Decrypted recovery material remains private/read-only pending an explicit retention decision.

The application and producer archive bindings now agree. The former absent legacy default is a historical audit finding, not the next unresolved installation task. The held default entry cannot dispatch real stages; the target job remains disabled/paused. Source/host checks do not prove a future scheduled child, generation result, archive write or web publication. Generation/archive writes can become visible to the finance reader before static publication; separating those stages is not a draft-to-canonical promotion system. A missing publication receipt also does not prove that a transfer never happened.

Remaining durability work is bounded: later ordinary scheduled capture evidence for the expanded scope, an explicit retention decision, and separately scoped wider host/delivery-state or interruption recovery if needed. Do not repeat the completed first capture/restore as pending or label the wider Task 6 recovery program complete. The older custodian shared-runtime/monthly-drill gate remains distinct from this operating-host two-script rollout.

Snapshot IDs, source inventories, paths, configuration hashes, manifests, timings and detailed acceptance receipts remain private. Financial originals, account decisions/mappings, owner-device access and disabled web editing are preserved. Actual generation, web publication, Hometax and automatic briefing resume remain held.
