# Proposed next PR: read-only coverage summary and navigation

Status: scope proposal based on the November 17, 2026 (America/Los_Angeles) read-only audit. No feature implementation, operating metadata adoption or deployment is included in the status PR. Actual figures and identifiers remain in private audit artifacts; all future fixtures must be invented.

## Observed problem and outcome

The existing `/data-ops` investment card has correctly labelled freshness counts. Separate bank/CMA rows can still need updates, lack recorded data, lack a confirmed query period or contain historical gaps. `/accounts` correctly leaves inventory completeness unconfirmed and preserves legacy pension policy. These distinctions exist, but a reviewer must scan separate long sections to see which kind of review remains.

Add a concise read-only cross-section summary with direct navigation. A reviewer should be able to find the existing bank/CMA action or inventory-review uncertainty when investment freshness is current. Do not claim the current labelled investment counts are arithmetically wrong or that source freshness proves complete inventory.

## Bounded source changes

- Introduce one pure presentation summary over existing `getAccountCoverage`, `getSupplementaryCoverage` and inventory-review outputs. Preserve the existing classifications and underlying populations; no new persisted file, data source, raw SQL, classifier or adapter is needed. `/data-ops` currently loads only the two freshness adapters, so it may reuse the existing read-only inventory adapter when inventory status is required, or keep that part navigation-only. The pure summary helper performs no I/O; separate adapter observations do not establish an atomic cross-file/DB capture. Add no network request or authority decision.
- Keep investment freshness, supplementary freshness, unknown query periods, recorded history gaps and inventory review as separately labelled signals. A fresh row with a historical gap retains both facts. A single row with two signals is not two accounts; expose overlapping signal counts explicitly instead of adding them into a total.
- On `/data-ops`, add the summary and links to `#account-coverage`, `#supplementary-coverage` and `/accounts#inventory-review`. On the inventory card, retain current links and add a clearly labelled route to bank/CMA/supplementary details. No write, refresh, download, confirmation or collection control is added.
- Use existing source labels, account masking, bilingual copy and read-only component conventions. Keep identity/scope uncertainty visible; do not assign requirement sets to legacy rows or convert observed-only groups into expected accounts.

Likely files: a small `lib/application/account-coverage-summary.ts` pure helper and matching test; `app/data-ops/page.tsx`, `components/AccountInventoryReview.tsx`, existing page-copy modules and display tests. The implementation author should verify current components first and avoid duplicating an existing summary. No importer, extractor, mapping, tax module, scheduler or permission code belongs in this PR.

## Synthetic acceptance

| Invented case | Required behavior |
| --- | --- |
| Investment rows current, bank row update-needed | Distinct bank/CMA signal and correct supplementary anchor; no global all-current claim |
| Recent bank data with a recorded older gap | Freshness remains visible and history-gap signal remains actionable; no duplicate account total |
| Unknown query interval despite recent transactions | Keep query-period review, without deriving completeness/download need from the last transaction |
| Missing recorded source versus known gap versus stale source | Preserve different categories and existing actions; missing does not prove an account has no real-world data |
| Unreviewed inventory, zero explicit primary metadata, source-only aliases | Keep denominator unknown; zero explicit registration is not zero accounts, and aliases are not silently merged |
| Legacy closed or intentionally unloaded pension | Preserve policy and formal ownership uncertainty; do not create a new source request or revive the account |
| One row appears in several signal groups | Label overlapping signals and scope; no combined unique-account/completeness percentage |

Pure tests and bilingual render checks must verify summary/link behavior, masking, unchanged input objects and no added write controls. Run existing inventory/coverage regressions and repository-required checks. Private observation data, screenshots and exact names must not become fixtures. Later deployment/browser acceptance requires separate authorization; this scope does not authorize it.

## Exclusions and stop conditions

Do not apply the existing private candidate catalog, edit mappings, confirm an owner/lifecycle/scope, collect missing files, refresh generated inputs, repair a read issue, change coverage thresholds or alter the existing reminder/action queue. If a needed distinction cannot be derived from existing outputs, show it as unavailable and bring the contract gap back for review rather than inventing a classification.

The actual 2025 tax comparison remains blocked. No actual generation, publication, Hometax, installation/deployment, automatic resume or operating change is part of this proposed PR.
