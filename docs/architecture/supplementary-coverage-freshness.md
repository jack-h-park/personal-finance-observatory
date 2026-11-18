# Supplementary source freshness and historical-gap contract

Status: additive source contract implemented with synthetic validation; not installed or deployed. Actual 2025 tax comparison, financial-data changes, generation, briefing publication and Hometax remain held. The existing [#347 summary](account-coverage-summary.md) and its isolated deployed release retain their prior behavior.

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

## Consumers and transport remain unchanged

This PR adds no UI consumer. The #347 projector/component still count and display the existing combined status and gap signals, with the pre-gap-unavailable explanation on that surface. Their output/rendering remains equal when additive metadata is present; any independent freshness display requires a separate reviewed source change.

The existing briefing summary writer explicitly selects legacy supplementary fields and does not include freshnessStatus. Its projection, masking and version are unchanged. The reminder continues to consume legacy status/action, with byte-identical synthetic text/order and unchanged silence when supplied additive/conflicting freshness metadata. No summary writer, generator, publisher or schedule was run against operating data. This is not a new persisted-file schema, migration, delivery proof or automatic compatibility rollout to external consumers.

## Synthetic verification

Real adapter fixtures cover recent, stale, due-soon and unconfirmed-query gap cases, no-gap and absent-source cases. A contradictory invalid newer query end plus valid older interval exercises the existing unconfirmed-plus-gap behavior without changing the classifier. Tests assert both freshness and exact legacy status/action/gap/Boolean values, unchanged failing-check scope and inactive pension exclusions. Fixture DB/map hashes are unchanged across the read-only projection.

Pure compatibility tests cover all explicit states, older payloads, invalid/inherited/accessor metadata and frozen input preservation. Existing summary/render and reminder tests establish that additive metadata cannot change current displays, filters, ordering or notification text. All institutions, labels, dates and metadata are invented; no actual account or filed return is a fixture.

Operating source/build, financial data, original evidence, mappings, access and disabled web editing remain untouched. Unresolved decisions remain unresolved. Automatic briefing publication stays paused; actual comparison, generation, briefing web publication, Hometax and further deployment remain held. No private runtime replay, installation, backup/restore or cleanup is part of this source contract.
