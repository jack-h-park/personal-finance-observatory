# Supplementary source freshness and historical-gap contract

Status: capture/reader #350 and consumer #353 are merged and separately deployed through the [isolated November 18 release](../operations/installation-status.md#supplementary-freshness-release-acceptance-november-18-2026). Existing combined decisions and reminders remain unchanged. Actual 2025 comparison, financial-data changes, generation, briefing publication and Hometax remain held.

## Compatibility fields

`SupplementaryCoverageRow` in `lib/adapters/portfolio-db.ts` adds optional `freshnessStatus: AccountCoverageStatus`. Every newly projected row captures the existing local classification in the common push helper, before any historical-gap action override. It uses the already computed value, not a new clock, date interpretation, threshold or classifier. Deposit/CMA, pension, gold and gold-price rows share this capture point; inactive/tokenless pension filtering remains unchanged.

| Field | Meaning and preserved behavior |
| --- | --- |
| `freshnessStatus` | Explicit source state before a historical-gap override: current, due_soon, action_needed, missing or unconfirmed. Optional for older producers; an absent field means unavailable metadata |
| `status` | Existing combined review/action state. Historical gaps can still force action_needed, even for a recent source |
| `historyGap` | Existing recorded uncovered interval; not a freshness or ownership assertion |
| `staleWithHistoryGap` | Existing partial Boolean, unchanged. False is not proof of current or known query coverage |
| `action`, dates, lags and windows | Existing strings/values unchanged, including stale-plus-gap wording and due/missing/unknown behavior |

For example, an invented recent bank statement with an earlier gap can now carry `freshnessStatus: current`, legacy `status: action_needed` and the existing gap interval together. An unknown query end remains `freshnessStatus: unconfirmed` even if valid older periods establish a gap. Source rows with no recorded data retain missing; a due-soon source stays due_soon before the same legacy action override. None establishes complete history, a unique-account count, a confirmed owner or actual reconciliation.

## Canonical read behavior

`readCoverageFreshness(value: unknown)` in `lib/application/coverage-freshness.ts` returns a valid explicit own data field as `AccountCoverageStatus`, otherwise null. It has type-only adapter imports and no I/O. Null means this metadata is unavailable, distinct from a recorded source status of unconfirmed.

The reader accepts no inference from legacy status, dates, lag, gap presence or staleWithHistoryGap. Unknown enum values, malformed/missing fields, inherited values and accessor properties are unavailable; getters are not evaluated. Older objects that only say status=current do not gain a new reviewed freshness fact. The reader does not validate or repair an entire source record, inspect originals or authenticate its provenance.

## Read-only consumer and unchanged transport

The source UI adds `summarizeSupplementaryFreshness(rows)` in `lib/application/coverage-freshness-summary.ts`. It counts explicit reader states, unavailable metadata and recorded gaps independently for bank/CMA and other supplementary rows. It reads no clock or files, performs no status/date fallback, and leaves its input and the existing combined summary projector unchanged. The five source-state counts plus unavailable equal supplied rows; gaps overlap those counts, never a separate account denominator.

`/data-ops` passes the supplementary rows it already loaded to this pure projection. `AccountCoverageSummary` keeps the existing combined-state table and links, adding a separately labelled supplementary freshness table and scope explanation. Investment freshness is not inferred. `SupplementaryCoverageTable`, including its existing `/accounts` use, adds explicit freshness and recorded-gap columns while leaving status, actions, dates, sorting and historical-only closure behavior intact. Missing/invalid metadata says unavailable; an explicit unconfirmed state still says query-period confirmation is required. No recorded gap means only no recorded gap, never full historical coverage. Historical-only rows show dashes in both new columns.

The operating November 18 isolated release includes this consumer and metadata capture on the prior #347 baseline. Its separate freshness-only warning map adapts the older tone module while preserving the operating combined-status styling; that compatibility map is not yet reconciled into main. Bounded bilingual owner-web verification matched the explicit source counts and recorded intervals, retaining pre-release combined counts/actions. This is not complete inventory or owner completeness acceptance; future rollouts remain separately scoped.

The existing briefing summary writer explicitly selects legacy supplementary fields and does not include freshnessStatus. Its projection, masking and version are unchanged. The reminder continues to consume legacy status/action, with byte-identical synthetic text/order and unchanged silence when supplied additive/conflicting freshness metadata. No summary writer, generator, publisher or schedule was run against operating data. This is not a new persisted-file schema, migration, delivery proof or automatic compatibility rollout to external consumers.

## Synthetic verification

Real adapter fixtures cover recent, stale, due-soon and unconfirmed-query gap cases, no-gap and absent-source cases. A contradictory invalid newer query end plus valid older interval exercises the existing unconfirmed-plus-gap behavior without changing the classifier. Tests assert both freshness and exact legacy status/action/gap/Boolean values, unchanged failing-check scope and inactive pension exclusions. Fixture DB/map hashes are unchanged across the read-only projection.

Pure compatibility tests cover all explicit states, older payloads, invalid/inherited/accessor metadata and frozen input preservation. Legacy summary-projector and reminder tests establish that additive metadata cannot change combined counts, filters, ordering or notification text. Consumer tests cover all five explicit detail states, old/invalid metadata, current-plus-gap, due-soon/no-gap, empty groups, frozen inputs, historical-only rows and bilingual read-only rendering. All institutions, labels, dates and metadata are invented; no actual account or filed return is a fixture.

The separately authorized release changed operating source/build; its inspected financial data, original evidence, mappings and then-current access/write settings were preserved. A later shared-gateway access-policy difference is recorded separately in the release observation, not treated as an unchanged fixed-device allowlist. Unresolved decisions remain unresolved. Automatic briefing publication stays paused; actual comparison, generation, briefing web publication, Hometax and further deployment remain held. The contract does not authorize private comparison, backup/restore, cleanup or another rollout. The release and later read-only identity/access observation retain their separate scopes.
