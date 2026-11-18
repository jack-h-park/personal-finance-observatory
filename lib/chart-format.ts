import { EMPTY_VALUE, fmtMoney, fmtNumber, fmtPct } from '@/lib/format'
import type { Language } from '@/lib/i18n'

/**
 * What a chart's values measure. Charts take raw values in this unit: money is
 * already in the display currency, so nothing here converts it.
 */
export type ChartUnit =
  | { kind: 'money'; currency: 'KRW' | 'USD' }
  | { kind: 'percent' }
  | { kind: 'number'; suffix?: string }

type Scale = { min: number; div: number; digits: number; label: string }

// Korean reads won in 만 (10^4) and 억 (10^8). These two strings are the only
// Korean outside lib/ui-copy, and the tests assert them verbatim.
const KO_KRW: readonly Scale[] = [
  { min: 0, div: 1, digits: 0, label: '' },
  { min: 1e4, div: 1e4, digits: 0, label: '만' },
  { min: 1e8, div: 1e8, digits: 1, label: '억' },
]

const THOUSANDS: readonly Scale[] = [
  { min: 0, div: 1, digits: 0, label: '' },
  { min: 1e3, div: 1e3, digits: 1, label: 'K' },
  { min: 1e6, div: 1e6, digits: 1, label: 'M' },
]

/** Round a non-negative value half away from zero at `digits` decimals. */
function roundAbs(abs: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(abs * factor) / factor
}

/**
 * The scaled magnitude of `abs` and its unit label. A value whose rounded form
 * reaches the next unit prints in that unit: 999,999 is 1M, not 1,000K.
 */
function scaled(abs: number, scales: readonly Scale[]) {
  let index = 0
  for (let i = 0; i < scales.length; i += 1) if (abs >= scales[i].min) index = i
  let rounded = roundAbs(abs / scales[index].div, scales[index].digits)
  const next = scales[index + 1]
  if (next && rounded * scales[index].div >= next.min) {
    index += 1
    rounded = roundAbs(abs / scales[index].div, scales[index].digits)
  }
  const scale = scales[index]
  return { rounded, body: `${fmtNumber(rounded, scale.digits, 0)}${scale.label}` }
}

/** A short Y-axis tick: `1.2억` / `3,500만` in Korean won, `₩1.2M` / `$350K` otherwise. */
export function axisTick(value: number, unit: ChartUnit, language: Language): string {
  if (!Number.isFinite(value)) return ''
  if (unit.kind === 'percent') return fmtPct(value, { digits: 0 })
  if (unit.kind === 'number') {
    const rounded = Math.sign(value) * roundAbs(Math.abs(value), 0)
    return `${fmtNumber(rounded)}${unit.suffix ?? ''}`
  }
  const korean = unit.currency === 'KRW' && language === 'ko'
  const { rounded, body } = scaled(Math.abs(value), korean ? KO_KRW : THOUSANDS)
  if (rounded === 0) return '0'
  const sign = value < 0 ? '-' : ''
  if (korean) return `${sign}${body}`
  return `${sign}${unit.currency === 'USD' ? '$' : '₩'}${body}`
}

/** The tooltip's value: the full amount, never the shortened tick. */
export function tooltipValue(value: number | null | undefined, unit: ChartUnit, _language: Language): string {
  if (value == null || !Number.isFinite(Number(value))) return EMPTY_VALUE
  const n = Number(value)
  if (unit.kind === 'money') return fmtMoney(n, unit.currency)
  if (unit.kind === 'percent') return fmtPct(n)
  return `${fmtNumber(n, 2, 0)}${unit.suffix ?? ''}`
}

/**
 * Whether any row holds a finite number under one of `keys`. A chart with none
 * has no axis to draw (recharts would scale it from -Infinity), so it shows its
 * empty message instead.
 */
export function hasPlottablePoint(data: Record<string, unknown>[], keys: string[]): boolean {
  return data.some((row) => keys.some((key) => typeof row[key] === 'number' && Number.isFinite(row[key])))
}
