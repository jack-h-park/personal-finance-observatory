export const approvedMiraeFile = 'approved-mirae-balances.json'

const isaAccount = '미래에셋증권(ISA)'
const cmaAccount = '미래에셋 CMA'
const source = 'approved_mirae_certificate'
const won = value => Number.isSafeInteger(value) && value >= 0

function receipt(value, accountEnding) {
  const date = value?.date
  const day = new Date(date + 'T00:00:00Z')
  if (value?.accountEnding !== accountEnding || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date
      || !/^[a-f0-9]{64}$/.test(value.statementSha256)) {
    throw new Error('Invalid approved Mirae certificate identity')
  }
  return value
}

export function approvedMiraeBalances(input) {
  if (input?.version !== 1) throw new Error('Invalid approved Mirae receipt version')
  const isa = receipt(input.isa, '2000')
  const cma = receipt(input.cma, '9320')
  if (!won(isa.cashWon) || !won(isa.totalWon) || !won(cma.valueWon)
      || !Array.isArray(isa.positions) || !isa.positions.length) {
    throw new Error('Invalid approved Mirae balances')
  }

  const tickers = new Set()
  let total = isa.cashWon
  for (const { ticker, quantity, valueWon, name, unitCostWon } of isa.positions) {
    if (!/^\d{6}$/.test(ticker) || tickers.has(ticker) || !won(quantity) || !quantity
        || !won(valueWon) || typeof name !== 'string' || !name.trim()
        || !Number.isFinite(unitCostWon) || unitCostWon < 0) {
      throw new Error('Invalid approved Mirae ISA position')
    }
    tickers.add(ticker)
    total += valueWon
  }
  if (total !== isa.totalWon) throw new Error('Approved Mirae ISA certificate total does not balance')

  return {
    holdings(rows) {
      const existing = new Map(rows.filter(row => row.account === isaAccount).map(row => [row.ticker, row]))
      const positions = isa.positions.map(({ ticker, name, quantity, valueWon, unitCostWon }) => {
        const previous = existing.get(ticker)
        const sameQuantity = previous?.quantity === quantity
        const cost = sameQuantity ? previous.native_cost : Math.round(unitCostWon * quantity)
        const price = valueWon / quantity
        const gain = valueWon - cost
        const gainPct = cost ? gain / cost * 100 : null
        return {
          ...(sameQuantity ? previous : {}),
          market: 'KR', currency: 'KRW', base_currency: 'KRW', fx_rate_to_base: 1,
          brokerage: '미래에셋증권', account_type: 'ISA', account_wrapper: 'isa', owner: 'self',
          asset_class: 'security', source_system: source, valuation_source: 'snapshot', as_of_date: isa.date,
          account: isaAccount, ticker, name, quantity,
          native_average_unit_cost: cost / quantity, average_unit_cost: cost / quantity,
          native_cost: cost, base_cost: cost, total_cost_krw: cost,
          native_price: price, current_price: price, native_market_value: valueWon, base_market_value: valueWon,
          native_unrealized_gl: gain, base_unrealized_gl: gain, unrealized_gl_krw: gain,
          native_unrealized_gl_pct: gainPct, unrealized_gl_pct: gainPct,
        }
      })
      return [...rows.filter(row => row.account !== isaAccount), ...positions]
    },
    isaCash(rows) {
      const samePool = row => row.account === isaAccount && row.institution === '미래에셋증권'
        && row.pool === 'KRW' && row.currency === 'KRW'
      return [
        ...rows.filter(row => !(samePool(row) && row.as_of_date >= isa.date)),
        { institution: '미래에셋증권', account: isaAccount, pool: 'KRW', currency: 'KRW',
          as_of_date: isa.date, balance: isa.cashWon, source, account_wrapper: 'isa', asset_class: 'security' },
      ]
    },
    cmaCash(rows) {
      const sameCma = row => row.institution === 'mirae' && row.account === cmaAccount && row.currency === 'KRW'
      return [
        ...rows.filter(row => !(sameCma(row) && row.as_of_date >= cma.date)),
        { institution: 'mirae', account: cmaAccount, owner: 'self', kind: 'cma', currency: 'KRW',
          as_of_date: cma.date, balance: cma.valueWon, day_max_balance: null, source, derived: 0 },
      ]
    },
  }
}
