import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RangeSelectForm } from '../components/RangeSelectForm'
;(globalThis as { React?: typeof React }).React = React

const render = (keep: Record<string, string>) =>
  renderToStaticMarkup(
    React.createElement(RangeSelectForm, {
      dates: ['2026-01-31', '2026-02-28', '2026-03-31'],
      from: '2026-02-28',
      to: null,
      keep,
      labels: { from: 'From', to: 'To', submit: 'Show' },
    }),
  )

test('form is a GET with both selects and the current params as hidden inputs', () => {
  const html = render({ range: '6m', lang: 'en', from: 'stale', to: 'stale' })
  assert.match(html, /<form[^>]*method="get"/)
  assert.match(html, /<form[^>]*action="\/net-worth"/)
  assert.match(html, /<select[^>]*name="from"/)
  assert.match(html, /<select[^>]*name="to"/)
  assert.match(html, /<input[^>]*type="hidden"[^>]*name="range"[^>]*value="6m"/)
  assert.match(html, /<input[^>]*type="hidden"[^>]*name="lang"[^>]*value="en"/)
  assert.doesNotMatch(html, /type="hidden"[^>]*name="(from|to)"/)
  assert.match(html, /<button[^>]*type="submit"/)
})

test('selects default to the selection, else the first and last date', () => {
  const html = render({})
  assert.match(html, /<option value="2026-02-28" selected=""/)
  assert.match(html, /<option value="2026-03-31" selected=""/)
})

test('the form is keyed by the period, so a client-side navigation remounts the selects', () => {
  const props = { dates: ['2026-01-31', '2026-02-28'], keep: {}, labels: { from: 'From', to: 'To', submit: 'Show' } }
  const a = RangeSelectForm({ ...props, from: '2026-01-31', to: '2026-02-28' }) as React.ReactElement
  const b = RangeSelectForm({ ...props, from: null, to: null }) as React.ReactElement
  assert.equal(a.type, 'form')
  assert.equal(a.key, '2026-01-31:2026-02-28')
  assert.equal(b.key, ':')
})

test('describedBy ties the form to the caller\'s help text', () => {
  const html = renderToStaticMarkup(
    React.createElement(RangeSelectForm, {
      dates: ['2026-01-31'],
      from: null,
      to: null,
      keep: {},
      labels: { from: 'From', to: 'To', submit: 'Show' },
      describedBy: 'hint',
    }),
  )
  assert.match(html, /<form[^>]*aria-describedby="hint"/)
})
