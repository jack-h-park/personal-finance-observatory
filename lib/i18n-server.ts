import { cookies } from 'next/headers'
import { LANGUAGE_COOKIE, normalizeLanguage, type Language } from '@/lib/i18n'
import { LANG_COOKIE, THEME_COOKIE, parseTheme, themeAttribute } from '@/lib/studio-ui/preferences'

/** The interface language: the jhp_lang cookie every *.jackpark.me app shares (set in the
 *  Studio app bar's display settings row), then this app's older cookie, then the default. */
export async function getLanguage(): Promise<Language> {
  const cookieStore = await cookies()
  return normalizeLanguage(cookieStore.get(LANG_COOKIE)?.value ?? cookieStore.get(LANGUAGE_COOKIE)?.value)
}

/** The <html data-theme> value from the shared jhp_theme cookie; undefined follows the OS.
 *  Rendered by the server, so the first paint already has the chosen theme. */
export async function getThemeAttribute(): Promise<'light' | 'dark' | undefined> {
  const cookieStore = await cookies()
  return themeAttribute(parseTheme(cookieStore.get(THEME_COOKIE)?.value))
}
