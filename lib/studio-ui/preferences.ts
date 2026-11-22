// Canonical source: workspace-governance/docs/ux/kit/react/preferences.ts
// Display preferences shared by every *.jackpark.me app (guidelines D15, D16).
// The same contract as jhp-nav.js: cookies on the parent domain, and the
// applied theme as <html data-theme="light|dark"> (none = follow the OS).
// Framework-free, so a server component can parse the cookie header too.

export type ThemePreference = 'system' | 'light' | 'dark'
export type LanguagePreference = 'ko' | 'en'

export const THEME_COOKIE = 'jhp_theme'
export const LANG_COOKIE = 'jhp_lang'
export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark']
export const LANGUAGE_PREFERENCES: LanguagePreference[] = ['ko', 'en']
const PARENT_DOMAIN = 'jackpark.me'

export function parseTheme(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function parseLanguage(value: string | null | undefined): LanguagePreference | null {
  return value === 'ko' || value === 'en' ? value : null
}

/** The display settings row's copy. Kept here, not in the component, so apps whose
 *  guardrails forbid Korean literals in components/ can still copy the kit unchanged. */
export const DISPLAY_SETTINGS_COPY = {
  ko: { title: '표시 설정', theme: '테마', system: '시스템', light: '라이트', dark: '다크', language: '언어' },
  en: { title: 'Display', theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark', language: 'Language' },
} as const

/** The Studio app bar's own labels (StudioAppBar in studio-app-bar.tsx). */
export const APP_BAR_COPY = {
  ko: { landmark: 'Studio 앱', launcher: 'Studio 앱 홈', apps: '앱', display: '표시 설정', crumbs: '현재 위치' },
  en: { landmark: 'Studio apps', launcher: 'Studio apps home', apps: 'Apps', display: 'Display settings', crumbs: 'You are here' },
} as const

/** Each language named in itself. */
export const LANGUAGE_NAMES: Record<LanguagePreference, string> = { ko: '한국어', en: 'English' }

/** The value for <html data-theme>, or undefined to follow the OS. */
export function themeAttribute(theme: ThemePreference): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme
}

/** Reads one cookie from a Cookie header or document.cookie string. */
export function readCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/** Browser only: stores a preference for every *.jackpark.me app. */
export function writePreference(name: typeof THEME_COOKIE | typeof LANG_COOKIE, value: string): void {
  const host = window.location.hostname
  const domain = host === PARENT_DOMAIN || host.endsWith(`.${PARENT_DOMAIN}`) ? `; Domain=${PARENT_DOMAIN}` : ''
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`
}

/** Browser only. */
export function applyTheme(theme: ThemePreference): void {
  const value = themeAttribute(theme)
  if (value) document.documentElement.setAttribute('data-theme', value)
  else document.documentElement.removeAttribute('data-theme')
}

/** The same pre-paint snippet as jhp-theme-boot.js, for an inline <script>. */
export const THEME_BOOT_SCRIPT =
  '(function(){try{var m=document.cookie.match(/(?:^|; )jhp_theme=(light|dark)(?:;|$)/);' +
  'if(m)document.documentElement.setAttribute("data-theme",m[1]);}catch(e){}})();'
