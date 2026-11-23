# Price refresh cadence

**Status:** design, 2026-11-23. Nothing here is implemented. Phase 0 and Phase 1 are the proposal; Phase 2 is an option to decide on after Phase 1 has run.

## Why

Prices in every valuation are as old as the last full refresh plus the provider's own delay. Two measurements from the ops host on 2026-11-23:

- **Cadence.** The Hermes `trader` profile runs `observatory-refresh` every six hours (`0 */6 * * *`) and `observatory-close-refresh` at 13:10 local on weekdays, shortly after the US close. Both call `observatory-refresh-cron.sh`, which runs the whole `pnpm refresh`. Between runs a price can be up to six hours old; the Korean session (about 16:00-22:30 local in winter) is covered only by the six-hour runs.
- **Provider delay.** Korean quotes from the Yahoo chart API were struck 12:47-12:51 KST and fetched at 13:11 KST, so about twenty minutes behind before any cadence effect. US quotes carry the last trade time of the close.

The screens now show the fetch time and the quote time (the price freshness rows), so the lag is visible. This design shortens it.

## What a refresh costs

Per-step durations of a full run (148 s in total, from the run record on the ops host):

| Step | Seconds |
| --- | --- |
| `fetch:fx` | 0.3 |
| `fetch:kr-prices` | 7.2 |
| `fetch:gold-price` | 3.6 |
| `fetch:us-prices` | 5.7 |
| `fetch:crypto-prices` | 3.6 |
| `fetch:historical-prices` | 0.3 |
| `ingest` | 1.4 |
| `backfill:history` | 0.5 |
| `summary` | 0.6 |
| `fetch:toss` | 11.4 |
| `extract:kr-statements` | 51.6 |
| `extract:bank-statements` | 28.5 |
| `extract:us-pdf-evidence` | 14.5 |
| `publish:kr-sheet`, `publish:us-sheet` | 6.9 each |
| other extractors | about 5 |

The price fetches, the ingest, the history backfill and the summary add up to roughly 25 seconds. The 120 seconds that make a full run slow are statement extraction and sheet publishing, which only change when a file is filed. A price-only run does not need them: the ingest rebuilds the database beside the live one and renames it over, so readers see the old or the new file, never a half-written one, and the extractor outputs from the last full run are already on disk.

## Proposal

### Phase 0: confirm the scheduler is the source of truth

The schedule lives in the ops host's Hermes `trader` profile, not in the repository (the launchd plist in `deploy/` is the laptop's). Before changing anything, read the current jobs with `hermes -p trader cron list` and record them here, so a later change can be checked against this list.

### Phase 1: a price-only refresh, run often during market hours

1. **A price-only entry point.** `pnpm refresh:prices` runs `fetch:fx`, `fetch:kr-prices`, `fetch:gold-price` (optional, as today), `fetch:us-prices`, `fetch:crypto-prices`, `ingest`, `backfill:history` and `summary`. It shares the existing refresh lock, so it is a no-op while a full refresh holds it, and a full refresh is never started under it.
2. **Its own run record.** The run history keeps the last 30 runs. A run every 30 minutes would evict the full runs that `/health` and the briefing summary read, so price-only runs are recorded under a `kind` field and the limit applies per kind.
3. **Market-aware gating inside the script.** Hermes cron runs in local time, and the sessions move with daylight saving, so the cron entry fires every 30 minutes and the script decides: it runs only while at least one tracked market is open (Korea 09:00-15:30 KST, US 09:30-16:00 ET, weekdays; crypto is always open and is refreshed with whichever run happens) and exits at once otherwise. Exchange holidays are not modelled; a run on a holiday fetches the previous close and changes nothing.
4. **Quiet by design.** The cron wrapper stays silent on success, as the full refresh does. A price-only failure alerts only when the failure persists across two runs, to avoid a message for one transient Yahoo error. A fetch that returns nothing keeps the last good file, as the full run does.
5. **Politeness to the provider.** The Yahoo endpoint is unofficial. A run makes about 40 Korean and 75 US requests, so at a 30-minute cadence in both sessions the load is a few hundred requests an hour. The fetchers already run sequentially; keep that, add a short pause between requests, and back off on HTTP 429.
6. **Freshness thresholds that match.** The stock price freshness limit is 36 hours so that a weekend passes. While a market is open, a price older than about two hours is stale. Make the limit market-aware once the cadence is in place, so a failing price job is noticed the same day.

Out of scope for this phase: the Google Sheets publishes (they stay on the six-hour run; the sheet tabs are read by the owner, not by the app) and statement extraction.

### Phase 2: a faster Korean source, if twenty minutes still matters

After Phase 1 the delay is the provider's, about twenty minutes for Korean quotes. Options, none verified for current terms or limits:

- A securities firm's Open API (for example Korea Investment & Securities) gives near real-time Korean quotes. It needs an app key from an account and has per-second request limits; credentials follow the repository's secrets rules.
- For US holdings in Robinhood accounts, the Robinhood MCP can read quotes, but the headless refresh does not call MCP today, so it would need its own connection design.
- Free US quote APIs with real-time or short-delay tiers exist; compare their terms before adopting any.

Decide after Phase 1: if a twenty-minute Korean delay is acceptable at a 30-minute cadence, stop there.

## Verification

- Run `pnpm refresh:prices` by hand on the ops host after Phase 1 is deployed; confirm it finishes in about 30 seconds, that the database file is replaced atomically while the app is serving, and that `/health` still shows the last full run.
- Hold the lock from a full refresh and confirm a price-only run exits without touching anything, and the reverse.
- Over a trading day, compare the number of price-only runs with the cron's firings and check the run history keeps the last full runs.
- Rollback: pause the new Hermes cron entry. The full refresh schedule is unchanged throughout.

## Decisions needed

1. Cadence inside market hours: 15 or 30 minutes (this design assumes 30).
2. Whether crypto should be refreshed outside the stock sessions (it is cheap; this design refreshes it on every run).
3. Whether the sheet publishes should join the price-only run.
4. Whether to pursue Phase 2 after seeing Phase 1.
