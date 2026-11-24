import { financeFile } from './finance-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { loadLocalEnv } from './env.mjs'
import { collectUsPriceTickers, resolveUsHoldingFiles } from './source-files.mjs'
import { mergeQuotes } from './quote-sources.mjs'
import { tossPricesOrEmpty } from './toss-client.mjs'

loadLocalEnv()

const dataDir = financeFile('STOCK_DATA_DIR')
const evidencePath = financeFile('STOCK_US_PDF_EVIDENCE_PATH')
const outPath = financeFile('STOCK_US_PRICES_PATH')
const robinhoodSnapshotPath = financeFile('STOCK_ROBINHOOD_SNAPSHOT_PATH')

// Same resolver the ingest uses, so a re-downloaded holdings export is priced
// from the current file rather than a stale hardcoded name. Entries are
// { brokerage, filename }.
const usHoldingFiles = resolveUsHoldingFiles(dataDir).files

function text(value) {
  return value == null ? '' : String(value).trim()
}

function yahooSymbol(ticker) {
  const raw = text(ticker).toUpperCase()
  if (raw === 'BRKB') return 'BRK-B'
  return raw.replace('.', '-')
}

function isoDateFromSeconds(seconds) {
  if (!seconds) return ''
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

function readJsonIfPresent(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}

function collectTickers() {
  // One shared reader for every source, in source-files.mjs beside the
  // resolver. This used to be a second copy of the ingest's parsing, and the
  // copy read Merrill by fixed column offsets — correct for the tax-lot layout,
  // and the description column of the flat one. A flat export therefore asked
  // Yahoo for `JPMORGAN`, `SCHWAB`, `INVESCO` and `ML`, and the four misses
  // exited non-zero and failed the whole refresh before the ingest ran.
  //
  // The Robinhood snapshot is read too: the ingest takes Robinhood lots from it
  // whenever it has any, so a position opened after the last Gain/Loss PDF is
  // known only there, and leaving it out left that row with no market value.
  return collectUsPriceTickers({
    holdingFiles: usHoldingFiles,
    evidence: readJsonIfPresent(evidencePath),
    robinhoodSnapshot: readJsonIfPresent(robinhoodSnapshotPath),
  })
}

async function fetchPrice(ticker) {
  const symbol = yahooSymbol(ticker)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const json = await res.json()
  const meta = json.chart?.result?.[0]?.meta
  const price = Number(meta?.regularMarketPrice)
  if (!meta || meta.currency !== 'USD' || !Number.isFinite(price) || price <= 0) return null
  const entry = {
    ticker,
    symbol,
    price,
    currency: meta.currency,
    exchangeName: meta.exchangeName ?? '',
    instrumentType: meta.instrumentType ?? '',
    asOfDate: isoDateFromSeconds(meta.regularMarketTime),
    regularMarketTime: meta.regularMarketTime ?? null,
    shortName: meta.shortName ?? '',
    longName: meta.longName ?? '',
  }
  // The chart result rides along, not written to the file: mergeQuotes measures the
  // previous close against the session of the quote it keeps.
  Object.defineProperty(entry, 'chart', { value: json.chart?.result?.[0], enumerable: false })
  return entry
}

const tickers = collectTickers()
const prices = []
const missing = []

for (const ticker of tickers) {
  const price = await fetchPrice(ticker)
  if (price) {
    prices.push(price)
    console.log(`${ticker}: ${price.price} ${price.symbol}`)
  } else {
    missing.push(ticker)
    console.warn(`${ticker}: missing`)
  }
}

// Toss quotes win inside the regular session; Yahoo fills every other case
// (quote-sources.mjs). Without Toss credentials or access, this is Yahoo alone.
const tossPrices = await tossPricesOrEmpty(tickers)
const merged = mergeQuotes({ market: 'US', yahooEntries: prices, tossPrices, tickers, currency: 'USD' })
const kept = new Set(merged.prices.map((p) => p.ticker))
const stillMissing = tickers.filter((ticker) => !kept.has(ticker))
const tossUsed = merged.prices.filter((p) => p.source === 'toss').length
console.log(`US quotes: ${tossUsed} from Toss, ${merged.prices.length - tossUsed} from Yahoo, ${stillMissing.length} missing`)
for (const row of merged.divergent) console.warn(`US quote divergence over 2%: ${JSON.stringify(row)}`)

const output = {
  generatedAt: new Date().toISOString(),
  source: 'Toss Securities Open API (regular session), Yahoo Finance chart API (otherwise)',
  sourceUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d',
  note: 'Read-only market price snapshot for US holdings. Prices are external snapshots and may be delayed.',
  prices: merged.prices,
  missing: stillMissing,
  divergent: merged.divergent,
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(`Wrote ${outPath}: ${merged.prices.length}/${tickers.length} prices`)

if (stillMissing.length > 0) {
  process.exitCode = 1
}
