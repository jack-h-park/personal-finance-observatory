import Database from 'better-sqlite3'
import { config } from '../../config'
import type { SpendingFxRate } from '../domain/spending-view'

export function readSpendingFxRates() {
  const rates = new Map<string, SpendingFxRate>()
  const source = process.env.NODE_ENV === 'development' && process.env.SPENDING_PILOT_FX_DB
    || (config.finance.mode === 'private' ? config.stockDbPath : undefined)
  if (!source) return rates
  let connection: Database.Database | undefined
  try {
    connection = new Database(source, { readonly: true, fileMustExist: true })
    const rows = connection.prepare('SELECT price_date AS date, rate, source FROM historical_fx_rates').all() as SpendingFxRate[]
    for (const row of rows) rates.set(row.date, row)
  } catch {
    // Preserve native amounts and flag missing conversion when the rate store is unavailable.
  } finally {
    connection?.close()
  }
  return rates
}
