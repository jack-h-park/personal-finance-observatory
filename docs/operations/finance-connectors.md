# Finance connector coverage and shadow observations

## Fidelity shadow reader

`finance-connectors` owns provider credentials and collection. This app only reads completed exports. This integration is opt-in, read-only, and shadow-only: it adds health checks without inserting holdings, cash, activities, tax rows or prices.

Configure these on the private application host after the collector has produced an accepted live run:

```dotenv
FINANCE_MODE=private
FINANCE_CONNECTOR_EXPORT_DIR=/absolute/private/finance-connectors/runtime
FINANCE_CONNECTOR_RECORDS_DIR=/absolute/private/finance-connectors/records
STOCK_CONNECTOR_ACCOUNT_MAP_PATH=/absolute/private/observatory-state/connector-accounts.local.json
FINANCE_CONNECTOR_CONNECTION=fidelity
```

The reader pins `live/latest-good/fidelity.json`, verifies the referenced immutable manifest, all current payload hashes/counts, the versioned schema, account references and raw provenance/dependency hashes and JSON pointers. Sandbox/demo/sample runs and incomplete required sections are rejected. v1 currently accepts complete snapshots only; `unchanged` requires a future section-specific lineage contract. Source dates may be older than the fetch date. Fetch age warns after 36 hours and reports an error classification after 72 hours; configured shadow checks remain warnings so they cannot replace existing accounting inputs.

`STOCK_CONNECTOR_EXPORT_DIR`, `STOCK_CONNECTOR_RECORDS_DIR` and `STOCK_CONNECTOR_CONNECTION` are supported aliases. Conflicting aliases fail closed. Private roots cause private-mode inference; explicitly selecting sample with connector roots is rejected. No SnapTrade credentials belong in this repository or app.

Account mapping uses exact collector account references and separately reviewed instrument identities. Create the local file with mode 0600, outside Git:

```json
{
  "schemaVersion": 1,
  "accounts": {
    "snaptrade:fidelity:PROVIDER_ACCOUNT_ID": {
      "account": "EXACT_EXISTING_ACCOUNT_LABEL",
      "instruments": {
        "snaptrade:PROVIDER_SECURITY_ID": "EXISTING_TICKER"
      }
    }
  }
}
```

Review the provider security ID against Fidelity evidence before adding a mapping; ticker text alone never establishes identity. A conflicting provider symbol is reported. Unknown accounts/instruments, missing positions in either direction, and exact decimal quantity differences produce warning codes. Core money-market funds remain unverified because their inclusion in cash is not established. No labels or mappings are guessed and no economic values appear in shadow warning details.

Collection health is independent from the historical last-good export. Missing, malformed or unreadable latest status stays unknown and warns; it is never treated as success. Review `connector_shadow_valid`, `connector_shadow_fresh`, `connector_last_collection`, and `connector_shadow_positions` after a separately authorized private ingest. This implementation does not run a production refresh or publish Sheets.

Before promotion or scheduling, compare selected accounts, quantities, cash/core treatment, valuation dates and representative activities against current Fidelity/CSV/statement evidence. Complete at least seven successful daily shadow collections and a statement comparison. Positions, balances, activities and tax lots require separate acceptance and cutover decisions. Retain historical CSV evidence and unknown coverage; API absence does not prove zero or deletion.

The vendored `contracts/finance-connectors/v1/run.schema.json` is copied from the private producer's v1 schema. Its SHA-256 and source repository are recorded beside it. Any contract change must update both repositories and repeat a producer-to-consumer synthetic check.

## Account connection coverage view

`/data-connections` compares reviewed evidence per account in the United States
and South Korea. Store the reviewed `account-connection-scope.json` in
`FINANCE_STATE_DIR` on the private app host. A version 1
`us-connection-scope.json` remains readable when the new file is absent. It
identifies reviewed accounts. A `shadow` status records evidence of a recurring
collection path. The snapshot has no schedule, last successful run, or
field-level coverage dates.

```json
{
  "schemaVersion": 2,
  "reviewedOn": "2026-01-01",
  "accounts": [
    {
      "key": "example-account",
      "market": "us",
      "label": { "en": "Example account", "ko": "예시 계좌" },
      "sources": {
        "snaptrade": { "status": "pilot" },
        "simplefin": { "status": "discovered" },
        "files": { "status": "required" }
      }
    }
  ]
}
```

Use `shadow` for recurring shadow collection, `pilot` for a reconciled trial,
`limited` for partial returns, `discovered` for account discovery,
`unreturned` for an observed omission, `existing` for a separate operating
feed, and `unknown` for unverified evidence. Korean rows use `other` for the
reviewed provider or supplementary source. Use `keep` or `required` for
`files`. An optional bilingual `detail` can state the specific evidence or
gap. Leave an unverified source absent or use `unknown`.

Keep this snapshot outside Git and omit account numbers, balances, credentials
and raw records. Update it after reviewing evidence. The page displays the
snapshot without querying providers, importing records or reporting live health.

### Review and update procedure

1. Read both country views on the running service. Check the displayed review
   date, row count, source statuses, and details against the host's scope file.
2. Compare each claim with the latest collector result and any relevant issuer
   original. Check schedule registration separately from observed success.
   Read holdings, balances, posted activity, and pending activity independently.
3. Use the source detail to state the fields that are covered and the specific
   evidence still needed. A returned account and a zero-row response do not
   establish activity coverage. For overlapping providers, designate the
   account and fields owned by each source before using any values together.
4. After applying a reviewed scope update on the private host, reload both
   country views and verify the changed rows and the review date. An account
   status update does not authorize an accounting change. Keep approvals and
   economic ingest configuration separate from the scope file.

### November 22, 2026 audit

The running service displayed 22 US accounts and 25 Korean accounts from its
reviewed scope snapshot. The review date matched the snapshot, but several
entries still reflected earlier trials. The table below records the evidence
as of this audit and the changes needed in the private scope.

| Accounts | Verified evidence | Scope update or remaining dependency |
| --- | --- | --- |
| Chase Checking, Amex Checking and Savings, and Bank of America Checking | All four SimpleFIN scheduled collections succeeded on the audit date. | Keep recurring shadow coverage. Note the outstanding November Amex Checking statement comparison and keep existing balance approvals scoped to their accepted evidence. |
| Bank of America Advantage SafeBalance | SimpleFIN returned a separate bank account. | Keep account discovery status pending an independent statement or transaction export. |
| Chase Self-Directed | SnapTrade recurring shadow collection succeeded. All 137 overlapping buy and sell rows matched the original CSV. QACDS was excluded from the trade comparison. | Keep SnapTrade as the holdings and trade collection path. The original CSV remains useful for coverage and independent checks. |
| Fidelity Individual TOD and CMA | SnapTrade recurring read-only collection had six successful dates at the audit. | Keep the seven-run verification open. Reconcile the seven CMA SPAXX dividend events in shadow and check that each appears once. |
| Robinhood Checking and Savings | The first SnapTrade shadow run returned both accounts. SimpleFIN returned overlapping posted activity, and neither account was in the SimpleFIN daily batch. | Replace the pilot status with recurring shadow and state that the first run is verified and repeat operation remains to be observed. Use SnapTrade for these bank accounts. |
| Robinhood Mid-term, Long-term, and Agentic | SnapTrade returned holdings for all three accounts in the first run of the daily workflow. The existing integration remains the trade source. | Mark recurring shadow for holdings only. State the existing trade source separately and preserve the adjusted-cost-basis hold. |
| Merrill Edge CMA | The later SimpleFIN response returned the account and four securities matched original quantities. One cash-like holding requires identity review. The inspected window returned pending activity without posted activity. | Change from unreturned to limited. Use SimpleFIN for holdings in shadow and issuer CSVs for posted trades. Confirm repeat coverage before relying on the feed. Plaid Investments is deferred because of usage-based pricing. |
| Korean won demand deposits at Saemaul, KB, and Hana | CODEF returned scoped balances and history. The November 23 Korean-date intraday response is preserved separately and the closing-day collection is scheduled. | Retain pilot status. Record the closing window only after success. Preserve original statements for historical gaps and post-demo updates. |
| Hana foreign currency and Saemaul member shares | Existing CODEF authentication returned both products with balances in the account list. Transaction coverage is unverified. | Change from unverified to account found. Keep issuer originals for activity. |
| Toss Bank demand deposits and savings subaccounts | Original XLSX and PDF paths exist. BankSalad is supplementary and its comparison found an omission in one posted transaction window. | State which originals are already held and ask for the next missing period only. Keep joint ownership separate. |
| Mirae ISA and general/CMA | Current ISA holdings and cash and the CMA certificate valuation were independently confirmed and applied after owner approval in [PR #426](https://github.com/jack-h-park/stock-portfolio-observatory/pull/426). Production checks confirmed the sold position was absent and the CMA valuation counted once. | Record certificate evidence and retain originals. Remove the stale CMA discrepancy language. Keep activities in shadow. |
| Mirae IRP and child pension accounts, Samsung pension and RSU, Mirae gold, and KakaoPay Securities | Reviewed holdings captures and owner confirmations updated their evidence. The gold and RSU accounts were confirmed empty, and KakaoPay Securities was confirmed closed. | Reflect the captured pension holdings and reported account states. Preserve separate child ownership and exclude the historical certificate aggregate from duplicate counting. Keep pension observations in shadow. |
| Samsung Card | The issuer's November statement reconciled to the bank debit plus welfare-point credits. | Record the completed statement reconciliation and preserve issuer evidence for future cycles. |

The private account inventory remains the source for exact dates, evidence
paths, and file requests. Card and crypto rows have their own scope and should
not be counted as completed bank or brokerage connections.
