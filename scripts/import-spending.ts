import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { resolveFinancePaths } from './finance-paths.mjs'
import { normalizeSpendingBatch, readSpendingCsv, spendingAccountIds } from '../lib/domain/spending-import'
import { importSpending } from '../lib/adapters/spending-store'
import { loadSpendingWorkbooks } from '../lib/adapters/spending-workbooks'
import { loadSimplefinSpending } from '../lib/adapters/spending-simplefin'
import { loadSnaptradeChaseSpending } from '../lib/adapters/spending-snaptrade'

async function main() {
  const { values } = parseArgs({ options: {
    workspace: { type: 'string' }, accounts: { type: 'string' }, input: { type: 'string' },
    source: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
    banksalad: { type: 'string' }, binding: { type: 'string' },
    'chase-csv': { type: 'string' },
    'simplefin-config': { type: 'string' }, 'connector-repo': { type: 'string' }, decisions: { type: 'string' },
    apply: { type: 'boolean' }, 'review-token': { type: 'string' },
  } })
  if (!values.workspace || !values.accounts || !values.input || !path.isAbsolute(values.workspace)) {
    throw new Error('--workspace ABSOLUTE_DIR, --accounts FILE, and --input FILE are required')
  }
  const token = values['review-token']
  if (values.apply ? !/^[a-f0-9]{64}$/.test(token ?? '') : token !== undefined) {
    throw new Error('--apply requires the --review-token from preview')
  }
  // Pilot-only roots. Ignore installed configuration and never load .env.local.
  const workspace = fs.realpathSync(values.workspace)
  const roots = resolveFinancePaths({ NODE_ENV: 'test', FINANCE_MODE: 'sample' }, workspace)
  const format = path.extname(values.input).toLowerCase().slice(1)
  const simplefin = [values['simplefin-config'], values['connector-repo'], values.decisions].some(value => value !== undefined)
  const snaptrade = values['chase-csv'] !== undefined
  const offline = format === 'xlsx' || simplefin || snaptrade
  const storage = offline ? path.join(workspace, 'private-data/personal-finance-offline') : path.dirname(roots.recordsDir)
  const state = path.join(storage, 'state')
  const records = path.join(storage, 'records')
  const ledgerPath = path.join(state, 'spending.sqlite')
  const recordsDir = path.join(records, 'spending')
  for (const part of [path.join(workspace, 'private-data'), storage, state, records, recordsDir, ledgerPath]) {
    if (fs.lstatSync(part, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('symlink_in_workspace')
  }
  const inventory = fs.readFileSync(values.accounts)
  const accountIds = spendingAccountIds(JSON.parse(inventory.toString('utf8')))
  const common = {
    ledgerPath, recordsDir, reviewToken: token,
    inventorySha256: createHash('sha256').update(inventory).digest('hex'),
  }
  if (snaptrade) {
    if (format !== 'json' || !values['chase-csv'] || !values.binding || simplefin ||
        [values.source, values.from, values.to, values.banksalad].some(value => value !== undefined)) {
      throw new Error('--chase-csv FILE and --binding FILE require a saved SnapTrade card JSON as --input')
    }
    const input = loadSnaptradeChaseSpending({
      snapshot: values.input, chaseCsv: values['chase-csv'], binding: values.binding, accountIds,
    })
    console.log(JSON.stringify(importSpending({ ...common, ...input }), null, 2))
  } else if (simplefin) {
    if (format !== 'json' || !values['simplefin-config'] || !values['connector-repo'] || !values.binding ||
        [values.source, values.from, values.to, values.banksalad].some(value => value !== undefined)) {
      throw new Error('--simplefin-config FILE, --connector-repo DIR, --binding FILE, and a SimpleFIN JSON pointer are required')
    }
    const input = await loadSimplefinSpending({
      pointer: values.input, config: values['simplefin-config'], connectorRepo: values['connector-repo'],
      binding: values.binding, decisions: values.decisions, accountIds,
    })
    console.log(JSON.stringify(importSpending({ ...common, ...input }), null, 2))
  } else if (format === 'xlsx') {
    if (!values.banksalad || !values.binding || values.source !== undefined) {
      throw new Error('--input XLSX requires --banksalad FILE, --binding FILE, and the BankSalad --from and --to dates')
    }
    const input = loadSpendingWorkbooks({
      samsung: values.input, banksalad: values.banksalad, binding: values.binding,
      from: values.from, to: values.to, accountIds,
    })
    console.log(JSON.stringify(importSpending({ ...common, ...input }), null, 2))
  } else {
    if (values.banksalad !== undefined || values.binding !== undefined) throw new Error('invalid_workbook_options')
    const bytes = fs.readFileSync(values.input)
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    let input: unknown
    if (format === 'csv') {
      input = { schemaVersion: 1, mode: 'synthetic', status: 'complete', source: values.source,
        periodStart: values.from, periodEnd: values.to, transactions: readSpendingCsv(body) }
    } else if (format === 'json' && ![values.source, values.from, values.to].some(value => value !== undefined)) {
      input = JSON.parse(body)
    } else throw new Error('use CSV with --source --from --to or a synthetic JSON batch')
    const batch = normalizeSpendingBatch(input, accountIds)
    console.log(JSON.stringify(importSpending({ ...common, batch, bytes, format }), null, 2))
  }
}

main().catch((error: unknown) => {
  // System errors and JSON parse exceptions can contain private paths or values.
  const message = (error as Error).message
  const safe = /^(?:row_\d+: )?[a-z_]+$/.test(message) || message.startsWith('--') ||
    message === 'use CSV with --source --from --to or a synthetic JSON batch'
  console.error(safe ? message : 'unreadable_spending_input_or_store')
  process.exitCode = 1
})
