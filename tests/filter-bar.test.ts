import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { FilterBar } from '@/components/FilterBar'

// tsx compiles JSX with the classic runtime, which reads a global React.
;(globalThis as { React?: typeof React }).React = React

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
]

test('a countsAsFilter:false group does not add to the folded summary count', () => {
  const html = renderToStaticMarkup(
    React.createElement(FilterBar, {
      basePath: '/x',
      params: {},
      groups: [
        { key: 'view', label: 'View', options, selected: 'b', defaultValue: 'a', countsAsFilter: false },
        { key: 'kind', label: 'Kind', options, selected: 'b', defaultValue: 'a' },
      ],
    })
  )
  assert.match(html, /\(1\)/)
  assert.doesNotMatch(html, /\(2\)/)
})

test('a separated group carries a rule above it; the others do not', () => {
  const html = renderToStaticMarkup(
    React.createElement(FilterBar, {
      basePath: '/x',
      params: {},
      groups: [
        { key: 'kind', label: 'Kind', options, selected: 'a', defaultValue: 'a' },
        { key: 'rows', label: 'Rows', options, selected: 'a', defaultValue: 'a', countsAsFilter: false, separated: true },
      ],
    })
  )
  const groupTag = (name: string) => html.match(new RegExp(`<div role="group" aria-label="${name}" class="([^"]*)"`))?.[1] ?? ''
  assert.match(groupTag('Rows'), /\bborder-t\b/)
  assert.doesNotMatch(groupTag('Kind'), /\bborder-t\b/)
})

test('choosing the default option of a view group drops its param', () => {
  const html = renderToStaticMarkup(
    React.createElement(FilterBar, {
      basePath: '/x',
      params: { group: 'b' },
      groups: [{ key: 'group', label: 'Rows', options, selected: 'b', defaultValue: 'a', countsAsFilter: false, separated: true }],
    })
  )
  assert.match(html, /href="\/x"/)
  assert.match(html, /href="\/x\?group=b"/)
})
