# US and Korea spending integration

November 21, 2026 (America/Los_Angeles). Scope is the owner-operated Personal Finance Observatory.

## Implementation status

The local CLI supports preview, review-token application, and replay for synthetic inputs, paired Samsung Card and BankSalad workbooks, saved SimpleFIN bank runs, and saved SnapTrade card activity paired with Chase issuer CSVs. SimpleFIN Bridge remains primary for US banks and cards. SnapTrade remains primarily a brokerage connector and serves as a card fallback where the verified provider feed lacks coverage. The [pilot guide](../../operations/spending-pilot.md) records input contracts, test results, and a roughly monthly read-only SimpleFIN coverage check. Scheduled collection and reuse of private operating inventory require separate authorization.

The combined local ledger holds separate USD and KRW records, two-sided card payments, Korean billing and evidence, and reviewed records from the US and Korean pilots. The read-only, development-only `/spending` view provides month and account filters, native currency totals, coverage and holds. `/accounts` and `/data-ops` link to the same account filters. Filtering, pagination, and responsive navigation were verified locally. Private figures, account mappings and prior versions stay in the local pilot.

The Samsung evidence review first linked unique date and signed amount matches with an equivalent corporate name. A second review linked a further 68 of 130 held observations to existing purchases using manually checked merchant label pairs and unique same-date, same-signed-amount evidence in both exports and the ledger. The 62 remaining holds include missing or competing candidates and unconfirmed merchant identity. The same review checked the contained overlap separately. Transaction rows, USD and KRW totals, payment links, and billing records were unchanged on application and replay.

For additional feeds, verify the account, posted status, currency and sign, identity on replay, and payment exclusions. Import clearly classified rows and hold individual unresolved cases. Display known coverage gaps. Request an issuer file for a specific gap, payment, installment or disputed amount. Keep the unclassified Robinhood credits held pending evidence. Continue the usual BankSalad cadence with the two most recent completed months.

## Source and collection choices

| Source | Plan |
| --- | --- |
| SimpleFIN Bridge | Pass daily US collection through the existing finance-connectors boundary. Re-read the latest 30 days. Start with two or three high-spend cards and a payment account. Determine initial history, product coverage, and reconnect behavior from actual account observations. [Pricing](https://beta-bridge.simplefin.org/) · [Developer guide](https://beta-bridge.simplefin.org/info/developers) |
| Plaid Transactions | Compare if a material account remains missing. Validate institution and project eligibility before a live test. [Trial conditions](https://support.plaid.com/hc/en-us/articles/16194695660311-Can-I-use-Plaid-for-free) |
| Teller or Lunch Flow | Compare as alternatives where they offer stable transaction history for a material uncovered account. [Teller](https://teller.io/) · [Lunch Flow personal API](https://www.lunchflow.app/docs/api/personal-api-overview) |
| BankSalad | Export up to 12 months initially and the two preceding completed months in the first week of each subsequent month. App export and file delivery are manual. Automate validation, import, duplicate review and aggregation after delivery. Check actual columns, stable instrument identity, currency, approval references, cancellations and installments in real samples. [Export guide](https://help.banksalad.com/207) · [Multiple export periods](https://help.banksalad.com/1071) |
| Issuer files and statements | Use CSV, XLSX, OFX or QFX for unsupported accounts and missing history. Prefer a stable source transaction identifier. Use itemized statements for transaction evidence and totals-only PDFs for reconciliation. Use OCR as a review aid for scanned PDFs. [BankSalad duplicate guidance](https://help.banksalad.com/update_2501) · [Missing transactions](https://help.banksalad.com/1006) |
| Korean MyData, Open Banking and CODEF | Reassess if a provider confirms owner eligibility, card coverage and cost. [Financial Services Commission](https://www.fsc.go.kr/po010101/75435) · [Open Banking](https://openapi.kftc.or.kr/service/openBanking) · [CODEF](https://codef.io/assets/pdf/202307_CODEF_API_%EC%86%8C%EA%B0%9C%EC%84%9C.pdf) |

Public institution lists are discovery aids. Test checking, brokerage cash management, and each card product separately, including accounts under the same login and cards affected by a product change. Compare purchases, refunds, foreign currencies, ACH, check activity, and card payments as applicable. Keep brokerage evidence independent of spending. [SimpleFIN institution directory](https://beta-bridge.simplefin.org/search-institutions) · [Apple Card exports](https://support.apple.com/en-us/102284) · [Robinhood statement guide](https://robinhood.com/us/en/support/articles/finding-your-reports-and-statements/)

Record source status, observed dates, account errors and last success. Preserve the last successful data when a request is empty or fails. Recover with overlap or issuer files. Store calendar months and statement cycles independently. Reconcile bank balances from opening balance and signed movements, and reconcile credit-card balances from prior balance, purchases, fees, interest, payments and credits. Keep reviewed manual files available for material categories that the feeds miss.

## Ledger and application boundaries

- Reuse explicit inventory account IDs, ownership scope, and verified provider bindings. Preserve source IDs or row references, raw descriptions, archive hashes, batch records, approval and posted dates, and billing evidence.
- Keep durable spending state in a dedicated ledger apart from the rebuilt portfolio database. Reuse private records and state roots and the single-writer boundary. Preserve atomic application, replay safety and recovery. Keep spending records and merchant data outside Git, Sheets, and briefing exports.
- Deduplicate stable source IDs and identical files first. Compare account, currency, dates, signed amount, merchant and approval evidence across sources. Preserve repeated identical purchases. Hold ambiguous rows and retain traceability for review, user classification, and corrections.
- Attribute posted purchases to the transaction month when available and posted refunds to the posting month. Record installment principal once when known and preserve billing details separately. Distinguish fees, rewards, and unapplied credits. Exclude payments, own-account transfers, remittances, wallet loads and investment purchases from spending. Leave ambiguous withdrawals and payment-service transactions unresolved until supported.
- Preserve USD and KRW settlement values and original foreign transaction amounts where available. Any future common-currency view must document its historical rate, date and source and indicate missing rates.
- Expand `/spending` with owner, market, category and longer-period filters as coverage supports them. Keep the existing portfolio transactions route intact. Show open gaps and evidence at `/accounts` and `/data-ops`. Consider Overview for verified months once the coverage is adequate. Any net cash-flow summary must define payroll, tax and transfer boundaries.

## Open-source references

| Project | Role |
| --- | --- |
| [Actual Budget](https://github.com/actualbudget/actual) | Primary reference for import APIs and file handling, merchant and category rules, transaction matching and transfer treatment. Compare in a separate sandbox. [API](https://actualbudget.org/docs/api/) · [Multi-currency](https://actualbudget.org/docs/budgeting/multi-currency/) |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | Candidate for a standalone budgeting service, with a separate [Data Importer](https://github.com/firefly-iii/data-importer). |
| [Sure](https://github.com/we-promise/sure) | Reference for transaction and merchant exploration. [Lunch Flow integration](https://www.lunchflow.app/docs/guides/destinations/sure) |

## Acceptance sequence

| Stage | Evidence |
| --- | --- |
| Initial source pilot | Observe account discovery, actual periods, refunds, payments and installments. Record real export headers and publish only synthetic fixtures. |
| Import and ledger | Replay exact and overlapping batches, preserve genuine repeated purchases, retain source evidence, and identify held rows and data gaps. |
| Repeat collection | After authorization, observe at least seven US runs and test reconnect and overlap recovery. Compare a complete cycle for a US card and bank account and for a Korean card. |
| Read-only view | Verify both languages, mobile layout, filters, and source evidence boundaries. Keep the existing asset, transactions and tax views working. |
| Operating readiness | Verify encrypted backup and restore in another path, last-good retention on source failures, behavior on schema changes, and concurrent runs. |
