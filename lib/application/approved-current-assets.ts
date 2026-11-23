import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { summarizeFinanceAssets, type AssetObservation } from '@/lib/domain/assets/overview'

export const approvedCurrentAssetsFile = 'approved-current-assets.json'
const maxBytes = 128 * 1024
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 250 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value)
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const date = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const key = (accountId: string, assetKey: string) => JSON.stringify([accountId, assetKey])

function readApproved(stateDir: string): unknown {
  let fd: number | undefined
  try {
    fd = openSync(join(stateDir, approvedCurrentAssetsFile), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const info = fstatSync(fd)
    if (!info.isFile() || info.size > maxBytes || (info.mode & 0o077) !== 0) return undefined
    return JSON.parse(readFileSync(fd, 'utf8'))
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function applyApprovedCurrentAssets(
  observations: AssetObservation[], rate: number | null, stateDir: string | undefined,
): { observations: AssetObservation[]; approvedConnectorRows: number } {
  const existing = { observations, approvedConnectorRows: 0 }
  if (!stateDir || rate == null) return existing
  const approved = readApproved(stateDir) as { schemaVersion?: unknown; observations?: unknown } | undefined
  if (approved?.schemaVersion !== 1 || !Array.isArray(approved.observations) ||
      approved.observations.length === 0 || approved.observations.length > 500) return existing
  const active = new Map(summarizeFinanceAssets(observations).included.map(row => [key(row.accountId, row.assetKey), row]))
  const replacements = new Map<string, AssetObservation>()
  const seen = new Set<string>()
  for (const row of approved.observations) {
    if (!row || !text(row.institution) || !text(row.account) || !date(row.asOf) ||
        typeof row.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sourceSha256)) return existing
    const cash = row.kind === 'cash'
    if (cash ? !number(row.amount) || row.ticker !== undefined
      : row.kind !== 'holding' || !number(row.quantity) || !text(row.ticker) || row.amount !== undefined) return existing
    const target = key(JSON.stringify([row.institution, row.account]),
      cash ? 'cash:USD' : JSON.stringify(['US', row.ticker]))
    if (seen.has(target)) return existing
    seen.add(target)
    const before = active.get(target)
    if (!before || before.currency !== 'USD' || before.owner !== 'self' ||
        before.assetClass !== (cash ? 'cash' : 'stocks') || before.valueKrw == null) return existing
    // A later issuer observation supersedes a previously approved point-in-time snapshot.
    if (before.asOf && before.asOf > row.asOf) continue
    if (cash) {
      replacements.set(target, { ...before, approvedConnector: true, asOf: row.asOf, valueKrw: row.amount * rate,
        nativeAmount: row.amount, method: 'snapshot', derived: false })
    } else {
      if (!before.quantity || before.quantity <= 0) return existing
      const factor = row.quantity / before.quantity
      const valueKrw = before.valueKrw * factor
      const nativeAmount = before.nativeAmount == null ? undefined : before.nativeAmount * factor
      if (!Number.isFinite(valueKrw) || (nativeAmount !== undefined && !Number.isFinite(nativeAmount))) return existing
      // Keep the market quote and its valuation date. The connector supplies quantity only.
      replacements.set(target, { ...before, approvedConnector: true, quantity: row.quantity, valueKrw, nativeAmount })
    }
  }
  if (!replacements.size) return existing
  return {
    observations: [...observations.filter(row => row.owner !== 'self' || !replacements.has(key(row.accountId, row.assetKey))),
      ...replacements.values()],
    approvedConnectorRows: replacements.size,
  }
}
