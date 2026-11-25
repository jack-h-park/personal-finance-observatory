# US and Korea spending pilot

This local pilot imports normalized synthetic CSV and API fixtures, saved
SimpleFIN Chase Checking runs, paired Samsung Card and BankSalad workbooks, and
saved SnapTrade Chase card activity paired with a Chase issuer CSV into SQLite.
The CLI uses workspace-local roots and makes no provider requests. Product scope and
operating targets are documented in the
[spending plan](../superpowers/plans/2026-11-21-us-kr-spending.md).

## Implementation status

Updated November 22, 2026 (America/Los_Angeles).

| Area | Verified scope | Open work |
| --- | --- | --- |
| Local import and ledger | Preview and apply, hash-based archival, row provenance, exact replay, overlapping files, and retention of legitimate repeated purchases. Synthetic checks also covered concurrent apply, settlement and original currencies, and links for payments, transfers, and refunds. The paired workbook and saved API paths record held rows with source row numbers. | Add edited classifications, reviewed merges, and recovery. |
| US checking | Saved SimpleFIN posted rows and an issuer activity CSV agreed in their overlap and reconciled to the saved balance. The CLI reuses the collector's saved-run verifier, maps checked transactions to a reviewed inventory ID, and preserves reviewed classifications. Replay of one run and application of overlapping saved runs preserved totals. | Owner-reviewed adoption in the operating inventory and acceptance of the collection window, product coverage, and reconnect behavior for spending. |
| US cards | An issuer export reconciled to a closing statement and to payment evidence from checking. the reviewed Chase card reconciled 337 SnapTrade card activities against the issuer CSV with a zero signed-amount difference. The saved-input CLI preserved totals on exact replay and a seven-row overlapping import. | Establish SimpleFIN coverage for new the reviewed Chase card card activity. Verify original-purchase evidence for refunds and a foreign-currency sample with the original amount. Other cards require product-specific validation. |
| Korea card and BankSalad | The Korean workbook adapter imports domestic single-payment approvals and linked cancellations. It links unambiguous BankSalad observations and holds ambiguous or shifted dates. A saved issuer/export pair and a reordered overlapping subset were verified in an isolated ledger. Selected statement cycles reconciled to billed principal in a separate evidence review. | A real installment sample, independently downloaded overlapping exports, and explicit review of card identity and unresolved observations. The issuer's approval date is available for the observed cancellations. The separate cancellation processing date is unresolved. |
| Operating integration | The owner has a local archive convention under `FINANCE_RECORDS_DIR/spending/`, with separate statement, activity, and card-only export folders. Pilot ledgers and detailed receipts remain private. Local spending panels appear in `/accounts` and `/data-ops` when the development ledger is configured. | Production ledger adoption and scheduled collection for spending. |
| Combined isolated ledger | 955 unique USD and KRW transactions, including two BofA purchases, 29 balanced payment pairs, and unchanged Korean billing evidence. A review linked 93 Samsung BankSalad observations through one-to-one legal-name normalization without changing spending. | A follow-up merchant alias review linked 68 more observations to existing purchases. It left 62 Samsung observations and two Robinhood credits held. Transaction counts, native currency totals and billing evidence were unchanged on replay. |

Use the issuer activity export to record spending and link cancellations.
Use billing statements when reconciling an amount due, a card payment, or a
specific coverage gap. A statement's informational cancellation table is
evidence of cancellation. Establish its effect on a bill from the charged
line items and total, or an explicit billing-cycle field. A cancellation may
already appear in activity, so supplemental statement notices must not
create a second refund. Selected matched statements close the pilot checks
for those cycles. Routine statement collection is optional for tracking spend.

## Open the local spending view

In a development checkout without operating environment values, set
`SPENDING_PILOT_DB` to the absolute path to the combined ledger under
`state/spending.sqlite`. Keep its sibling `records/` directory beside
`state/` so the page can verify archived review evidence. Run the development
server on loopback.

```sh
FINANCE_MODE=sample SPENDING_PILOT_DB="$pilot_ledger" \
  pnpm exec next dev --hostname 127.0.0.1 --port 3391
```

Open `http://127.0.0.1:3391/spending`, or use Spending in Assets & Cash Flow.
For the accompanying `/accounts` and `/data-ops` views, seed the sample
portfolio database in the same checkout with `pnpm seed:sample` if needed.
The spending coverage and review panels link to the selected account.
The development database opens read-only. If available, set `SPENDING_PILOT_BANKSALAD_OBSERVATIONS` to the
absolute path to the normalized BankSalad `observation.json` beside its
manifest. The page verifies the observation hash and matches the workbook
hash to the ledger before using observation dates and amounts. Held rows
without linked dates remain visible across month filters. Optional private account
labels and coverage notes can be stored in `account-labels.json` beside
`state/`. The file maps language keys (`en` and `ko`) to account IDs with
`label` and optional `note` fields. Ledger IDs are displayed by default.

Purchase totals use transaction dates when available. Refunds use posted
dates. Payments and transfers appear as transactions and are excluded from
spending. Account coverage shows the first and last available posted dates
without assuming continuity. A held observation may be a source row pending
an issuer match, so it does not increase ledger spending.

Choose 12 or 24 calendar months, including the current partial month. The
summary leads with the combined KRW equivalent and shows USD and KRW native
totals as a breakdown. A single signed monthly trend and the category, merchant
and purchase rankings use the same KRW basis. The monthly table and transaction
details retain original settlement amounts. Category and
merchant rankings open a filtered transaction list. Individual purchases open
the exact transaction while retaining the selected account and analysis period.
Data review contains account coverage, held observations, and evidence guidance.

The optional private `category-hints.json` beside `state/` accepts version 1.
Its `usdIssuer` object maps canonical transaction IDs to category labels
previously matched to issuer CSV rows. Its `usdNotion` object maps normalized
merchant descriptions to reviewed category labels. Keys use Unicode NFKC, lower
case, and collapsed whitespace. Optional `merchantAliases` uses the same keys
for reviewed display labels and merchant grouping. Issuer labels take precedence. For the pilot,
issuer transaction matches used reviewed account identity, both dates, signed
cents, and description. Notion references used consistent labels with a
confirmed observation or repeated dates, excluding duplicate-marked rows.
The local page reads this file only for labels. The BankSalad observation file
supplies Korean labels through ledger links whose date and amount agree.
Keep the source exports and category mappings private.

The combined view looks up the transaction posting day's USD-to-KRW exchange
rate in the existing `historical_fx_rates` table. When the day has no quote, it
uses the most recent quote within the preceding seven calendar days. It rounds
each signed conversion to won before summing. Unpriced rows retain their native
amounts and are identified as omitted from the KRW equivalent. Development can
use an explicit rate database via `SPENDING_PILOT_FX_DB`. Sample finance data is
never used to price the private spending ledger.

### Review bank debits with an unclear purpose

Use the posted bank record to establish the debit and its source account.
Review the payment detail, a receipt, or the owner's confirmation to
establish whether the debit represents a purchase, a reimbursement, a
balance top-up, or a transfer. A wallet name, a generic transfer type, or
an amount similar to a previous expense is insufficient to establish the
purpose. A confirmed purchase can enter spending with no category when the
item details are unavailable. Preserve any explicit owner classification
with its evidence and date.

Deduplicate repeated observations of the same posting to the same account.
Use a stable reference where available. For overlapping bank exports, use
the account, compatible timestamps, amount, description, and adjacent
running balances. Keep distinct account postings even when they relate to
one payment. Link those postings as counterparts only when the evidence
establishes that relationship.

Keep unresolved cases in the private review record with the posting date,
signed amount, bank description, and evidence needed to resolve the case.
Keep personal transaction details and raw source files outside the code
repository. Verify monthly deltas and exact replay before publishing any
approved batch.

### Publish a read-only snapshot

Production enables the route, navigation and panels in private finance mode
when `FINANCE_STATE_DIR/spending-readonly/snapshot.json` is present. Use the
existing owner-only HTTPS gateway and keep the app listener on loopback. A
development ledger flag cannot enable a production route.

Build a projection from the reviewed isolated ledger using
`pnpm exec tsx scripts/export-spending-view.ts` with the absolute ledger path,
publication date and optional absolute BankSalad observation path. Redirect
stdout to a private file. Compare transaction counts, totals and hold counts
with the source ledger before publishing it. Stage the file with owner-only
permissions. If the scheduled review runner is installed, publish manual
batches through the same guarded receiver while the runner is paused. Adopt
the manually updated ledger and matching snapshot as the new local baseline
before resuming the runner. All operating writers must use the receiver lock.
The app
serves only the projected fields and displays the publication date. Raw
evidence, SQLite and ingestion configuration stay at their existing locations.

## Import saved SnapTrade Chase card activity

Prepare a private workspace, its confirmed primary account inventory, and a
binding with `accountId`, `providerAccountId`, and `maskedSuffix`. The Chase CSV
carries no account identifier, so confirm at download that it belongs to that
card. The saved SnapTrade JSON contains `fetchedAt`, `account` with `id`,
`maskedSuffix`, `product`, and `rawType: "CREDITCARD"`, the complete `data` array
from the activities endpoint, and `pagination` with `offset: 0`, `limit`, and
`total`. A truncated page fails validation. Keep the saved response and CSV
private. The importer reads only these saved files and the local account metadata.

```sh
pnpm spending:import --workspace "$pilot_dir" --accounts "$inventory" \
  --binding "$binding" --input "$snaptrade_snapshot" --chase-csv "$issuer_csv"
```

Review projected totals, `held` rows, and `fallbackMatches` without matching
descriptions. Row numbers are one-based data records
in the indicated source, excluding the Chase CSV header. The importer compares
the SnapTrade settlement date and signed USD amount to the issuer posting date
and signed amount. It prefers description matches, uses purchase dates to
disambiguate repeated purchases, and accepts a date-and-amount fallback only
when exactly one unmatched row remains on each side. The issuer type supplies
classification. Merchant returns offset purchases. Card payments, fees, and
recognized statement credits and balance payouts remain visible outside net
spending. Unmatched rows, ambiguous matches, unfamiliar classifications, and
conflicting existing records stay on hold. Refund and payment counterpart
links require separate evidence.

Apply the reviewed matches by repeating the same command with
`--apply --review-token TOKEN`. The archive retains exact input bytes, their
hashes, and cross-source row references. The workspace-local SQLite ledger
uses stable SnapTrade activity IDs for overlap. A new ID that resembles an
existing transaction is held for review. Retain held evidence for subsequent
review with corrected or more complete source files.

### Monthly SimpleFIN coverage check

SimpleFIN Bridge remains the primary source for US bank and card transactions.
SnapTrade serves primarily as a brokerage connector. Its saved card data is a
the reviewed Chase card fallback for the verified SimpleFIN historical coverage gap.

During the pilot, check that card approximately once a month in the existing Bridge
connection. Use an account-scoped read for the preceding completed month and
compare posted dates, signed amounts, and row counts against the Chase issuer
CSV for the same window. Record the coverage dates, missing or unmatched rows,
and any provider warning in the private pilot evidence. Include purchases,
refunds, and card payments when present. Record a zero-activity month as
inconclusive for transaction coverage. Keep this as a read-only check until
the card has matched issuer activity and any cross-source overlap has been
reviewed before switching the ledger source.

## Import a saved SimpleFIN Chase Checking run

Use an existing private workspace, a built and trusted `finance-connectors`
checkout, its non-secret Chase Checking selection config, and a
`banking/1.0` latest-good JSON pointer. The importer calls the collector's
read-only `readBankRun` to validate the pinned run, checksums, and source
provenance. Neither a collection command nor a credential file is needed.
Pin a copy of the pointer when the collector may publish a new run during
review. Keep both the pointer and the producer's immutable records.

Prepare a private inventory file with a unique primary account ID and
confirmed owner. The private binding names that ID and the two identities
from the already-reviewed Chase selection config.

```json
{
  "accountId": "example-checking",
  "providerAccountId": "example-provider-account-id",
  "connectionId": "example-connection-id"
}
```

```sh
pnpm spending:import --workspace "$pilot_dir" --accounts "$inventory" \
  --binding "$binding" --input "$pinned_pointer" \
  --simplefin-config "$chase_checking_config" --connector-repo "$connector_repo"
```

Preview without decisions to list held posted rows and their fingerprints.
Use the original normalized transaction table to inspect the one-based row
numbers. A private decisions file has `schemaVersion: 1` and a `decisions`
array. Copy a row's `fingerprint` fields (`sourceId`, `postedDate`,
`amountMinor`, and `descriptionSha256`), add a reviewed `kind` and a
nonempty `basis` describing its evidence. For payments and own transfers,
an optional `transferRef` can retain a counterpart reference.

For a cross-source duplicate, preview with the classification decisions
first. A held row may show `linkCandidateId` when the posting has one
matching ledger entry. Check the account, posting date, currency, signed
amount, bank description, and classification against the saved source.
Add `linkToTransactionId` to the decision only when those checks confirm
the same posting. This attaches an observation to the existing transaction
and retains its original source and classification. A one-to-one provider
ID binding is stored with the link. Competing postings, conflicting
classifications, changed provider records and attempts to remap the binding
remain held. Later saves still require a valid reviewed fingerprint.

Run preview with `--decisions "$decisions"` and review the projected totals,
excluded count, held rows, and `pendingIgnored`. Repeat with the same inputs
plus `--apply --review-token TOKEN`. The ledger is under
`private-data/personal-finance-offline/state/` within the workspace. The
archived artifact includes the validated run, original provenance pointers,
manifest hash, and relevant decisions. Preview output and archived data may
contain private account and transaction references.

The importer groups checking transactions by their New York posted date and
keys them by account and provider transaction ID. Confirmed payments,
own-account transfers, and deposits remain outside net spending. An
unreviewed row, a mismatch with the decision fingerprint, or a change to an
accepted transaction is held. Pending rows remain out of the ledger.
An overlapping run can add evidence to a known transaction. Missing rows in
a later export never remove retained history.

## Schedule reviewed SimpleFIN spending refresh

The review runner consumes saved SimpleFIN pointers for Chase Checking and
the approved Amex and Amazon cards. It pins each run, previews it through the
standard importer, and
writes a private preview in `runs/<run-id>/preview.json`. It does not call
the provider. Install the spending-review launch agent on the operating Mac Studio
(`ops-host`) under the existing runtime account. The timer checks for a new
daily run. Keep the collector, raw run archive, review state, and publisher
on that host. Invoke the local receiver directly there. The reviewed spending
pipeline must work with the MacBook offline.

Keep the runner configuration and state outside Git. The configuration
uses absolute paths for `pointer`, `accounts`, `binding`, `simplefinConfig`,
`connectorRepo`, `checkout`, `node`, and `tsx`. `publishCommand` is an
argument array invoking the receiving script on the operating host. The receiver's
last argument is the expected previous operating snapshot hash.
Initialize `runs/seed/snapshot.json` and
`runs/seed/private-data/personal-finance-offline/state/spending.sqlite`
from the same accepted state, copy its records and label files alongside
the ledger's state directory, and set `current.json` to `{"run":"seed"}`.
The active run selected by `current.json` owns the current ledger and
snapshot. Retain earlier run directories and their receipts for provenance.

Put reviewed importer decisions in `runs/<run-id>/decisions.json` and
refresh the preview with `python3 scripts/spending-daily.py tick CONFIG`.
Check the proposed changes and record the exact approval with
`python3 scripts/spending-daily.py approve CONFIG RUN_ID REVIEW_TOKEN`.
The next tick applies that approval only when the recomputed preview
matches the token and has no issues or holds. Pending provider rows remain
outside the applied batch. A stale or incomplete approval leaves the run
available for review and does not change the operating view.

On the serving host, invoke
`python3 scripts/spending-daily.py receive SNAPSHOT OWNER_HTTPS_URL PREVIOUS_SHA`
with the candidate snapshot on standard input. The receiver checks the
previous hash and atomically replaces the snapshot. The live check loads
the transaction detail for each new posting. A durable receiver backup
allows a failed check or interrupted recovery to restore the prior bytes. If an approved run publishes evidence only, the
receiver verifies the existing snapshot without rewriting it. If an
interrupted run may have published, the next tick retries the prepared
candidate before adopting the new local ledger. An unexpected operating
snapshot hash requires reconciling the competing publication first.

### Collect and review the Amex and Amazon cards

Install the card collector launch agent on the collector host with the
merged finance-connectors CLI and a separate mode-0600 SimpleFIN batch config.
The operating selection includes Chase Checking and two USD cards. The cards
use the existing grant and the verified `americanexpress.com` and
`amazon.syf.com` institution domains. The operating collection schedule is
10:05 Pacific local time and the review timer checks every 30 minutes.
The collector stores immutable runs and updates each account's latest-good
pointer. Actual provider history can be shorter than the requested window.

For multiple accounts, put source-specific paths under `sources`, keyed by
the connector's connection key. Each entry supplies `pointer`, `binding`,
and `simplefinConfig`, with optional localized `accountLabels` and
`carryDecisions`. Keep the inventory and publisher shared. Use bindings with
`accountKind: "credit_card"` for cards. Existing checking bindings retain
their prior shape and New York posting-day convention. Card runs use the UTC
posted day supplied by the connector. The ledger permits one approved mapping
per canonical account and provider identity.

Enable `carryDecisions` to seed a new preview from the last applied run of
the same connection. The runner verifies its archived evidence hash before
writing `carried-decisions.json`. To edit the carried set, copy that file
to `decisions.json` and add reviewed decisions for new transactions. A previously reviewed row must still match its signed
amount, posted date, source ID, and original description hash. Review new
purchases and merchant refunds, and record repayments as card payments and
explicit card benefits as other. Pending rows and unreviewed credits are
excluded from publication. Same-day, same-amount card purchases with
different provider IDs remain distinct. Each batch needs its own exact
approval, including an overlap-only batch.

Issuer files can supplement unavailable history or resolve an exceptional
item. The daily review uses the stored SimpleFIN run and does not require a
monthly issuer statement.

## Run the Korean workbook importer

Use a dedicated, existing private workspace outside Git. Set up the pinned
extractor Python environment with `make python-env`. The CLI uses the project
virtual environment when present. `STOCK_PYTHON_BIN` can select a local
interpreter with `openpyxl`.

Prepare a private account inventory file with a valid primary account ID and
confirmed owner. Prepare a separate private binding for that one card.
`samsungCardNumber` must equal the masked value in the Samsung workbook.
`bankSaladPaymentMethod` must equal the exact label in the BankSalad workbook.
A workspace keeps one reviewed binding. Use a separate workspace for another
binding.

```json
{
  "accountId": "sample-card",
  "samsungCardNumber": "0000-****-****-1234",
  "bankSaladPaymentMethod": "Example Samsung Card"
}
```

```sh
pnpm spending:import --workspace "$pilot_dir" --accounts "$inventory" \
  --binding "$binding" --input "$samsung_xlsx" --banksalad "$banksalad_xlsx" \
  --from "$banksalad_period_start" --to "$banksalad_period_end"
```

The dates are the declared inclusive BankSalad export window (YYYY-MM-DD).
The Samsung workbook declares its own window. Review projected totals,
`evidenceLinked`, and `held` (workbook, Excel row, reason). Repeat with the
same inputs plus `--apply --review-token TOKEN` to apply exactly that preview.
Held rows stay outside spending. Apply archives both workbooks by SHA-256 and
records the held rows and accepted evidence in the same SQLite transaction.
The ledger is at `private-data/personal-finance-offline/state/spending.sqlite`
within the workspace. Use a fresh preview after any intervening apply.

Only the Samsung export contributes transaction amounts. Purchases key on card,
approval date, and approval number. A cancellation must match one original
approval, and repeated or conflicting cancellation histories are held. The
approval date also serves as the ledger date until independent posting or
cancellation dates are available. The original workbooks retain the issuer's
other fields. BankSalad links require a one-to-one match on date, signed amount,
and normalized merchant across the retained ledger and the submitted rows.
When only a leading or trailing company marker differs, a debit can link if
both sources have exactly one matching date and signed amount and the remaining
merchant names agree. The retained ledger must also have a single candidate.
Unknown matches, conflicting identifiers, and installments remain in the
review records. This path does not import issuer statements or authenticate to
either service.

## Existing foundations

| Foundation | Reuse and boundary |
| --- | --- |
| [Account inventory](../architecture/account-inventory-foundation.md) | Reuse validated, unique primary `inventory.accountId` values with explicit owner metadata. Existing bank aliases and statement evidence help review provider-to-inventory mappings. Legacy registrations and new cards without a primary ID need owner-reviewed metadata before a live pilot. Account label, masked suffix, and default owner cannot establish identity. |
| [Finance connector exports](finance-connectors.md) | Keep credential handling and polling in the producer. Its separate `contracts/banking/v1/run.schema.json` and SimpleFIN bank pilot already separate posted/pending and retain run hashes, raw JSON pointers, revisions, account references and last-good/status. Start the US bank-side pilot from that contract. Bank v1 is USD-only and does not establish card coverage. The producer currently describes a 45-day initial and 14-day repeat window, including an observed warning on larger requests. The spending plan's 30-day overlap is a future collector adjustment. SnapTrade/Fidelity position exports remain independent. |
| [Records and state roots](../architecture/private-storage.md) | Use the existing resolver. The sample stores original normalized input bytes under `records/spending/` by hash, and the dedicated `spending.sqlite` under `state/`. A future reviewed private adapter can use the corresponding `FINANCE_RECORDS_DIR` and `FINANCE_STATE_DIR` boundaries. The portfolio refresh has no dependency on this ledger. |
| [Bank statement extractors](../../scripts/extract-bank-statements.py) and [period evidence](../architecture/statement-period-provenance.md) | Chase and BofA CSVs and Amex Checking PDFs supply dated cash rows and balances, and Korean bank parsers supply account-specific statement evidence. Reuse those readers after checking the relevant product and retaining row provenance, exact decimals and original type fields. Asset-oriented output and balance rows alone cannot distinguish purchases, refunds, card payments and remittances. A totals-only PDF supplies reconciliation evidence. |
| [Actual Budget](https://actualbudget.org/docs/api/) | First comparison for file import, transaction matching and classification rules. Firefly III remains a separate-budget option, and Sure a transaction UI reference. The pilot has no dependency on those apps. |

## Run the synthetic examples

From the repository root, use a dedicated existing absolute scratch directory.
The command reads its explicit inputs and does not load `.env.local`.

```sh
pnpm spending:import --workspace "$pilot_dir" --accounts examples/spending/accounts.json \
  --input examples/spending/first.csv --source synthetic-file --from 2026-10-01 --to 2026-11-10
```

Repeat with `--apply --review-token TOKEN`, using the token printed by preview.
It binds the input bytes, batch metadata, inventory bytes, ledger path and
applied batch count. An intervening apply requires a fresh preview. Exact batch
replay reports `already_applied`. Preview includes projected ledger totals by
month and currency when the batch can be applied, and current totals if it is
held. Issue row numbers count data records from one, excluding the CSV header.

Use `overlap.csv --source synthetic-file --from 2026-11-01 --to 2026-11-30` to
exercise another file from the same stream. November remains USD 24.00 and
KRW 15,000 net. The JSON fixture `api.json` carries its own source and period;
omit the CSV flags. Applying it adds USD 7.00 to November. Its envelope
illustrates the Observatory side of a producer adapter.

## Normalized input contract

- JSON version 1 supplies `schemaVersion`, `mode: synthetic`, `status: complete`,
  `source`, `periodStart`, `periodEnd` and `transactions`. CSV supplies the same
  rows with source and inclusive posted dates passed as flags. A source names a
  stable export stream and its transaction ID namespace across delivery windows.
- A row requires `accountId`, `postedDate`, `description`, `amountMinor`,
  `currency` and `kind`. Dates are YYYY-MM-DD. Amounts are signed integers in USD
  cents or KRW won; money flowing out is negative. Kinds are `purchase`, `refund`,
  `card_payment`, `own_transfer`, `fee` and `other`. Only reviewed, posted rows
  belong in this contract. The input contract selects types explicitly.
- Optional columns are `transactionDate`, `sourceId`, the paired
  `originalAmountMinor` and `originalCurrency`, `relatedSourceId` for refunds,
  and a shared `transferRef` for reviewed payment/transfer legs within a source.
  An unresolved refund target stays queryable in `spending_refund_link`. Purchases
  use the transaction month when supplied; refunds use the posted month. Only
  purchases and refunds affect net spending. Original amounts and fees remain
  queryable in the ledger.
- The same source/account/stable ID matches exactly. Without an ID, identical
  rows in one batch receive distinct occurrence ordinals. Overlapping exports
  from the same stream match those ordinals, retaining the largest observed
  count and never deleting omitted transactions. This assumes complete, consistent
  posted-day exports from that stream. Changed descriptions or dates on rows
  without stable IDs can require manual reconciliation.
- A changed stable ID payload, repeated stable ID within a batch, or a collision
  on settlement account, posted date, currency and signed amount across sources
  or ID modes holds the batch for review. The pilot does not resolve candidates
  automatically, and shifted posted dates require external reconciliation.
  Raw bytes and batch/row references connect each accepted observation to its
  ledger transaction, even across overlapping imports.
- Apply commits ledger rows and provenance in one transaction after writing the
  content-addressed input. An interrupted apply can leave reusable archived bytes
  without a committed batch. A missing feed does not certify zero spending.
  Operator classification history, reviewed merge/rollback, live coverage and
  reconciliation receipts belong to the private adapter phase.

## Inputs for expanding the pilot

Reuse the verified samples when developing the offline adapters. The inputs
below are for expanding account coverage or checking a case that remains open.

| Source | Sample and fields to confirm |
| --- | --- |
| US cards | Select the two or three highest-spend cards, starting with the relevant Chase, BofA, and Amex Gold products. For each, compare a redacted SimpleFIN discovery and posted/pending export to the issuer activity file and one closing statement. Verify account/connection identity, USD, transaction ID stability, posted versus purchase date and timezone, sign, merchant, credit/payment classification, overseas original amount/currency, and actual earliest available date. Include a refund, card payment, and repeat same-amount purchase. |
| US payment account | Prefer Chase Checking if it pays the chosen cards. Otherwise use the relevant BofA or Amex Checking and confirm that specific product. Obtain matching dates from the account activity export and its statement. Include both legs of a card payment and a self-transfer where available. Compare actual availability against the collector's banking contract. Compare Plaid only if a material account remains missing. |
| Korea BankSalad | Provide a redacted initial export covering up to 12 months and a second export with two completed overlapping months. Preserve headers, sheet names, original cell types, date precision, row order and repeated transactions. Confirm transaction/posting date, merchant, category, payment instrument and stable masked identifier, signed amount and currency, approval/reference IDs, original currency/amount, cancel/refund links, installment count/sequence and purchase-versus-billing values. Include easy-pay duplicates and inter-account transfers when possible. |
| KR/US issuer files and statements | Provide a Korean representative card's approval/activity export and a matched billing cycle with an installment and cancellation. For unsupported accounts or history, prefer CSV, XLSX, OFX or QFX with a stable transaction ID. Capture declared period and opening/closing totals separately. A PDF with monthly totals and no transaction rows can validate totals only. |

Retain mappings and originals privately. Verify exact account and currency
bindings, date-window coverage, product support, and statement-cycle differences
before a live adapter is accepted. The public examples exercise synthetic
import behavior. The archived real-source results apply to the accounts and
periods checked in the isolated pilot.
