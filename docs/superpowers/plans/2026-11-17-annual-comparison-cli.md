# Annual federal read-only comparison CLI implementation plan

Status: implemented and independently reviewed; source-only synthetic validation. PR/CI acceptance remains separate from private execution and deployment.

**Goal:** Expose the merged read-only comparison adapter as a standalone stdout-only CLI requiring explicit files, evidence roots and an external review ID/revision/digest pin.

**Architecture:** Follow the existing standalone CLI pattern, without the env-loading general command router. Parse a fixed flag set completely before calling the unchanged adapter. JSON goes only to stdout; no output/apply/force/latest mode or default private path. Keep the checkout for the open PR/follow-up.

**Tech Stack:** Existing TypeScript, tsx, Node child-process tests and adapter; no dependencies.

**Spec:** [Read-only adapter](../../architecture/annual-comparison-adapter.md) and the merged annual comparison/review contracts.

## Interface decision

Use individual required flags rather than a new request-file format or config inference. Require `--input`, `--history`, `--review`, `--records-root`, one of `--tax-root` / `--no-tax-root`, and `--review-id`, `--review-revision`, `--review-sha256`. File/root values must be normalized absolute paths. Revision must be a canonical positive safe integer; digest is lowercase SHA256. No auto-pin or review writer is introduced.

## Global constraints

- Exit 0 only for compared/eligible results, 1 for adapter-blocked JSON (including unavailable or malformed explicit sources), 2 for CLI syntax/argument failure or unexpected internal exception; help exits 0.
- Reject missing/duplicate/unknown/positional/write flags and mixed help before touching financial files. Errors never echo arguments, source values, paths or exception text.
- Preserve the exact adapter JSON, its bounded observation/verification scope and liability-difference meaning; do not label any result filing-ready, settled or authority-approved.
- No dotenv/config loading, fallback path, current-working-directory evidence discovery, state write, lock, report file, route, scheduler or private execution.
- Validate exclusively with invented fixture files. Keep all actual financial/original/map/access/write settings and unresolved decisions unchanged; automatic publication paused, generation/publication/Hometax/deployment held.

## Review focus

- Version pins cannot be omitted, rounded, duplicated, derived from the file or replaced by latest/default values.
- Help/invalid invocation reads no explicit data or ambient/default state, and environment write flags cannot enable any writer.
- CLI tests spawn the actual process from another working directory, with spaces/Unicode paths, sentinels and proven read/write observers.
- Blocked results retain null differences and meaningful exit 1, never successful exit 0 or a zero liability guess.
- Stdout/stderr contract and file preservation are tested independently of matching the adapter implementation.

## Task 1: standalone command and synthetic subprocess proof

- [x] Add child-process tests for compared/blocked/invalid/help behavior, required flags/pins, no writes/default reads and preservation; observe missing-entry RED.
- [x] Implement the thin CLI and package command; reuse unchanged adapter without broad parser/framework extraction.
- [x] Run focused CLI/annual/history/evidence tests, typecheck/lint and independent review; address important findings with regression proof.
- [x] Run full artifact-only synthetic suite and open a review PR. CI and merge/private-adoption acceptance remain separate.

## Verification record

The 9 subprocess CLI tests passed, including spaces/Unicode file paths. The focused annual/history/evidence suite passed 216 tests before the final fixture-only Unicode/type annotation adjustment; the final artifact-only full suite includes that adjustment and passed 1,770 tests, skipped 14, failed 0 (1,784 total). Typecheck, lint, documentation links and diff whitespace checks passed. Independent review found no blocking issue. No operating financial file was selected, and no deployment or operating configuration change occurred.
