/**
 * The /holdings day change: how much each market, and the whole portfolio,
 * moved since the previous close, and which securities moved it most.
 * Today's quantity is used on both sides of the move, so a purchase or sale
 * made today never reads as a gain or loss. Pure, so it is tested without a
 * database.
 */

export type DayChangeRow = {
  market: string
  ticker: string
  name: string
  currency: string
  quantity: number
  price: number | null
  quoteDate: string | null
  fxNow: number | null
  prevClose: number | null
  prevCloseDate: string | null
  prevFx: number | null
}

export type MarketDayChange = {
  market: 'KR' | 'US' | 'CRYPTO'
  session: string
  changeKrw: number
  prevValueKrw: number
  pct: number | null
}

export type DayContributor = { market: string; ticker: string; name: string; changeKrw: number; pricePct: number | null }

export type DayChange = {
  markets: MarketDayChange[]
  total: { changeKrw: number; pct: number | null } | null
  up: DayContributor[]
  down: DayContributor[]
  excluded: number
  usdKrw: { now: number; prev: number; prevDate: string } | null
}

const DAY_MARKETS = ['KR', 'US', 'CRYPTO'] as const

const num = (value: number | null | undefined): number | null => (value == null || !Number.isFinite(Number(value)) ? null : Number(value))

const percent = (change: number, base: number): number | null => (base === 0 ? null : (change / base) * 100)

/**
 * Whether a row has every input its change needs: price, previous close and
 * both dates, and for a non-KRW row both FX rates. Only such rows set a
 * market's session, so an unvaluable row with a newer date cannot exclude the
 * correctly quoted ones.
 */
function isValuable(row: DayChangeRow): boolean {
  if (num(row.quantity) == null || num(row.price) == null || num(row.prevClose) == null) return false
  if (row.quoteDate == null || row.prevCloseDate == null) return false
  if (row.currency === 'KRW') return true
  return num(row.fxNow) != null && num(row.prevFx) != null
}

/**
 * Per market, the change between the newest session's close and the close
 * before it. A market closed today (weekend, holiday) reports its last
 * session, not zero. A market's session is the newest quote date among its
 * rows that can be valued. One market never mixes two sessions: rows quoted
 * before that date are excluded and counted, as are rows with a missing
 * price, close or date, a non-KRW row missing either FX rate, and rows of any
 * market other than KR, US and CRYPTO.
 */
export function dayChange(rows: readonly DayChangeRow[], limit = 5): DayChange {
  const sessions = new Map<string, string>()
  for (const row of rows) {
    if (!isValuable(row) || !(DAY_MARKETS as readonly string[]).includes(row.market)) continue
    const quoteDate = row.quoteDate as string
    const known = sessions.get(row.market)
    if (known == null || quoteDate > known) sessions.set(row.market, quoteDate)
  }

  let excluded = 0
  const sums = new Map<string, { change: number; prev: number }>()
  const contributors = new Map<string, { market: string; ticker: string; name: string; change: number; prevClose: number; price: number }>()
  let usdKrw: DayChange['usdKrw'] = null

  for (const row of rows) {
    const price = num(row.price)
    const prevClose = num(row.prevClose)
    const quantity = num(row.quantity)
    const session = sessions.get(row.market)
    if (session == null || quantity == null || price == null || prevClose == null || row.quoteDate !== session || row.prevCloseDate == null) {
      excluded += 1
      continue
    }
    const isKrw = row.currency === 'KRW'
    const fxNow = isKrw ? 1 : num(row.fxNow)
    const prevFx = isKrw ? 1 : num(row.prevFx)
    if (fxNow == null || prevFx == null) {
      excluded += 1
      continue
    }

    const change = quantity * (price * fxNow - prevClose * prevFx)
    const prev = quantity * prevClose * prevFx
    const sum = sums.get(row.market) ?? { change: 0, prev: 0 }
    sum.change += change
    sum.prev += prev
    sums.set(row.market, sum)

    const key = `${row.market}:${row.ticker}`
    const entry = contributors.get(key) ?? { market: row.market, ticker: row.ticker, name: row.name, change: 0, prevClose: 0, price: 0 }
    entry.change += change
    // The price move is per share, so it is the same for every row of the ticker.
    entry.prevClose = prevClose
    entry.price = price
    contributors.set(key, entry)

    if (row.market === 'US' && !isKrw && usdKrw == null) usdKrw = { now: fxNow, prev: prevFx, prevDate: row.prevCloseDate }
  }

  const markets: MarketDayChange[] = []
  for (const market of DAY_MARKETS) {
    const sum = sums.get(market)
    const session = sessions.get(market)
    if (!sum || session == null) continue
    markets.push({ market, session, changeKrw: sum.change, prevValueKrw: sum.prev, pct: percent(sum.change, sum.prev) })
  }

  const totalChange = markets.reduce((acc, m) => acc + m.changeKrw, 0)
  const totalPrev = markets.reduce((acc, m) => acc + m.prevValueKrw, 0)

  const all: DayContributor[] = [...contributors.values()]
    .filter((c) => c.change !== 0)
    .map((c) => ({
      market: c.market,
      ticker: c.ticker,
      name: c.name,
      changeKrw: c.change,
      pricePct: c.prevClose === 0 ? null : (c.price / c.prevClose - 1) * 100
    }))

  return {
    markets,
    total: markets.length === 0 ? null : { changeKrw: totalChange, pct: percent(totalChange, totalPrev) },
    up: all.filter((c) => c.changeKrw > 0).sort((a, b) => b.changeKrw - a.changeKrw).slice(0, limit),
    down: all.filter((c) => c.changeKrw < 0).sort((a, b) => a.changeKrw - b.changeKrw).slice(0, limit),
    excluded,
    usdKrw
  }
}
