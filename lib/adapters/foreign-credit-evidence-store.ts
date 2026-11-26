import fs from 'node:fs'
import path from 'node:path'
import { config } from '@/config'
import { readForeignCreditFacts } from '@/lib/application/foreign-credit-evidence'

/** Reviewed return facts live with private Observatory state, outside the application checkout. */
export function readForeignCreditEvidence(filePath = path.join(config.finance.stateDir, 'foreign-tax-credit-evidence.json')) {
  try {
    const stat = fs.lstatSync(filePath)
    if (!stat.isFile() || stat.size > 65536) throw new Error('Invalid foreign credit evidence file')
    return readForeignCreditFacts(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}
