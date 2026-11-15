# Recorded-observation finance preflight

The first source increment of the [authority/path design](../superpowers/specs/2026-11-15-finance-authority-path-design.md) implements typed input/receipt contracts, strict validation, a pure assessor and an explicit-file CLI. It does **not** observe the operating filesystem, load configuration, appoint a curator, change a path or integrate with the briefing producer.

```sh
pnpm --silent finance:preflight --input examples/finance-preflight.synthetic.json
pnpm --silent finance:preflight --help
```

Use `pnpm --silent` for machine/private output; unsilenced package invocation can print a lifecycle banner containing the supplied path. The CLI accepts exactly `--input <file>` or `--help` alone. It reads one regular UTF-8 JSON file, at most 1 MiB, with nonblocking open and symlink rejection on supported POSIX systems. It has no automatic discovery, environment/config loading, endpoint/evidence reads, network call, output-file option, lock, cache, apply mode or write opt-in. Shell redirection remains the caller's responsibility.

## Input and evidence meaning

The [synthetic example](../../examples/finance-preflight.synthetic.json) demonstrates `archive_path`. The exported [types](../../lib/domain/finance-preflight/types.ts) define both requested scopes. Unknown fields, versions, duplicate/empty requested scopes, malformed timestamps, fingerprints or paths, and accepted assignments without actor IDs are rejected. Version 1 accepts normalized POSIX absolute cwd/observed paths and relative or absolute configured paths. It does not guess Windows semantics, host identity or environment precedence.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Exactly 1 |
| `observedAt` | Explicit valid UTC ISO timestamp; caller-supplied observation time, not a live freshness approval |
| `requestedContracts` | Nonempty unique selection of `archive_path`, `curated_fx_authority`, or both |
| Endpoint `hostId`, `cwd`, `configuredPath`, `configurationSha256` | Caller-recorded context and configuration fingerprint; fingerprint bytes are not opened or verified |
| Endpoint `observation` | `available` with resolved/canonical paths, canonical allowed root, kind and read-access state; or `missing`, `unavailable`, `conflict` |
| Archive | Producer, consumer and all four stages: document writer, benchmarks, archive commit and renderer |
| Curated FX | Curator/committer assignments, all three named input/authority pairs and at least one generated output observation |

An available observation asserts how a path was resolved; the assessor checks that the lexical resolved path agrees with its own cwd/configured-path calculation and that the canonical path stays within the supplied canonical allowed root. It cannot establish whether that claimed canonical path/root is truthful, currently exists, still resolves there, or is a privately approved location. The global filesystem root is rejected as an unbounded allowed root. Symlink loops and unreadable/missing targets must be represented by the observation provider as unavailable/conflicting facts; no symlink or target is followed by this increment.

Archive-only assessment ignores valid but unrequested FX assignment readiness. A combined request retains each scope's result; unresolved FX roles cannot erase a matched archive sub-result. Each archive endpoint must be a readable directory at the same canonical path **and host**, including all stages. Different lexical aliases may match only through their supplied canonical observations.

Curated-FX assessment requires accepted explicit actors in the correct curator/committer roles, each input matched to its recorded authority, all three resources exactly once, no alias between distinct inputs, and no canonical input/output collision on the same host. Those accepted states are input claims, not a tool-generated appointment or permission check. Read access is not write authorization. Original evidence validity, candidate contents, base revisions, backup readiness and a future guarded commit are outside this slice.

## Receipt and exit contract

| Outcome | Exit | Output |
| --- | --- | --- |
| All requested declared contracts match | 0 | JSON receipt |
| Valid input with mismatch, unavailable facts or conflict | 1 | JSON receipt with independent results and stable reason codes |
| Invalid invocation, file, UTF-8, JSON or schema | 2 | No stdout; fixed redacted diagnostic on stderr |
| `--help` alone | 0 | Usage and scope explanation |

Status precedence is `conflict`, then `mismatch`, then `unavailable`, then `matched`. Missing requested contracts/stages/resources and unconfirmed roles remain unavailable; duplicates, incorrect roles and contradictory facts are conflicts. Endpoint paths and actor IDs appear only in a valid private receipt, not in parser errors. Successful JSON is intentionally private even if it reports a mismatch.

Every receipt includes `evidenceBasis: provided_observations`, `liveVerified: false`, `operationAuthorized: false` and `backupStatus: not_checked`. Input SHA-256 hashes JSON serialization of the validated supplied object, **not** source files, canonical semantic equivalence, or evidence bytes. Endpoint receipts contain the explicit context, observation paths and configuration fingerprint. Unrequested endpoint data is not copied into scope receipts; the input hash still covers the entire validated input.

A `matched` result is internal consistency of the supplied recorded contract. It is **not a live publish gate**, owner attestation, valid FX edit, current account review, proof of backup/recovery, or operating acceptance. A future separately reviewed observation layer must establish real job-time configuration and host/path identity and keep them fixed through execution before producer gating can rely on the assessor. This increment adds no caller to the app, refresh, schedules, source sync or producer repository.

## Verification and preserved boundaries

Synthetic domain tests cover independent scopes, canonical aliases, host/cwd differences, missing/unreadable facts, allowed-root escape, wrong kinds/roles, duplicates, missing stages/resources, authority disagreement, input/output collision, malformed contracts, deterministic results and unchanged input. Subprocess tests cover exit/diagnostic contracts, symlink/directory/FIFO/oversized/non-UTF8 inputs and successful assessment while side-effect functions are denied. They also retain input/environment fixtures unchanged even when the child has `FINANCE_STATE_WRITABLE=1`; the tool never reads that flag or follows nonexistent endpoint locators.

No operating preflight was run, private proposal adopted, original opened, financial input/map changed, web write enabled, backup/drill invoked, Hometax accessed or app deployed by this increment. Human assignments and actual producer archive routing remain unresolved. The next packages are a reviewed live observation adapter and coordinated producer integration, not an unguarded FX apply command.


## Local observation follow-up

The separately scoped [local observer](finance-preflight-observer.md) collects explicit metadata and allowlisted effective process settings before using this assessor. It does not change this recorded-only command or make its results into a live scheduler/producer gate. See the [plan review](../product/plan-review-2026-11-15.md) for the remaining integration and operating boundaries.
