# Local read-only finance observation adapter

This source increment follows the merged [recorded-observation foundation](finance-preflight.md). It collects real local metadata for explicitly requested endpoints and feeds that foundation. It does not change the existing recorded-only CLI or install a scheduled check.

```sh
pnpm --silent finance:observe --input local-request.json
pnpm --silent finance:observe --help
```

No operating request is included as a public example. Tests construct disposable synthetic directories. Running the collector on an installation is a separate action from merging its source; this implementation was tested only with synthetic local fixtures.

## Explicit request and configuration sources

The [request types and validator](../../lib/domain/finance-preflight/observation-request.ts) accept schema version 1, a nonempty unique requested-contract set, and optional archive/FX sections with the existing stages, resources and assignments. Every endpoint explicitly names a normalized absolute POSIX `cwd` and `allowedRoot`, a source, and optionally `expectedHostname`. The global filesystem root is not an allowed root. There is no recursive directory discovery, guessed producer checkout or implicit remote endpoint.

| Source kind | How the configured path is obtained |
| --- | --- |
| `environment` | Only the effective process `BRIEFING_ARCHIVE_DIR` value; absent/empty stays unavailable, without legacy fallback |
| `finance_file` | An explicitly selected PFO archive, FX observations, screenshot annotations, transfer overrides or generated ledger key, resolved by existing `financeFile` with its current/legacy precedence and sample/private rules |
| `legacy_transfer_override` | Compatibility selector for the shared transfer-override resolver, including current and legacy aliases and the private state default |
| `explicit_path` | A caller-provided literal path, identified as such; not proof that a running producer consumes it |

The collector snapshots only the finance resolver's supported path roots/overrides, its mode/write flag and the selected producer/legacy keys. It neither reads nor executes `.env`, shell profiles, arbitrary configuration scripts or credentials. URI-shaped configured paths are rejected without copying their value into receipts. Unrelated environment values are not copied or hashed. Supported path keys outside the requested endpoint are retained in that settings snapshot because they can affect implicit sample/private mode; no unrequested endpoint is probed. The configuration fingerprint hashes this allowlisted settings/source/cwd snapshot, not the bytes of an environment file or installed producer code.

## Host and cwd provenance

The receipt records OS hostname, a deterministic hostname-derived `hostId`, and the collector's actual `process.cwd()`. An endpoint's base cwd is explicit request context, checked as an existing directory; it is not asserted to be the scheduler's real working directory. Its `expectedHostname`, if different from the collector hostname, yields an unavailable foreign-host observation without filesystem probing or treating local settings as remote facts.

A hostname is not a hardware identity or proof of cross-host uniqueness. This adapter supports one local host per invocation, not SSH collection or a cross-host merge. Actual job-time environment, approved host binding and any shared-storage/replication contract remain separate. There is no attempt to read another process's environment.

## Read-only metadata and conservative failures

The [metadata adapter](../../lib/adapters/finance-preflight-observer.ts) resolves the existing allowed root, explicit base cwd and endpoint using realpath/stat. It checks canonical root containment before inspecting the target, rejects special endpoints such as FIFOs, and checks read access (plus directory search access). It does not list directory contents, open/read endpoint bytes, hash original files, probe write permission, create a symlink or modify modes/ownership.

It rechecks root/path resolution and root/target metadata after access observation. An observed change is a conflict; this is conservative change detection, not a race-free execution pin. Device/inode metadata detects hard-linked curated inputs and generated-output collisions even where canonical strings differ. Missing paths, inaccessible metadata, loops, wrong kinds and root escapes remain explicit collection/assessment reasons. Raw filesystem or resolver exception messages are not copied into receipts.

The application observes only requested contract endpoints and preserves curator/committer assignments exactly as supplied. Filesystem UID/GID/mode cannot appoint or confirm a human role. If the selected configuration changes during collection, the observations become conflicted rather than mixing configuration revisions. Physical collision evidence is fed into the pure assessment as a conflict, not ignored behind a matched result.

## Receipt and execution boundary

The CLI reads one regular UTF-8 JSON request, at most 1 MiB, rejecting symlink/nonregular inputs without blocking on FIFOs. Exit codes are 0 for matched assessment, 1 for a valid nonmatched report and 2 for invalid invocation/input with fixed redacted stderr and no stdout. Only `--input <file>` or `--help` alone are accepted; there is no output/apply option. Use the silent package invocation to avoid lifecycle banners containing private paths.

Receipts intentionally contain private paths, selected configuration provenance, file metadata and host context; handle stdout privately. The wrapper labels `collectionMode: local_read_only` but retains `jobContextVerified: false`, `liveVerified: false` and `operationAuthorized: false`. The nested assessor continues to label its inputs as provided observations and backup as not checked. The observed root is caller-selected, not proof of an approved private authority. No backup coverage or evidence-content validity is inferred.

A local `matched` receipt is not an execution gate: it does not prove scheduler environment, host uniqueness, installed producer-stage binding, continuing path identity, a valid curated candidate or backup readiness. A future reviewed job-context observer must bind the real producer settings and stages, keep that context fixed and run before generation, archive writes, commit, publication or notification. This increment adds none of those callers or side effects.

## Verification and remaining packages

Tests use temporary directories, aliases, file hard links and FIFOs, plus injected read-only metadata failures/change observations. CLI tests deny content reads, dotenv access, writes, network and child-process calls while preserving fixtures. Current/legacy setting precedence, mode inference, scope isolation, unknown actors, malformed requests and redacted diagnostics are covered.

The remaining program and plan review are recorded in [the November 15 checkpoint](../product/plan-review-2026-11-15.md). Actual collection against operating endpoints, producer integration, confirmed human assignments, backup-runtime repair, operating settings and rollout require their own authorized scope. Financial records, originals, account maps, approved-device access, disabled web writes and Hometax/deployment holds remain unchanged.
