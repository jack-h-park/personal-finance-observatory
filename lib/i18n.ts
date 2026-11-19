export const LANGUAGES = ['en', 'ko'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'ko'
export const LANGUAGE_COOKIE = 'stock-observatory-language'

export function normalizeLanguage(value: unknown): Language {
  return value === 'en' || value === 'ko' ? value : DEFAULT_LANGUAGE
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ko: '한국어',
}
