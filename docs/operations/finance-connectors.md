# Fidelity connector shadow observations

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
`us-connection-scope.json` remains readable when the new file is absent.

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
