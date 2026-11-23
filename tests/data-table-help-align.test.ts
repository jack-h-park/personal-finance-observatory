import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

/**
 * A header's help panel is 288px wide. Centred on the last column it hung past
 * the table's right edge and widened the scroll area; inheriting the header's
 * nowrap, its text ran out of the panel as one line. /holdings showed both once
 * its status column, which carries help, became the last column.
 */
async function headerPanels() {
  const { DataTable } = await import('../components/DataTable')
  const html = renderToStaticMarkup(
    React.createElement(DataTable, {
      rows: [{ id: 'a', x: 1, y: 2, w: 4, z: 3 }],
      columns: [
        { key: 'x', label: 'X', description: 'first help', nowrap: true },
        { key: 'y', label: 'Y', description: 'middle help', nowrap: true },
        { key: 'w', label: 'W', description: 'figure help', nowrap: true, align: 'right' as const },
        { key: 'z', label: 'Z', description: 'last help', nowrap: true },
      ],
    })
  )
  return [...html.matchAll(/<span[^>]*role="tooltip"[^>]*class="([^"]*)"[^>]*>(\w+) help/g)].map((m) => ({ which: m[2], cls: m[1] }))
}

test('edge columns and right-aligned figures open their help inward; other columns centre it', async () => {
  const panels = await headerPanels()
  assert.equal(panels.length, 4)
  const cls = Object.fromEntries(panels.map((p) => [p.which, p.cls]))
  assert.match(cls.first, /md:left-0/)
  assert.match(cls.middle, /md:left-1\/2/)
  assert.match(cls.figure, /md:right-0/)
  assert.match(cls.last, /md:right-0/)
})

test('help text wraps inside its panel even under a nowrap header', async () => {
  for (const panel of await headerPanels()) assert.match(panel.cls, /whitespace-normal/, panel.which)
})
