# Toss and Yahoo quotes, by session

**Status:** 2026-11-24. Approach B chosen by the owner: Toss quotes inside each market's regular session, Yahoo outside it. Calls marked *(builder's call)* were made while writing this.

## Why

Korean quotes from Yahoo's chart API run about twenty minutes behind, so the half-hourly price run shows Korean stocks up to fifty minutes late during the KRX session. The Toss Securities Open API, already connected for holdings, returns current prices for any Korean or US symbol, with a trade timestamp, in one call of up to 200 symbols. A read-only probe on the ops host on 2026-11-24 returned every Korean ticker held (KOSPI, KOSDAQ and ETFs) and every US ticker but one, in about 0.2 s per call.

The two sources measure different things outside regular hours. A Toss Korean price is the KRX + NXT integrated last trade and keeps moving until 20:00 KST. Yahoo gives the KRX regular-session price, which is what the daily close history, the snapshots, tax figures and briefings all use. Switching current prices to Toss alone would put today's point on a different basis from every earlier point.

## Goals

- During each market's regular session, the current price is the Toss quote when it is newer than Yahoo's.
- Outside the regular session, the current price is Yahoo's: the KRX or NYSE/Nasdaq regular-session price.
- Either source failing, missing a symbol, or being unavailable (local development and CI have no Toss access) falls back to the other without failing the run.
- Each quote entry records which source it came from and when it was struck. When both sources quote a symbol inside the session and disagree by more than 2%, the run writes a warning.

## Non-goals

- Moving the daily close history to Toss candles. #473 fixed the Yahoo gaps, so this is not needed now.
- Showing NXT or US extended-hours prices anywhere.
- A setting to choose the basis. Both quotes stay in the file, so one can be added later.

## Design

### Which quote wins

For each symbol the price fetch takes both quotes:

- **Toss:** `lastPrice` and `timestamp` from `GET /api/v1/prices`.
- **Yahoo:** `regularMarketPrice` and `regularMarketTime` from the existing chart call.

The Toss quote is used when its timestamp falls inside that market's regular session on a weekday, on the exchange's clock, and is later than Yahoo's. Otherwise the Yahoo quote is used.

| Market | Regular session | Time zone |
| --- | --- | --- |
| KR | 09:00–15:30 | Asia/Seoul |
| US | 09:30–16:00 | America/New_York |

The rule needs no clock and no holiday calendar, because the timestamps decide. Three cases show how:

- After the KRX bell, an NXT trade at 19:59 is outside the window, so Yahoo's KRX close is used.
- A stock with no NXT trading keeps its last regular trade, for example 15:19. That is inside the window but older than Yahoo's 15:30 close, so Yahoo still wins.
- Before the open, NXT pre-market trades fall outside the window, so the previous close stays.

*(builder's call: a quote exactly at the bell counts as inside the window.)*

### Quote file fields

The entry shape stays the same (`price`, `asOfDate`, `regularMarketTime`, `previousClose`, `previousCloseDate`), so the ingest and the day-change reader work unchanged. New fields:

- `source`: `toss` or `yahoo`, the quote that was used.
- `quotedAt`: ISO time of the quote used.
- `alternate`: `{ source, price, quotedAt }`, the other quote when there is one.

`asOfDate` is the session date of the quote used, on the exchange's clock. `previousClose` is still taken from Yahoo's daily bars (the KRX or regular-session close), measured against that `asOfDate`. At 09:05 the Toss quote can be for today while Yahoo still shows yesterday. In that case the previous close is the close before today, not before yesterday.

Divergence: when both quotes are inside the session and differ by more than 2%, the file gets a `divergent` list (ticker, both prices and times), and the run prints one line per ticker. *(builder's call: 2%. During the session the two should differ only by Yahoo's delay.)*

### The Toss client

`scripts/toss-client.mjs` serves both `fetch-toss.mjs` and the price fetches.

- **Shared token cache.** Toss keeps one valid token per client, and issuing a new one revokes the previous one. The token is cached at `~/.config/stock-portfolio-observatory/toss-token.json` (mode 0600, the directory the price-refresh cron state already uses) and reused until 10 minutes before it expires. A `401` reissues it once. `fetch-toss.mjs` switches to the same cache, so a half-hourly price run does not issue a fresh token each time. *(builder's call: the cache path.)* The token is never printed or logged.
- **`prices(symbols)`:** requests in batches of 200 and returns a map from symbol to `{ price, quotedAt, currency }`.
- **Missing credentials** (no `TOSS_OPENAPI_CLIENT_ID`/`_SECRET`, as in local development and CI): returns null without a request, and the fetch uses Yahoo only.
- **Any Toss error** (403 for an IP not on the allowlist, 429, 5xx, timeout): logged once and treated the same way. The run never fails because of Toss.

### Where it runs

The price fetches run in both the half-hourly price run and the six-hourly full refresh. Only the ops host is on the Toss IP allowlist, so local and CI runs keep today's Yahoo behaviour.

## Constraints

- Repository text is in English. The repository is public, so no account numbers, amounts or holding counts go in code, docs or PR text.
- The token never reaches stdout, logs or the snapshot files.
- Tests make no network calls. The selection rule is pure, and the client takes an injectable `fetch`.

## Left to the builder

- Ticker mapping for US share classes (BRKB on Toss): fall back to Yahoo for now.
- Whether the divergence list also becomes an ingest validation check.
