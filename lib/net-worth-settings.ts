import fs from 'node:fs'
import path from 'node:path'
import { config } from '@/config'
import { DEFAULT_THRESHOLDS, type Thresholds } from '@/lib/non-investment-change'

/**
 * What sizes make a month's change beyond investing worth a look (lib/non-investment-change.ts),
 * as the reader sets them on /net-worth/settings. Won amounts are in millions, so the form
 * reads "30" for ₩30M. Absent file, absent field or an unreadable file all mean the defaults.
 *
 * The file is owned by the host that serves the app, like tax-policy.json: the app writes it,
 * push-sources never carries it.
 */
export type NetWorthSettings = {
  checkMillionKrw: number
  watchMillionKrw: number
  streakMonths: number
  pairNetPercent: number
}

export const DEFAULT_NET_WORTH_SETTINGS: NetWorthSettings = {
  checkMillionKrw: DEFAULT_THRESHOLDS.checkKrw / 1_000_000,
  watchMillionKrw: DEFAULT_THRESHOLDS.watchKrw / 1_000_000,
  streakMonths: DEFAULT_THRESHOLDS.streakMonths,
  pairNetPercent: DEFAULT_THRESHOLDS.pairNetShare * 100,
}

export const FIELD_LIMITS = {
  watchMillionKrw: { min: 1, max: 1_000 },
  checkMillionKrw: { min: 1, max: 10_000 },
  streakMonths: { min: 2, max: 12 },
  pairNetPercent: { min: 5, max: 100 },
} as const

export type SettingsErrorCode = 'not_a_number' | 'out_of_range' | 'check_below_watch' | 'write_failed'
export type SettingsError = { code: SettingsErrorCode; field?: keyof NetWorthSettings }

const FIELDS = Object.keys(DEFAULT_NET_WORTH_SETTINGS) as (keyof NetWorthSettings)[]

/** Whole numbers inside each field's range, and the check size not below the watch size. */
export function parseNetWorthSettings(input: Partial<Record<keyof NetWorthSettings, unknown>>): { settings: NetWorthSettings; errors: SettingsError[] } {
  const errors: SettingsError[] = []
  const settings = { ...DEFAULT_NET_WORTH_SETTINGS }
  for (const field of FIELDS) {
    const raw = input[field]
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      errors.push({ code: 'not_a_number', field })
      continue
    }
    const value = Number(String(raw).replace(/,/g, '').trim())
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      errors.push({ code: 'not_a_number', field })
      continue
    }
    const { min, max } = FIELD_LIMITS[field]
    if (value < min || value > max) {
      errors.push({ code: 'out_of_range', field })
      continue
    }
    settings[field] = value
  }
  if (!errors.length && settings.checkMillionKrw < settings.watchMillionKrw) errors.push({ code: 'check_below_watch', field: 'checkMillionKrw' })
  return { settings, errors }
}

export function settingsFromFormData(formData: FormData) {
  return parseNetWorthSettings(Object.fromEntries(FIELDS.map((field) => [field, formData.get(field)])))
}

export type NetWorthSettingsState = { settings: NetWorthSettings; path: string; custom: boolean; error: string | null }

/** The saved settings, or the defaults when there is no file or it cannot be read (the reason is returned). */
export function getNetWorthSettingsState(filePath = config.stockNetWorthSettingsPath): NetWorthSettingsState {
  if (!fs.existsSync(filePath)) return { settings: DEFAULT_NET_WORTH_SETTINGS, path: filePath, custom: false, error: null }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<Record<keyof NetWorthSettings, unknown>>
    const { settings, errors } = parseNetWorthSettings({ ...DEFAULT_NET_WORTH_SETTINGS, ...raw })
    if (errors.length) return { settings: DEFAULT_NET_WORTH_SETTINGS, path: filePath, custom: false, error: errors.map((e) => `${e.field ?? ''}:${e.code}`).join(', ') }
    return { settings, path: filePath, custom: true, error: null }
  } catch (error) {
    return { settings: DEFAULT_NET_WORTH_SETTINGS, path: filePath, custom: false, error: (error as Error).message }
  }
}

export function getNetWorthSettings(): NetWorthSettings {
  return getNetWorthSettingsState().settings
}

export function thresholdsFrom(settings: NetWorthSettings): Thresholds {
  return {
    checkKrw: settings.checkMillionKrw * 1_000_000,
    watchKrw: settings.watchMillionKrw * 1_000_000,
    streakMonths: settings.streakMonths,
    pairNetShare: settings.pairNetPercent / 100,
  }
}

/** Written atomically, so a reader never sees half a file. */
export function saveNetWorthSettings(settings: NetWorthSettings, filePath = config.stockNetWorthSettingsPath): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`)
  fs.renameSync(temporaryPath, filePath)
}

/** Back to the defaults by removing the file, so the defaults can change without a stale copy left behind. */
export function resetNetWorthSettings(filePath = config.stockNetWorthSettingsPath): void {
  fs.rmSync(filePath, { force: true })
}
