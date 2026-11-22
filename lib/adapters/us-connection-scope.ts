import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { strictIsoDate } from '@/lib/domain/assets/query-coverage'

const PRODUCTS = {
  snaptrade: {
    fidelity: 'Fidelity Brokerage',
    'fidelity-cma': 'Fidelity CMA',
    'chase-self-directed': 'Chase Self-Directed',
  },
  simplefin: {
    'chase-checking': 'Chase Checking',
    'amex-checking': 'Amex Checking',
    'amex-savings': 'Amex Savings',
    'boa-checking': 'Bank of America Checking',
  },
}

function productLabels(values: unknown, labels: Record<string, string>): string[] | null {
  if (!Array.isArray(values)) return null
  const keys = new Set<keyof typeof labels>()
  for (const value of values) {
    if (typeof value !== 'string' || !Object.hasOwn(labels, value) || keys.has(value)) return null
    keys.add(value)
  }
  return Array.from(keys, (key) => labels[key])
}

export function readUsConnectionScope(stateDir: string) {
  let fd: number | undefined
  try {
    const file = join(stateDir, 'us-connection-scope.json')
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    if (!fstatSync(fd).isFile()) return null
    const buffer = Buffer.alloc(1025)
    const length = readSync(fd, buffer)
    if (length > 1024) return null

    const data = JSON.parse(buffer.toString('utf8', 0, length))
    if (data?.schemaVersion !== 1) return null
    const reviewedOn = strictIsoDate(data.reviewedOn)
    const snaptrade = productLabels(data.snaptrade, PRODUCTS.snaptrade)
    const simplefin = productLabels(data.simplefin, PRODUCTS.simplefin)
    return reviewedOn && snaptrade && simplefin ? { reviewedOn, snaptrade, simplefin } : null
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
