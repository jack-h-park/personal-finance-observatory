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
