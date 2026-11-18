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
