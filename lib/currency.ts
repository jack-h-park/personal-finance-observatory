import { formatUsdAmount } from './studio-ui/format'

export const DISPLAY_CURRENCIES = ['KRW', 'USD'] as const
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]

export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = 'KRW'
export const DISPLAY_CURRENCY_COOKIE = 'stock-observatory-display-currency'

export type CurrencyPreferences = {
  displayCurrency: DisplayCurrency
  usdKrwRate: number | null
}

export function normalizeDisplayCurrency(value: unknown): DisplayCurrency {
  return value === 'USD' ? 'USD' : DEFAULT_DISPLAY_CURRENCY
}

/**
 * The minus sign goes before the symbol, not after it.
 *
 * These used to interpolate the signed number straight after the symbol, so a
 * loss rendered as "₩-15,730,402" — the sign buried a character deep, where it
 * is easy to miss on a dense table row. Formatting the magnitude and placing
 * the sign in front is both conventional and easier to scan, and it lets
 * <Signed> prefix a "+" the same way for the other direction.
 */
export function formatKrw(value: number | null | undefined) {
  const n = Number(value ?? 0)
  const rounded = Math.round(n)
  return `${rounded < 0 ? '-' : ''}₩${Math.abs(rounded).toLocaleString('ko-KR')}`
}

export function formatUsd(value: number | null | undefined) {
  return formatUsdAmount(Number(value ?? 0))
}

export function convertMoney(value: number, fromCurrency: string, displayCurrency: DisplayCurrency, usdKrwRate: number | null) {
  const from = fromCurrency.toUpperCase()
  if (from === displayCurrency) return { value, currency: displayCurrency }
  if (!usdKrwRate || usdKrwRate <= 0) return { value, currency: from }
  if (from === 'KRW' && displayCurrency === 'USD') return { value: value / usdKrwRate, currency: 'USD' }
  if (from === 'USD' && displayCurrency === 'KRW') return { value: value * usdKrwRate, currency: 'KRW' }
  return { value, currency: from }
}

/**
 * An amount in its own currency, never converted.
 *
 * createMoneyFormatter converts every amount into the display currency, which
 * is right for a figure the reader compares across rows. A column that exists
 * to show the native figure (a USD cost basis, a USD dividend) must not go
 * through it: with a KRW preference and a known USD/KRW rate, the USD amount
 * came out in won, and a native-over-base cell showed the same won figure on
 * both lines.
 */
export function formatMoneyIn(value: number | null | undefined, currency: string | null | undefined = 'KRW') {
  const n = Number(value ?? 0)
  const code = (currency || 'KRW').toUpperCase()
  if (code === 'KRW') return formatKrw(n)
  if (code === 'USD') return formatUsd(n)
  return `${n.toLocaleString('en-US')} ${code}`
}

/**
 * Whether a native-over-base cell needs its second line.
 *
 * The first line is the native amount in its own currency; the second is the
 * KRW base amount in the display currency. When the second line would land in
 * the native currency anyway (a KRW row under a KRW preference, a USD row
 * under a USD preference, or no rate to convert with), it would repeat the
 * first line, so it is left out.
 */
export function needsDisplayLine(nativeCurrency: string | null | undefined, { displayCurrency, usdKrwRate }: CurrencyPreferences) {
  const native = (nativeCurrency || 'KRW').toUpperCase()
  return convertMoney(0, 'KRW', displayCurrency, usdKrwRate).currency !== native
}

export function createMoneyFormatter({ displayCurrency, usdKrwRate }: CurrencyPreferences) {
  return (value: number | null | undefined, currency: string | null | undefined = 'KRW') => {
    const n = Number(value ?? 0)
    const code = (currency || 'KRW').toUpperCase()
    const converted = convertMoney(n, code, displayCurrency, usdKrwRate)
    return formatMoneyIn(converted.value, converted.currency)
  }
}
