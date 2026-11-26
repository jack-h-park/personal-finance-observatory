// Account-scoped collector for the spending review runner. The SDK client
// comes from the installed finance-connectors release.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [connector, bindingPath, from, through] = process.argv.slice(2)
const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'))
const { createProvider } = await import(pathToFileURL(path.join(connector, 'dist/providers/snaptrade/client.js')))
const p = createProvider()

try {
  const [connections, accounts] = await Promise.all([p.connections(), p.accounts()])
  const matches = accounts.filter(account => account.id === binding.providerAccountId &&
    account.raw_type === 'CREDITCARD' && String(account.number ?? '').endsWith(binding.maskedSuffix) &&
    connections.some(connection => connection.id === account.brokerage_authorization &&
      connection.type === 'read' && !connection.disabled && connection.brokerage?.slug === 'CHASE'))
  if (matches.length !== 1) throw new Error('snaptrade_card_identity_mismatch')
  const [account] = matches
  const sync = account.sync_status?.transactions
  if (sync?.initial_sync_completed !== true || !/^\d{4}-\d{2}-\d{2}$/.test(sync.last_successful_sync))
    throw new Error('snaptrade_card_sync_incomplete')
  const { data, pagination } = await p.activities(account.id, from, through, 0, 1000)
  if (!Array.isArray(data) || pagination?.offset !== 0 || pagination.total !== data.length ||
      !Number.isSafeInteger(pagination.limit) || pagination.limit < data.length)
    throw new Error('snaptrade_card_pagination_incomplete')
  // Retain the posted rows. A row without a settlement date is not spend.
  const posted = data.filter(row => {
    if (!row.settlement_date) return false
    const day = row.settlement_date.slice(0, 10)
    return day >= from && day <= through
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)))
  console.log(JSON.stringify({
    fetchedAt: new Date().toISOString(), through, from, providerSyncDay: sync.last_successful_sync,
    pending: data.filter(row => !row.settlement_date).length,
    account: { rawType: account.raw_type, id: account.id, product: account.name, maskedSuffix: binding.maskedSuffix },
    pagination: { offset: 0, limit: pagination.limit, total: posted.length }, data: posted,
  }))
} catch (error) {
  const code = error?.message
  console.error(/^snaptrade_card_[a-z_]+$/.test(code ?? '') ? code : 'snaptrade_card_collection_failed')
  process.exitCode = 1
}
