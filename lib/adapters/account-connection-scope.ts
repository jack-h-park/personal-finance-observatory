import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { readUsConnectionScope } from '@/lib/adapters/us-connection-scope'
import { strictIsoDate } from '@/lib/domain/assets/query-coverage'

const MARKETS = ['us', 'kr'] as const
export type ConnectionMarket = (typeof MARKETS)[number]
const OBSERVATIONS = ['shadow', 'pilot', 'limited', 'discovered', 'unreturned', 'existing', 'unknown', 'keep', 'required'] as const
export type ConnectionStatus = (typeof OBSERVATIONS)[number]
type Localized = { en: string; ko: string }
export type ConnectionCell = { status: ConnectionStatus; detail?: Localized }
export type ConnectionSource = 'snaptrade' | 'simplefin' | 'other' | 'files'
export type ConnectionAccount = {
  key: string
  market: ConnectionMarket
  label: Localized
  sources: Partial<Record<ConnectionSource, ConnectionCell>>
}

const FILE_LIMIT = 64 * 1024
const SOURCE_KEYS: readonly ConnectionSource[] = ['snaptrade', 'simplefin', 'other', 'files']
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function localized(value: unknown, max: number, label = false): Localized | null {
  if (!object(value)) return null
  const { en, ko } = value
  const valid = (v: unknown): v is string =>
    typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(v) && (!label || !/\d{4,}/.test(v))
  return valid(en) && valid(ko) ? { en, ko } : null
}

function cell(value: unknown, key: ConnectionSource): ConnectionCell | null {
  if (!object(value) || !OBSERVATIONS.includes(value.status as ConnectionStatus)) return null
  const status = value.status as ConnectionStatus
  if ((key === 'files') !== (status === 'keep' || status === 'required')) return null
  if (value.detail === undefined) return { status }
  const detail = localized(value.detail, 84)
  return detail ? { status, detail } : null
}

function parseAccount(value: unknown): ConnectionAccount | null {
  if (!object(value) || typeof value.key !== 'string' || !/^[a-z][a-z-]{1,55}$/.test(value.key) ||
      !MARKETS.includes(value.market as ConnectionMarket) || !object(value.sources)) return null
  const market = value.market as ConnectionMarket
  const label = localized(value.label, 60, true)
  if (!label) return null
  const sources: ConnectionAccount['sources'] = {}
  for (const key of Object.keys(value.sources)) {
    const source = key as ConnectionSource
    if (!SOURCE_KEYS.includes(source) || (market === 'kr' && (source === 'snaptrade' || source === 'simplefin'))) return null
    const parsed = cell(value.sources[key], source)
    if (!parsed) return null
    sources[source] = parsed
  }
  return sources.files ? { key: value.key, market, label, sources } : null
}

function legacyScope(stateDir: string) {
  const previous = readUsConnectionScope(stateDir)
  if (!previous) return null
  const accounts: ConnectionAccount[] = []
  for (const source of ['snaptrade', 'simplefin'] as const) {
    for (const name of previous[source]) {
      const existing = accounts.find((account) => account.label.en === name)
      if (existing) {
        existing.sources[source] = { status: 'shadow' }
        continue
      }
      accounts.push({
        key: name.toLowerCase().replaceAll(' ', '-'), market: 'us', label: { en: name, ko: name },
        sources: { [source]: { status: 'shadow' }, files: { status: 'keep' } },
      })
    }
  }
  return { reviewedOn: previous.reviewedOn, accounts }
}

export function readAccountConnectionScope(stateDir: string) {
  let fd: number | undefined
  try {
    try {
      fd = openSync(join(stateDir, 'account-connection-scope.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? legacyScope(stateDir) : null
    }
    if (!fstatSync(fd).isFile()) return null
    const buffer = Buffer.alloc(FILE_LIMIT + 1)
    const size = readSync(fd, buffer)
    if (size > FILE_LIMIT) return null
    const value: unknown = JSON.parse(buffer.toString('utf8', 0, size))
    if (!object(value) || value.schemaVersion !== 2 || !Array.isArray(value.accounts) || value.accounts.length > 100) return null
    const reviewedOn = strictIsoDate(value.reviewedOn)
    if (!reviewedOn) return null
    const accounts: ConnectionAccount[] = []
    const seen = new Set<string>()
    for (const entry of value.accounts) {
      const account = parseAccount(entry)
      if (!account || seen.has(account.key)) return null
      seen.add(account.key)
      accounts.push(account)
    }
    return { reviewedOn, accounts }
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
