# Finance preflight foundation implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and one independent branch review. Steps use checkbox tracking.

**Goal:** Implement the first package from the [approved authority/path design](../specs/2026-11-15-finance-authority-path-design.md): validated types, deterministic pure assessment and a read-only explicit-file preflight with synthetic tests.

**Architecture:** Domain validation and evaluation consume explicit recorded endpoint observations. The CLI reads exactly one bounded regular JSON file, never loads environment/configuration or follows endpoint/evidence locators, and emits a private receipt. Path and accepted-role observations are caller claims, not live proof. A matched result never authorizes publication or an input write. Live job-context observation, producer integration and curated writes remain later packages.

**Tech stack:** TypeScript, Node path/crypto, existing tsx/node:test and package scripts. No dependency changes, application routes, operating adapters or new writer.

## Task 1: Contract and pure assessment

- [x] Add failing synthetic tests in `tests/finance-preflight.test.ts` for separate requested scopes, valid matches, different hosts/cwds, canonical aliases, missing/unreadable observations, root escapes, conflicting facts, stage/input multiplicity, unconfirmed/wrong roles and input/output collisions. Validation rejects malformed or excess fields rather than preserving unknown environment/credential contents.
- [x] Implement `lib/domain/finance-preflight/{types,validation,evaluate,index}.ts`. Explicitly support POSIX path observations; compare canonical paths and host identities without filesystem or environment reads. Validate observation-to-logical-path association and canonical root containment. Archive stages and three curated resource identities are explicit; unknown authorities remain unknown.
- [x] Require caller-provided observation time and configuration fingerprints. Results distinguish matched/mismatch/unavailable/conflict, stable reason codes, independent scopes and private endpoint receipts. Always report provided-observation basis, no live verification, no operational authorization and backup not checked.

## Task 2: Explicit-file read-only preflight

- [x] Add failing subprocess tests in `tests/finance-preflight-cli.test.ts`: deterministic parity; exit 0 matched, 1 valid blocked, 2 invalid; unknown/duplicate/apply flags; malformed/large/nonregular/non-UTF8 inputs; fixed redacted diagnostics; unknown/unrequested scopes; no endpoint/evidence/env reads or input/config mutation.
- [x] Implement `scripts/finance-preflight.ts`, a `finance:preflight` package command and one `examples/finance-preflight.synthetic.json`. Accept only `--input <file>` or `--help`; cap UTF-8 JSON at 1 MiB, reject symlink inputs and avoid blocking on FIFOs. No endpoint discovery, environment loading, outputs written, locks, networking or write opt-in. Successful receipts intentionally contain private identities/paths and must be handled privately.

## Task 3: Verify and document

- [x] Document actual input/receipt semantics and first-slice limits in `docs/architecture/finance-preflight.md`; link from the design and next-increment document without claiming producer activation or curator appointment.
- [x] Run focused tests, full synthetic suite, typecheck, lint, guardrails and isolated sample build as appropriate. Record results privately; use no actual finance fixtures or operating commands.
- [x] Obtain one independent branch review and resolve findings. Push and open the implementation PR; no merge, operation or deployment included.

## Rulings and preserved boundaries

The first package evaluates supplied observations rather than reading declared endpoint paths. This avoids operating discovery and makes it possible to test the entire no-write boundary before a separately reviewed live observer/producer integration. A matched receipt therefore means only that the requested declared contract is internally consistent. It cannot be used as a live publish gate without that later observation layer. All real financial records, originals, map, access, web writes, schedules, Hometax and deployment settings are untouched.

## Verified checkpoint

Independent review found a sparse-array validation gap; RED→GREEN regressions now reject holes, accessor indices, hidden serialization hooks and extra collection properties. Final focused suite: 41 passed. Full suite: 1,457 tests, 1,443 passed, 14 skipped, zero failed. Typecheck, lint, UI guardrails and the isolated synthetic sample build passed. No operating source/configuration or private-data execution was performed. The first implementation is ready for PR review, not operational adoption.
