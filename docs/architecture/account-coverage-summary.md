# Read-only account coverage summary and section navigation

Status: implemented source with synthetic validation; no deployment, operating metadata adoption or new private browser acceptance. Implements the [approved scope](../product/account-coverage-follow-up-scope.md) after merged #346.

## Pure presentation contract

`lib/application/account-coverage-summary.ts` exports `summarizeAccountCoverage({ investmentRows, supplementaryRows })`. Inputs are readonly structural projections of existing adapter rows: status, supplementary kind and optional recorded historyGap. Adapter types are imported with `import type` only. The function has no filesystem/database/config/clock/network dependency, validation fallback, identity joining or mutation.

It returns investment, bank/CMA and other supplementary groups. Each has the supplied row count, five existing review-state buckets and an independent count of rows carrying historyGap. Banks/CMA are existing deposit/cma kinds; the other group includes pension, gold and gold-price rows. No configured row becomes an expected account, confirmed owner, closed account, inferred zero or newly required source. Empty groups mean no configured rows in this input, not a reviewed empty economic inventory.

Status classification remains entirely with existing adapters. In particular, a recent date never clears an unknown query period, and the helper never changes a supplied review status. The existing bank adapter overwrites a history-gap row with action_needed; its original independent freshness status is not preserved. The summary labels that limitation and links to recorded dates rather than reconstructing current/due-soon from a date or the partial staleWithHistoryGap flag. Overlapping gap/status signals are not summed into a unique-account total. The summary intentionally has no combined completeness metric or global all-current result. It does not expose dates, labels, paths, financial amounts or raw action strings.

## Surface and navigation

The bilingual server component `AccountCoverageSummary` appears before the existing `/data-ops` update sections. It counts the already loaded `getAccountCoverage().rows` and `getSupplementaryCoverage().rows`; there is no additional inventory adapter query, new cache or backend endpoint. It presents groups and status counts separately with an explicit overlap/scope notice. Existing detailed tables, thresholds, reminder/action queue and confirmation controls are unchanged.

Group links target existing `#account-coverage` and `#supplementary-coverage` sections. A separate `/accounts#inventory-review` link explains that inventory scope/ownership requires its own review; it does not load or assert an inventory-review state. `AccountInventoryReview` retains source/investment links and adds a labelled bank/CMA/supplementary link. Existing unknown-owner and pension-policy rendering is unchanged. This source-only work neither repairs private metadata nor establishes an atomic cross-file/DB observation.

## Synthetic proof and preserved boundaries

Tests cover current investments alongside bank action/missing/unknown states, real adapter-shaped action-needed gap overrides for recent and older sources, with pre-gap freshness explicitly unavailable, empty groups, repeated source labels, frozen input preservation and both-language rendering. Render checks assert the scoped anchors, no raw identifiers/actions or new write controls, and unchanged unknown inventory/closed/non-loaded pension policy. The fixture values and labels are invented.

Existing inventory/coverage regressions and repository-required checks remain separate proof. A production build or synthetic browser is not deployment, actual account review or complete reconciliation. Any later rollout requires separate authorization and preservation checks. Actual financial records, original evidence, mappings, owner-device access and disabled web editing remain untouched; unresolved ownership/lifecycle/scope and curator decisions remain unresolved. Actual 2025 tax comparison stays blocked. Automatic briefing publication remains paused; actual generation/archive writes, web publication, Hometax and deployment remain held.
