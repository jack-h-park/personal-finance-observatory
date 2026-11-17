# Owner installation observation

Updated November 17, 2026 (America/Los_Angeles). This documentation update records the separately authorized security release and later scoped backup/recovery acceptance. The preceding table and November 15 section are dated historical observations; the latest observation is below. This task performs no deployment or new browser acceptance.

| Layer | Verified state | Interpretation |
| --- | --- | --- |
| Security source release | [#311](https://github.com/jack-h-park/stock-portfolio-observatory/pull/311) merged as `c1c4ffb739f62effb88b8f6791a8989bec754870` on November 13 local time | Both exact-head CI checks succeeded; package/lockfile and security assessment only |
| Security deployment | Next.js `15.5.28`, serving process `next-server (v15.5.28)`, build `4O1RLDxGA_mTDDkAc9AzY` | Installed build-manifest bytes matched through loopback and owner HTTPS; this is historical proof of that release |
| Repository main at preceding audit | [#320](https://github.com/jack-h-park/stock-portfolio-observatory/pull/320), `79435667e53823cf720b024c80cbf5f8326f140f` | Account inventory adapter/display #318 and Robinhood/pension compatibility #320 are merged; they are not in the observed operating checkout |
| Operating checkout at preceding audit | `e8d649ff8ac031442956f9b6305e50d57d53bd6d`, purchase-reimbursement source | This differs from both current main and the #319 GitHub merge `7854b1308bd94ab57d792475c2cabe6761a75f35`; do not equate a matching change title with exact merged-source parity. No source update occurred in this task |
| Build identity at preceding audit | Build `fhfJVvomExPZOp4P3kWqR` read from the operating installation | This task did not restart the listener or perform a new web acceptance; the earlier #311 checks retain their original release scope |
| Security-release web acceptance | Overview, total assets, tax history and a historical record verified in the browser; evidence downloads hash-matched with private/no-store caching | Overview monetary display and independently read page amounts matched the pre-release baseline; bounded verification, not every workflow or physical-device acceptance |
| Security-release preservation | Operating financial/data contents and selected original evidence hashes/mtimes matched baseline; environment, app service file and persisted/live gateway matched receipts | One transient SQLite SHM mtime-only difference was separately recorded with unchanged bytes; no financial content change |
| Current access/write observation | Owner-device notice and `FINANCE_STATE_WRITABLE=0` retained; environment, service file and gateway configuration unchanged across this audit | Approved-device web access remains intentional. #311 non-allowed LAN-source and spoofed-header requests received 403; not a physical other-device test |
| Registry audit at security rollout | Zero critical/high, two remaining moderate transitive findings | Historical audit result, not a claim of universal security or current alert closure; see [assessment and rollout](next-security-patch.md) |
| Coverage source | #304–#308 period/date evidence, #310 Samsung/Chase query-period work and #312 conditional account-update actions are merged | Current fetch age and actionable update prompts do not establish an authoritative expected-account inventory or complete history |
| Backup/recovery | Expanded custodian backup and pinned separate-location restore verified; see [backup status](finance-state-backup-and-restore.md#observed-operating-acceptance-november-13-2026) | Later ordinary daily snapshot evidence is now recorded in the [November 15 audit](finance-state-backup-and-restore.md#read-only-follow-up-november-15-2026); operating-host/cross-repository/application recovery remains separate |

## Security release boundary

The approved #311 release used an isolated synthetic candidate, frozen dependencies and an in-memory SQLite binding check. Only the application service was restarted after replacing its build/dependencies. The usual `make redeploy` includes refresh and was not used. No refresh, ingest, collection, source sync, tax import or backup/restore was run by that release. Previous build/dependencies remain retained privately for rollback; their cleanup requires a separate retention decision.

Earlier #290 tax-summary and #283/#286 gold/coverage acceptance retain their original scope. Annual component libraries and CLI are present in installed source; neither source presence nor the #311 smoke checks establish complete annual-tax totals, comparison eligibility or Korean reported amounts.

Hometax remains held; Korean line-specific reporting quantization is unresolved. The security-release authorization was completed and does not authorize another deployment. This documentation update changes no financial record, original evidence, access rule, web-write setting or operating configuration. Recheck source/build and protections before a later authorized release. Private figures, account identifiers, paths, snapshot IDs and detailed receipts remain outside this public repository.


## Later design-time observation: November 15, 2026

During the authority/path design, a fresh read-only observation found operating source `9c5e82adeaf09c87c4e2fc6a8b1df2639714f5e3` (#321) and build `XcfRnEjcmKuRsif7tYO7e`, unchanged across that design task. This source includes the #318/#320 commits by ancestry, unlike the preceding audit table. Neither the #322 documentation merge nor the design task installed or deployed that change. Source/build presence is not new browser acceptance of the account review surface or adoption of the private account proposal. Current repository main at the design branch base is #322, `fcf663ba352a469f4f71f27f4e15d10fcc6070be`; it is distinct from the observed operating source. The table above retains the preceding audit as historical evidence rather than attributing its checks to this later build. No additional deployment is authorized.


## Latest read-only observation and recovery checkpoint: November 17, 2026

A fresh read-only observation found application source `7b46b45b490679108efe4b00ef05185ea286decc` and build `owQLFmVlvOWHfurSJq_Jt`. These identify the observed installation, not a deployment performed or a browser workflow accepted by this documentation task. Earlier security and account-review acceptance retains its recorded scope.

The briefing producer is installed at the merged #76 source, with reviewed producer/consumer archive bindings. Its automatic job is disabled/paused and web financial writes remain disabled. The [November 17 backup/recovery acceptance](finance-state-backup-and-restore.md#briefing-scope-activation-and-isolated-recovery-november-17-2026) closes the newly identified operator-root gap through the applied #1924 backup scripts, actual expanded capture and scoped isolated restore. Do not list that path reconciliation or restore as unstarted work.

No real generation, archive record write, static publication or application restart was performed by those acceptance tasks. A concurrent gateway edit was observed during recovery; the pre-edit backup matched the baseline hash and the finance route was identical in pre-edit, post-edit and live configuration. This is finance-route preservation, not a claim that the entire gateway was unchanged. Original financial material, account maps and web-write prohibition were retained.

Actual generation and later publication remain separately held. A future scheduled run, future output custody, retention/cleanup, full fleet recovery and full application failover are not established by source installation or this scoped restore. Hometax remains held. Exact private evidence stays outside this repository.
