# Explicit-file annual federal comparison CLI

Status: implemented source command with synthetic validation; no private execution, installation or deployment acceptance.

## Invocation contract

`pnpm --silent tax:annual:compare` calls the unchanged [read-only adapter](annual-comparison-adapter.md). Unlike the component preview, it reads explicitly selected history and related evidence and returns a reviewed annual liability comparison. It supports the adapter's existing 2025 federal Single/MFJ scope; no tax method or history schema changes.

Every invocation requires `--input`, `--history`, `--review`, `--records-root`, exactly one of `--tax-root` or `--no-tax-root`, and the external pins `--review-id`, `--review-revision`, `--review-sha256`. File/root paths must be normalized absolute paths. A null tax root is explicit, never inferred. All flags are unique; unknown/positional flags and mixed help are rejected before data access. Revisions are canonical positive safe integers; SHA256 pins are lowercase hexadecimal.

The review pin is the adapter's canonical whole-bundle digest, not the raw JSON file hash. Supply a separately accepted ID/revision/digest; the CLI never derives or refreshes approval from the selected file. Formatting differences do not change canonical identity, while content changes require an accepted new pin. File equality does not authenticate a reviewer or establish tax correctness.

```sh
pnpm --silent tax:annual:compare \
  --input /absolute/synthetic/input.json \
  --history /absolute/synthetic/history.json \
  --review /absolute/synthetic/review.json \
  --records-root /absolute/synthetic/records \
  --tax-root /absolute/synthetic/tax \
  --review-id synthetic-review --review-revision 1 \
  --review-sha256 <externally-accepted-canonical-bundle-digest>
```

This is a schematic invocation, not a runnable fixture or permission to select private operating files. The review bundle and numerical approval requirements remain defined by the adapter and [composition contract](annual-composition-contract.md). Missing settlement proof is separate from the selected liability comparison.

## Output and exits

| Exit | Stdout | Meaning |
| --- | --- | --- |
| 0 | Unchanged adapter JSON | Compared and eligible; bounded version/evidence observation only |
| 1 | Unchanged adapter JSON | Blocked, including unavailable/malformed selected sources; difference remains null |
| 2 | Empty | Invalid invocation or unexpected internal exception; generic stderr only |
| 0 with sole `--help` | Usage text | No data files opened |

Treat stdout as potentially private review/calculation metadata. The command never writes a report or receipt; any caller redirection is a separate deliberate write. It has no output/apply/force/latest mode, environment/config loading, default root discovery or writer. Environment write opt-ins cannot enable mutation. Its exit-1 policy differs intentionally from the component-only preview's valid-blocked exit 0.

Success retains both the adapter's `selected-history-evidence-and-review-pins-checked` boundary and nested `supplied-metadata-only` calculation. It does not establish the sole operating authority, legal tax treatment, authenticated approval, filing readiness, complete evidence or payment/refund settlement. Reobserve current versions when used; no atomic cross-file snapshot is promised.

## Validation and adoption boundary

Subprocess tests use only invented disposable files, a different working directory, paths with spaces, explicit pins, changed/missing/oversized/linked sources and independently expected arithmetic. Proven filesystem observers detect default/ambient reads and writes, including under writable environment flags. Help/invalid calls are checked before explicit-source I/O. The broader adapter/domain regression suite remains authoritative for selection, evidence budgets and observation stability.

No operating review file/path is adopted and no actual financial CLI execution occurs in this increment. Private authority/path binding, logical review ownership and any owner-reviewed private preview require separate scope. No web route, scheduler, importer, generator or publisher is connected. Actual records, originals, account mappings, access restrictions and disabled web writes remain unchanged; automatic publication stays paused, and generation, web publication, Hometax and deployment stay held.
