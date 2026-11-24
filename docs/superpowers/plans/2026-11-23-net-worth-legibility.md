# Total assets page (`/net-worth`) — legibility plan

**Status:** 2026-11-23. Follows `2026-11-22-net-worth-redesign.md` (implemented). The owner took the recommended option on all five decisions below. N1–N3 are implemented; N4 and N5 are not started.

## Why

The 2026-11-22 redesign put the trend first and added filters. Three problems remain, all visible on the deployed page:

1. **The "기준일과 자료 커버리지" panel cannot be read at a glance.** It is twelve label/value pairs and five paragraphs of caveats, all in the same weight and colour. Nothing says which value is good, which is a problem, or what to do about it. Counts such as `최신 5 · 갱신 임박 7 · 조치 필요 0 · 자료 없음 0` are plain text, so a non-zero "조치 필요" looks the same as a zero. Dates are bare ranges with no age. The panel also mixes two questions that have different readers:
   - *What dates is this total as of?* (valuation basis: prices, FX, cash balances) — needed every time the total is read.
   - *How complete is my source data?* (account coverage, statement periods, failed checks, file freshness) — an operator question whose home is `/health`, `/accounts`, `/data-ops`.
2. **The top of the trend card wastes space and its controls look loose.** The total sits on the left and the range change on the right with an empty middle about 900px wide. Below it come four separately labelled rows: period chips, class chips, view chips (which also hold the unrelated 자녀 포함 toggle), then a hint sentence and a from/to date form with its own 보기 button. Period chips and the date form are two controls for one thing (the window). The class chips repeat the chart legend without its colours. The six period changes sit under the chart, while the one for the selected range sits beside the total, so the same kind of figure lives in two places.
3. **Where the stock prices come from, and as of when, is not findable.** The only statement is one sentence in the composition card, under the 자산군별 table (`주식 가격 기준: 한국 … · 미국 … 시세 출처: Yahoo Finance chart API`). It gives a date per market but not the quote time, the fetch time, the exchange, or whether the price is current. The data for all of that already exists and is shown only on `/health` as freshness rows:
   - each price file (`kr-prices.json`, `us-prices.json`, `crypto-prices.json`) has `generatedAt`, `source`, `sourceUrl`;
   - each price has `asOfDate`, `regularMarketTime` (crypto: `quotedAt`) and `exchangeName`;
   - `quoteWindow()` in `lib/adapters/portfolio-db.ts` already derives the newest/oldest quote time per file;
   - `priceStaleAfterMs()` in `lib/price-staleness.ts` already knows each market's session and when a price is stale;
   - `fx-rates.json` and `gold-prices.json` carry the same kind of fields for FX and gold;
   - US broker-export positions are repriced from `us-prices.json` when the quote is newer (`scripts/broker-quote-reprice.mjs`), otherwise they keep the broker's own price — today the page does not say which positions are on which.

## Principles

1. **Every figure answers "as of when, from where" next to itself.** The valuation basis sits in the lead card under the total, not in a panel above the page and not in a footnote three cards down.
2. **Status is shown, not described.** Use the shared status tones and freshness badges (`FreshnessBadge`, `statusTone`) instead of sentences. A caveat paragraph is replaced by a badge plus a popover.
3. **Operator detail goes to its home.** `/net-worth` shows one line of data health with links; the full breakdown stays on `/health` and `/accounts` (the one-home rule in `docs/ui-guide.md`).
4. **One control per concept.** One window control, one class control that is also the legend, one view control.
5. **Page order from `docs/ui-guide.md`:** lead figure, then issues, then controls, then detail. The coverage panel currently sits above the lead.

## Target layout

```
┌ 자산 현황 추이 ─────────────────────────────────────────────────────────────┐
│ 확인 가능한 총자산 · 본인                        선택 기간(2Y) 변동           │
│ ₩1,595,116,024                                    +₩325,905,116  +25.7%     │
│ 제외 3건 · 부채 미반영 ⓘ                          투자 손익 +1.88억 …        │
│                                                                             │
│ 평가 기준  [● 한국 주식 11-24 15:30 종가] [● 미국 주식 11-21 16:00 ET 종가]   │
│            [● 암호화폐 11-24 09:10] [● 금 KRX 11-21] [● 환율 1,382.78 11-24] │
│            [▲ 현금 잔액 07-10 – 11-23]                    자료 상태: 조치 2 › │
├─────────────────────────────────────────────────────────────────────────────┤
│ [1M 3M 6M YTD 1Y 2Y 3Y 5Y 전체 | 직접 지정]  ■주식 ■암호화폐 ■현금 ■연금 ■금  │
│ [금액 | 비중]  ☐ 자녀 포함                                                    │
│ (직접 지정 or chart drag → inline: 2024-11-30 ▾ – 2026-11-23 ▾ [적용])        │
├─────────────────────────────────────────────────────────────────────────────┤
│ chart                                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 이번 달 · 3개월 · YTD · 1년 · 2년 · 3년 (KPI band, unchanged)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

Each 평가 기준 chip opens a popover with the full detail (below). The coverage `<details>` panel above the card goes away.

## Phases

Each phase is one PR, stacked, with `pnpm test`, `pnpm ui:guardrails`, the screenshot net, and the English render checked.

### N1. Valuation basis model (no UI change)

New pure module `lib/valuation-basis.ts` that returns one item per input to the total:

```ts
type ValuationBasisItem = {
  key: 'KR' | 'US' | 'CRYPTO' | 'GOLD' | 'FX' | 'CASH'
  status: FreshnessStatus            // same scale as /health
  quotedNewest: string | null        // ISO, from regularMarketTime / quotedAt
  quotedOldest: string | null
  session: 'close' | 'intraday' | 'unknown'   // from the market session in lib/price-staleness.ts
  fetchedAt: string | null           // file generatedAt
  source: string | null              // provider names, via priceSourceNames()
  sourceUrl: string | null
  exchanges: string[]                // distinct exchangeName, e.g. KSC/KOE, NMS/NYQ
  priced: number; missing: number    // holdings priced vs. in `missing`
  value?: number                     // FX: the rate
}
```

- Read the same files `getOperationalHealth()` reads; move `quoteWindow()` and `sourceText()` out of the adapter so both use one copy.
- Cash uses the existing coverage review range (`review.cash`).
- Tests: a fixture per market with mixed dates, a missing file, a stale file, an intraday quote, crypto `quotedAt`.

*As built:* `lib/valuation-basis.ts` (pure, `buildValuationBasis`) and `getValuationBasis()` in the adapter, which reads the same files as `getOperationalHealth()`; `quoteWindow()` and `sourceText()` moved into the module and the adapter imports them. Close vs. intraday comes from `quoteSessionAt()` in `scripts/market-hours.mjs` (regular session, no grace period, so a quote stamped at the bell is a close). The crypto, FX and gold limits are named constants in `lib/price-staleness.ts`. Gold is read from a new `config.stockGoldPricesPath`. **Not built:** the broker-priced count for US positions. The ingest sets `price_as_of` on a repriced row but `holdings` does not store it, so the page cannot tell a repriced position from one left at the broker's price without a schema change; that is a separate task.

### N2. Valuation basis strip in the lead card

- New component `ValuationBasisStrip` (chips with a status dot, wrapping on phones) under the total, inside `#net-worth-trend`.
- Chip text: market, date + time in the market's own zone, 종가/장중. Popover: provider, exchange(s), fetched at, quote window, priced/missing counts, staleness rule, link to `/health#prices`.
- Remove the stock price note from the composition card (`overviewCopy.stockPriceNote` stays for the Overview, which can take the strip in a later phase).
- Copy in `lib/ui-copy/pages/netWorth.ts`, both languages; times through `fmtDateTime` with the language.

*As built:* `components/ValuationBasisStrip.tsx` renders the chips; their words come from `lib/valuation-basis-view.ts` (pure, tested in both languages). Quote times use a new `fmtMomentIn()` on each market's own clock, labelled KST or ET, so a US close reads 16:00 rather than the next morning in Seoul; fetch times use `fmtMomentShort()` like `/health`. The staleness rule in each popover is built from the constants in `lib/price-staleness.ts`, not written into the copy. `HelpPopover` gained a `trigger` prop so the chip itself opens the popover; with a trigger the button is named by its own text (no `aria-label`), and the status is added as screen-reader text because the dot's colour carries it otherwise. Crypto and gold appear only when the portfolio holds them. The composition card's stock price sentence is gone; the Overview still uses it until N5.

### N3. Coverage panel → one-line data status

- Delete the `AssetCoverageNote` panel from `/net-worth`. Its parts move:
  | Today | Goes to |
  |---|---|
  | boundary sentence | a subtitle under the total: `본인 · 제외 N건 · 부채 미반영` with the full sentence in an info popover |
  | market/snapshot/cost valuation dates, FX date, cash range | the N2 strip |
  | account/supplementary coverage counts, statement periods, failed checks, file freshness | a single `자료 상태` link at the strip's end showing the worst status and its count (e.g. `조치 필요 2`), tone from `statusTone`; zero problems shows `정상` in neutral ink |
  | statement evidence list, period hint, freshness hint, history note | `/health` (or `/accounts`), next to the counts they explain |
- `AssetCoverageNote` also renders on the Overview (`app/page.tsx`); it gets the same one-line treatment there in this phase, so the component can be deleted rather than left half-used.
- Cost-basis valuation date currently reads `조회 불가 / 미확인`; if no position is valued at cost, the strip leaves it out rather than showing an unknown.

*As built:* `components/CoverageLine.tsx` is one line under the total: `본인 자산 · 제외 N건 · 부채 미반영` with the full boundary sentence behind an info popover, then `자료 상태 · <worst status>` linking to `/health#health-asset-coverage`. It sits beside the boundary under the total rather than at the end of the valuation strip, so the Overview, which has no strip yet, can carry the same line. `dataStatus()` in `lib/application/asset-coverage.ts` picks the worst signal and counts its items: action needed or missing sources, failed checks, missing files and conflicting statement periods need action; sources due soon and stale or changed files are to check; unconfirmed periods count as neither; nothing readable is unknown, never a green zero. Because it sums items, the count is large where many sources are missing (137 in a worktree with no source files; the deployed page's panel adds up to about 13). The panel moved to `/health` whole and opened, rather than split, so nothing it showed is lost while N5 is pending; the valuation dates in it duplicate the strip until then. `AssetCoverageNote` stays as the `/health` card's body (`open` prop).

### N4. Trend card header and toolbar

- **Header.** Total and scope on the left, selected-range change on the right, top-aligned; the strip spans the full width under both, which fills the empty middle. Hero size unchanged.
- **Toolbar.** One block, not four labelled rows:
  - window: a link-based segmented control `1M … 전체 | 직접 지정`. `SegmentedControl` in `components/controls.tsx` is button/onChange only, so add a link variant (`LinkSegmentedControl`) that renders `<a aria-current>` with the same look, since filters are URLs.
  - classes: chips with the chart colour swatch (`ASSET_CLASS_COLOR`); they replace the chart legend.
  - view: `금액 | 비중` segmented; `자녀 포함` becomes a checkbox-style toggle in its own slot, since it is not a view.
  - custom range: hidden until `직접 지정` is picked or the chart is dragged; then the from/to selects and 적용 appear inline on the same row. The hint sentence moves to the control's tooltip.
- Labels (`기간`, `자산군`, `보기`) stay as visually hidden text for screen readers; the controls' shape says what they are.
- Phone (390px): the toolbar wraps into two rows at most; no horizontal scroll.

### N5. Shape check and reuse

- Add `/net-worth` with lead `#net-worth-trend` to `SHAPE_ROUTES` in `scripts/page-shape.mjs`, so the lead's top edge (≤ 840px) and the card budget are checked.
- Reuse `ValuationBasisStrip` on `/holdings` (KR/US/crypto only) and the Overview hero (compact: dots only, popover on tap).
- Position detail (`/positions/[market]/[ticker]`) gets the per-security row: price, quote time, exchange, provider, or "broker export price as of …" when repricing did not apply.

## Decisions (confirmed 2026-11-23)

1. **Coverage counts on `/net-worth`:** one `자료 상태` link with the worst status; the counts live on `/health` and `/accounts`.
2. **Period changes:** the six-period KPI band stays under the chart, as on the Overview.
3. **Custom range:** the date form folds into the window control as `직접 지정`.
4. **Close vs. intraday label:** `종가`/`장중` from the market session.
5. **Scope of N5:** the `/holdings`, Overview and position-detail reuse is part of this plan.

## Not in scope

- Changing the price provider or refresh cadence (`2026-11-23-price-refresh-cadence.md`).
- Filling bond month-end prices (open follow-up from the holdings plan).
- The month-end history and cash tables.
