// Canonical source: workspace-governance/docs/ux/kit/react/display-settings.tsx
// The display settings row for the app switcher panel (guidelines D15, D16).
// Same markup and classes as jhp-nav.js renders, so jhp-nav.css styles it.
// Copy to components/studio-ui/; preferences.ts goes to lib/studio-ui/ (like
// format.ts), so lib/ code can read the cookies without importing components/.
'use client'

import { useId, useSyncExternalStore } from 'react'
import {
  DISPLAY_SETTINGS_COPY,
  LANGUAGE_NAMES,
  LANG_COOKIE,
  THEME_COOKIE,
  THEME_PREFERENCES,
  applyTheme,
  parseTheme,
  readCookie,
  writePreference,
  type LanguagePreference,
  type ThemePreference,
} from '@/lib/studio-ui/preferences'


function Choices<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string
  name: string
  options: [T, string][]
  value: T
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="jhp-nav__setting">
      <span className="jhp-nav__setting-label" id={id}>{label}</span>
      <div className="jhp-nav__choices" role="radiogroup" aria-labelledby={id}>
        {options.map(([option, text]) => (
          <label key={option} className="jhp-nav__choice">
            <input
              type="radio"
              name={name}
              value={option}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// The theme cookie as an external store, so the row reads it without setting
// state in an effect (and renders 'system' on the server, then the cookie).
function subscribeTheme(onChange: () => void): () => void {
  document.addEventListener('jhp:preferences', onChange)
  return () => document.removeEventListener('jhp:preferences', onChange)
}
function readThemeCookie(): ThemePreference {
  return parseTheme(readCookie(document.cookie, THEME_COOKIE))
}

/**
 * `languages` lists the catalogs this app has; with fewer than two only the
 * theme control is shown. `onLanguageChange` applies a new language (for
 * example router.refresh() after the server reads the cookie); without it the
 * page reloads. `onThemeChange` applies a new theme for an app that has not
 * moved to the kit's `data-theme="light|dark"` contract yet (for example one
 * that resolves a `.dark` class); without it the kit's applyTheme runs. The
 * cookie is written either way.
 */
export function DisplaySettings({
  locale,
  language,
  languages = [],
  onLanguageChange,
  onThemeChange,
}: {
  locale: LanguagePreference
  language?: LanguagePreference
  languages?: LanguagePreference[]
  onLanguageChange?: (language: LanguagePreference) => void
  onThemeChange?: (theme: ThemePreference) => void
}) {
  const copy = DISPLAY_SETTINGS_COPY[locale]
  const theme = useSyncExternalStore(subscribeTheme, readThemeCookie, () => 'system' as ThemePreference)

  return (
    <div className="jhp-nav__settings" data-jhp-nav-settings="">
      <h2 className="jhp-nav__settings-title">{copy.title}</h2>
      <Choices
        label={copy.theme}
        name="jhp-theme"
        options={THEME_PREFERENCES.map((value) => [value, copy[value]])}
        value={theme}
        onChange={(next) => {
          writePreference(THEME_COOKIE, next)
          if (onThemeChange) onThemeChange(next)
          else applyTheme(next)
          // Also re-renders this row: subscribeTheme listens for the same event.
          document.dispatchEvent(new CustomEvent('jhp:preferences', { detail: { changed: 'theme', theme: next } }))
        }}
      />
      {languages.length > 1 && (
        <Choices
          label={copy.language}
          name="jhp-lang"
          options={languages.map((value) => [value, LANGUAGE_NAMES[value]])}
          value={language ?? locale}
          onChange={(next) => {
            writePreference(LANG_COOKIE, next)
            if (onLanguageChange) onLanguageChange(next)
            else window.location.reload()
          }}
        />
      )}
    </div>
  )
}
