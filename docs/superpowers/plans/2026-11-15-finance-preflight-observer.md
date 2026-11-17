# Local finance preflight observation implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, test-driven development, and one independent whole-branch review.

**Goal:** Collect explicit local endpoint metadata, host/process context and allowlisted effective settings for the merged recorded-observation assessor, without operating changes or producer invocation.

**Architecture:** A strictly validated request selects local endpoints and settings sources. A read-only adapter resolves known finance keys through the existing pure resolver, reads an explicitly selected producer environment key or explicit path, and collects only realpath/stat/read-access metadata. An application layer assembles the existing assessor input and preserves unknown authorities. A separate CLI accepts one bounded request file. No `.env` execution/loading, SSH, directory scan, original-file content read or configuration write occurs.

**Tech stack:** TypeScript, Node filesystem metadata/path/os/crypto APIs, existing finance resolver and node:test/tsx. No new dependencies or app/scheduler hook.

## Tasks

- [x] Add request types and strict validation, including bounded dense collections, fixed source-key allowlists, POSIX paths and existing assignment validation. Keep actual observation time and local host identity outside caller-supplied path claims.
- [x] Write RED tests; implement metadata collection for readable, missing, inaccessible, wrong-kind, special, root-escaping, looping and changing paths. Observe canonical roots and metadata identities without directory listing or reading endpoint bytes. Refuse requested foreign hosts and detect file hard-link collisions between curated inputs/outputs.
- [x] Integrate the pure assessor with independent requested scopes. Expose current process cwd, explicit endpoint base directories and configuration provenance separately. Do not infer curator acceptance, scheduler environment, hardware identity, backup readiness or write permission.
- [x] Add a bounded explicit-file `finance:observe` CLI and RED/GREEN subprocess tests proving no environment loading, writes, provider/network/child-process effects or endpoint content reads. Existing recorded-only CLI remains unchanged.
- [x] Review the master plan, status and next priorities. Document the split between local observations, future job-context pinning/producer integration and separately authorized operating acceptance. Preserve incomplete migration/recovery/inventory/KR gates.
- [x] Run focused/full synthetic tests, typecheck, lint, UI guardrails, isolated sample build and document checks; review the full branch independently; push a PR, without merging that new PR or deploying.

## Scope rulings

Use effective allowlisted process settings, not arbitrary shell or `.env` evaluation. Generic PFO keys reuse `financeFile`; the legacy transfer-override key is handled explicitly rather than pretending it is registered there. An explicit path is caller configuration, not proof that a producer uses it. Endpoint base cwd is requested context; actual process cwd and hostname are observed separately. Hostnames are not guaranteed unique hardware identities. Observation snapshots are not a race-free execution gate. All returned operational/job verification and write-authorization flags remain false.

All tests use temporary synthetic files. No operating collector run, actual financial/original/map edit, access or web-write change, backup/restore, Hometax or deployment is included. Unanswered human assignments remain unknown. Read-only inspection does not authorize later settings corrections.

## Verified source checkpoint

Independent review found no blocking issue; its suggested configuration-change regression and a mode-inference parity case were added. A URI-path credential-redaction regression was reproduced RED and fixed before final validation. The combined preflight suites passed 66 tests (25 observer tests). The full suite passed 1,468 tests, skipped 14, failed zero (1,482 total). Typecheck, lint, UI guardrails, isolated sample seed/build and 31 documentation links/anchors passed. No operating observation, producer invocation, settings change or deployment was performed. Source is ready for PR review; job-context and operating adoption remain separate.
