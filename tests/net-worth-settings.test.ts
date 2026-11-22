import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  DEFAULT_NET_WORTH_SETTINGS,
  getNetWorthSettingsState,
  parseNetWorthSettings,
  resetNetWorthSettings,
  saveNetWorthSettings,
  thresholdsFrom,
} from '../lib/net-worth-settings'
import { DEFAULT_THRESHOLDS, nonInvestmentMonths, type MonthEnd } from '../lib/non-investment-change'

// The sizes that make a month worth a look, as the reader sets them. Invented figures, in won.

const tmpFile = () => path.join(mkdtempSync(path.join(tmpdir(), 'nw-settings-')), 'net-worth-settings.json')

test('the defaults are the thresholds the flagging ships with', () => {
  assert.deepEqual(thresholdsFrom(DEFAULT_NET_WORTH_SETTINGS), DEFAULT_THRESHOLDS)
})

test('whole numbers inside the ranges are accepted, anything else is named by its field', () => {
  const ok = parseNetWorthSettings({ checkMillionKrw: '40', watchMillionKrw: '10', streakMonths: '4', pairNetPercent: '25' })
  assert.deepEqual(ok.errors, [])
  assert.deepEqual(ok.settings, { checkMillionKrw: 40, watchMillionKrw: 10, streakMonths: 4, pairNetPercent: 25 })
  const bad = parseNetWorthSettings({ checkMillionKrw: 'abc', watchMillionKrw: '', streakMonths: '1', pairNetPercent: '25.5' })
  assert.deepEqual(
    bad.errors.map((e) => [e.field, e.code]),
    [['checkMillionKrw', 'not_a_number'], ['watchMillionKrw', 'not_a_number'], ['streakMonths', 'out_of_range'], ['pairNetPercent', 'not_a_number']]
  )
})

test('the size for a single month cannot be below the size for pairs and streaks', () => {
  const { errors } = parseNetWorthSettings({ checkMillionKrw: 10, watchMillionKrw: 20, streakMonths: 3, pairNetPercent: 35 })
  assert.deepEqual(errors, [{ code: 'check_below_watch', field: 'checkMillionKrw' }])
})

test('absent file means the defaults; saved settings are read back; reset removes the file', () => {
  const file = tmpFile()
  assert.deepEqual(getNetWorthSettingsState(file), { settings: DEFAULT_NET_WORTH_SETTINGS, path: file, custom: false, error: null })
  saveNetWorthSettings({ checkMillionKrw: 50, watchMillionKrw: 20, streakMonths: 4, pairNetPercent: 30 }, file)
  const state = getNetWorthSettingsState(file)
  assert.equal(state.custom, true)
  assert.equal(state.settings.checkMillionKrw, 50)
  resetNetWorthSettings(file)
  assert.equal(getNetWorthSettingsState(file).custom, false)
})

test('an unreadable or invalid file falls back to the defaults and says why', () => {
  const file = tmpFile()
  writeFileSync(file, '{ not json')
  const broken = getNetWorthSettingsState(file)
  assert.equal(broken.custom, false)
  assert.ok(broken.error)
  writeFileSync(file, JSON.stringify({ checkMillionKrw: 5, watchMillionKrw: 20 }))
  const invalid = getNetWorthSettingsState(file)
  assert.deepEqual(invalid.settings, DEFAULT_NET_WORTH_SETTINGS)
  assert.match(invalid.error ?? '', /check_below_watch/)
  // The file itself is left as it was: reading never writes.
  assert.match(readFileSync(file, 'utf8'), /"checkMillionKrw":5/)
})

test('the thresholds change which months are flagged, not their values', () => {
  const M = 1_000_000
  let total = 1_000 * M
  const rows: MonthEnd[] = [0, 20 * M, 3 * M].map((delta, index) => {
    total += delta
    const month = `2026-${String(index + 1).padStart(2, '0')}`
    return { month, date: `${month}-28`, total, pensions: null }
  })
  const flat = rows.map((row) => ({ date: row.date, unrealized: 0, realized: 0 }))
  const standard = nonInvestmentMonths(rows, flat)
  const strict = nonInvestmentMonths(rows, flat, thresholdsFrom({ ...DEFAULT_NET_WORTH_SETTINGS, checkMillionKrw: 20, watchMillionKrw: 10 }))
  assert.equal(standard[1].flag, null)
  assert.equal(strict[1].flag, 'check')
  assert.equal(strict[1].value, standard[1].value)
})
