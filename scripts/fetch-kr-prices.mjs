import { financeFile } from './finance-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { loadAccountMap } from './account-map.mjs'
import { loadLocalEnv } from './env.mjs'
import { krPriceTickers } from './kr-price-tickers.mjs'
import { mergeQuotes } from './quote-sources.mjs'
import { tossPricesOrEmpty } from './toss-client.mjs'

loadLocalEnv()

const dataDir = financeFile('STOCK_DATA_DIR')
const payloadDir = path.join(dataDir, '.codex_sheet_payloads')
const holdingsPath = path.join(payloadDir, 'summary.noapost.tsv')
const outPath = financeFile('STOCK_KR_PRICES_PATH')
// Pension snapshot ETFs are priced too; the account map only decides which
// payload rows are not securities (the gold account).
const pensionDir = financeFile('STOCK_PENSION_DIR')
const accountMap = loadAccountMap(financeFile('STOCK_ACCOUNT_MAP_PATH'))

function text(value) {
  return value == null ? '' : String(value).trim()
}

function number(value) {
  const raw = text(value)
  if (!raw || raw.startsWith('=')) return null
  const cleaned = raw.replace(/[$,%]/g, '').replace(/,/g, '').replace(/^\((.*)\)$/, '-$1')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function readTsv(filePath) {
  const body = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim()
  const [header, ...lines] = body.split(/\r?\n/)
  const columns = header.split('\t')
  return lines.filter(Boolean).map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(columns.map((col, i) => [col, cells[i] ?? '']))
  })
}

function isoDateFromSeconds(seconds) {
  if (!seconds) return ''
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

async function fetchCandidate(ticker, suffix) {
  const symbol = `${ticker}.${suffix}`
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) return null
  const json = await res.json()
  const meta = json.chart?.result?.[0]?.meta
  const price = Number(meta?.regularMarketPrice)
  if (!meta || meta.currency !== 'KRW' || !Number.isFinite(price) || price <= 0) return null
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

async function fetchPrice(ticker) {
  const candidates = []
  for (const suffix of ['KS', 'KQ']) {
    const result = await fetchCandidate(ticker, suffix)
    if (result) candidates.push(result)
  }
  if (candidates.length === 0) return null
  const preferredTypes = new Set(['EQUITY', 'ETF'])
  return candidates.sort((a, b) => {
    const typeScore = Number(preferredTypes.has(b.instrumentType)) - Number(preferredTypes.has(a.instrumentType))
    if (typeScore) return typeScore
    return (b.regularMarketTime ?? 0) - (a.regularMarketTime ?? 0)
  })[0]
}

const tickers = krPriceTickers({ holdingsRows: readTsv(holdingsPath), pensionDir, accountMap })
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
const merged = mergeQuotes({ market: 'KR', yahooEntries: prices, tossPrices, tickers, currency: 'KRW' })
const kept = new Set(merged.prices.map((p) => p.ticker))
const stillMissing = tickers.filter((ticker) => !kept.has(ticker))
const tossUsed = merged.prices.filter((p) => p.source === 'toss').length
console.log(`KR quotes: ${tossUsed} from Toss, ${merged.prices.length - tossUsed} from Yahoo, ${stillMissing.length} missing`)
for (const row of merged.divergent) console.warn(`KR quote divergence over 2%: ${JSON.stringify(row)}`)

const output = {
  generatedAt: new Date().toISOString(),
  source: 'Toss Securities Open API (regular session), Yahoo Finance chart API (otherwise)',
  sourceUrl: 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=5d&interval=1d',
  note: 'Read-only market price snapshot for KR holdings. Prices are external snapshots and may be delayed.',
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
