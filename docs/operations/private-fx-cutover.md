# Private FX inputs and public history follow-up

The public repository includes FX extraction code and invented regression cases. The extractor reads operator-curated observations, screenshot transcriptions, and transfer overrides from private state. This change defines source behavior. No live path, backup, job or checkout change is part of the source PR.

## Private input contract

| Input | Private state filename | Array key | Explicit override |
| --- | --- | --- | --- |
| Transaction-time rate observations | `fx-rate-observations.json` | `observations` | `FINANCE_FX_RATE_OBSERVATIONS_PATH` |
| Hana screenshot annotations | `fx-hana-screenshot-evidence.json` | `rows` | `FINANCE_HANA_FX_SCREENSHOT_EVIDENCE_PATH` |
| FX transfer overrides | `fx-transfer-overrides.json` | `overrides` | `FINANCE_FX_TRANSFER_OVERRIDES_PATH` |

Each input has `version: 1` and the named array. Use a deliberately empty array when a private Hana installation has no records of that kind. For any Hana USD statement or any supplied curated file, the extractor checks all three inputs before statement parsing, external rate requests, or ledger writes. Missing or invalid inputs leave the last good ledger in place. An installation without Hana sources and without curated inputs needs no empty placeholders. Public builds and tests use isolated sample state and invented values.

Use `pnpm extract:fx-ledger` for the shared resolver. An explicit file override wins over the state path, and the corresponding `STOCK_*` aliases remain accepted. With no explicit file override, the state directory is `FINANCE_STATE_DIR` or the resolver's existing private state default under the configured records root. Sample paths remain isolated. Keep the private state directory and explicitly configured files outside publicly tracked paths.

## Operating handoff for a separately approved rollout

1. Identify the authoritative copies for all three inputs and the actual refresh caller. Prepare private copies outside the code checkout and compare their hashes with the authority. Verify their permissions, backup inclusion, and operator ownership. The update that removes tracked copies must not reach a private refresh checkout before its replacement inputs are ready.
2. In an isolated rehearsal using a reviewed input snapshot, point the new extractor at the private files and compare event identity, amounts, rates, provenance and balances to the previous input set. Confirm the missing-input guard with synthetic data. Keep the previously working source and ledger available.
3. After rollout authorization, set only the reviewed paths and use the documented release workflow. Verify the effective job environment before permitting refresh. If input readiness or parity fails, retain the prior ledger and restore the prior reviewed release and configuration together.
4. Retain local backup files privately. The public ignore rules and tracked-file test cover the observed backup directory and rotation names. They neither delete operating files nor act as a general secret scanner.

## Historical scope and cleanup decision

The scoped inventory found the three FX inputs on the public default branch before the source change, and earlier versions of the retired manual-mapping file in the reachable default-branch history. The initial path audit covered six distinct default-branch commits across the four known paths. This is a lower bound. A current-tree deletion keeps old blobs accessible in history, and the deletion diff can still show earlier content. Other branch tips, pull-request refs and cached views, forks, copies, renames, and published build artifacts have not been cleared by this change. Keep any commit/blob inventory private and free of original values.

For an authorized history project, inventory all relevant refs and former or copied paths by blob identity before choosing the cleanup scope. Preserve a restricted recovery copy. Rehearse a path/blob scrub in a disposable isolated copy, test the resulting source and CI, and review the ref changes and active PR impact. Decide separately whether to rewrite public refs and request hosting-side removal of retained PR views or caches. Coordinate collaborator reclones and verify public access to old blobs and reviewed refs after cutover. External copies may remain accessible. No rewrite, force push, deletion of refs, or hosting support request is part of this PR.
