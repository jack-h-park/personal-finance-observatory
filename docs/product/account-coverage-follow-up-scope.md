# Read-only coverage summary and navigation scope

Status: approved source scope after #346, implemented/merged in #347 and separately deployed with bounded [release acceptance](../operations/installation-status.md#coverage-summary-release-acceptance-november-17-2026), without private inventory adoption or completeness acceptance. The November 17, 2026 (America/Los_Angeles) audit remains private. See the [implementation boundary](../architecture/account-coverage-summary.md); fixtures are invented, not private observations.

## Observed problem and outcome

The existing `/data-ops` investment card has correctly labelled freshness counts. Separate bank/CMA rows can still need updates, lack recorded data, lack a confirmed query period or contain historical gaps. `/accounts` correctly leaves inventory completeness unconfirmed and preserves legacy pension policy. These distinctions exist, but a reviewer must scan separate long sections to see which kind of review remains.

Add a concise read-only cross-section summary with direct navigation. A reviewer should be able to find the existing bank/CMA action or inventory-review uncertainty when investment freshness is current. Do not claim the current labelled investment counts are arithmetically wrong or that source freshness proves complete inventory.

## Bounded source changes

- Introduce one pure presentation summary over existing `getAccountCoverage`, `getSupplementaryCoverage` and inventory-review outputs. Preserve the existing classifications and underlying populations; no new persisted file, data source, raw SQL, classifier or adapter is needed. `/data-ops` currently loads only the two freshness adapters, so it may reuse the existing read-only inventory adapter when inventory status is required, or keep that part navigation-only. The pure summary helper performs no I/O; separate adapter observations do not establish an atomic cross-file/DB capture. Add no network request or authority decision.
- Keep investment freshness, supplementary freshness, unknown query periods, recorded history gaps and inventory review as separately labelled signals. The existing adapter can mark a recent source action-needed for a historical gap. The summary retains that action/gap and explicitly marks independent pre-gap freshness unavailable; the detailed date remains available through the link. A single row with two signals is not two accounts; expose overlapping signal counts explicitly instead of adding them into a total.
- On `/data-ops`, add the summary and links to `#account-coverage`, `#supplementary-coverage` and `/accounts#inventory-review`. On the inventory card, retain current links and add a clearly labelled route to bank/CMA/supplementary details. No write, refresh, download, confirmation or collection control is added.
- Use existing source labels, account masking, bilingual copy and read-only component conventions. Keep identity/scope uncertainty visible; do not assign requirement sets to legacy rows or convert observed-only groups into expected accounts.

Implementation files include `components/AccountCoverageSummary.tsx`, `lib/ui-copy/pages/coverageSummary.ts` and a small `lib/application/account-coverage-summary.ts` pure helper and matching test; `app/data-ops/page.tsx`, `components/AccountInventoryReview.tsx`, existing page-copy modules and display tests. Inventory is navigation-only in this implementation; no additional inventory adapter read is added to `/data-ops`. No importer, extractor, mapping, tax module, scheduler or permission code belongs in this PR.

## Synthetic acceptance

| Invented case | Required behavior |
| --- | --- |
| Investment rows current, bank row update-needed | Distinct bank/CMA signal and correct supplementary anchor; no global all-current claim |
| Recent bank data with a recorded older gap | Retain the adapter action-needed override and gap; explicitly mark pre-gap freshness unavailable and link to recorded dates without reconstructing it or duplicating account totals |
| Unknown query interval despite recent transactions | Keep query-period review, without deriving completeness/download need from the last transaction |
| Missing recorded source versus known gap versus stale source | Preserve different categories and existing actions; missing does not prove an account has no real-world data |
| Unreviewed inventory, zero explicit primary metadata, source-only aliases | Keep denominator unknown; zero explicit registration is not zero accounts, and aliases are not silently merged |
| Legacy closed or intentionally unloaded pension | Preserve policy and formal ownership uncertainty; do not create a new source request or revive the account |
| One row appears in several signal groups | Label overlapping signals and scope; no combined unique-account/completeness percentage |

Pure tests and bilingual render checks must verify summary/link behavior, masking, unchanged input objects and no added write controls. Run existing inventory/coverage regressions and repository-required checks. Private observation data, screenshots and exact names must not become fixtures. The later separately authorized deployment/browser verification is recorded in the release acceptance; this original source scope did not authorize it or any future rollout.

## Exclusions and stop conditions

Do not apply the existing private candidate catalog, edit mappings, confirm an owner/lifecycle/scope, collect missing files, refresh generated inputs, repair a read issue, change coverage thresholds or alter the existing reminder/action queue. If a needed distinction cannot be derived from existing outputs, show it as unavailable and bring the contract gap back for review rather than inventing a classification.

The actual 2025 tax comparison remains blocked. The original source PR included no generation, briefing publication, Hometax, deployment, automatic resume or operating change. Its later bounded application rollout is recorded separately and grants no further operating permission.
