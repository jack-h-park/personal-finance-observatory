import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

/**
 * Wide tables hide some columns below `md` (`secondary`) or `xl` (`tertiary`)
 * through `DataTableColumn.priority`; an unset priority means `primary`. A table
 * with six or more columns keeps at most four primary columns.
 *
 * The check reads the page source. A small scanner finds every column array,
 * either `columns={[ ... ]}` or `const columns = [ ... ]`, walks it by bracket
 * depth (skipping string literals), and for each top-level object reads the
 * `key:` and `priority:` that sit at that object's own depth, so nested
 * render functions are not misread. Arrays built any other way (spread,
 * `.map(...)`) are not recognized; `readColumnArrays` throws for an array whose
 * elements are not all object literals, so such a table fails loudly.
 */
const PAGES = [
  'app/reconciliation/page.tsx',
  'app/income/page.tsx',
  'app/rebalance/page.tsx',
  'app/positions/[market]/[ticker]/page.tsx',
]

const ARRAY_START = /\bcolumns\s*=\s*\{?\s*\[|\b(?:const|let)\s+\w*[cC]olumns\w*\s*(?::[^=]+)?=\s*\[/g

type Column = { key: string; priority: string }

function readColumnArrays(source: string): Column[][] {
  const arrays: Column[][] = []
  for (const match of source.matchAll(ARRAY_START)) {
    let i = match.index! + match[0].length
    let depth = 1 // inside the array
    let objectFlat: string | null = null
    let objectDepth = 0
    const columns: Column[] = []
    for (; i < source.length && depth > 0; i += 1) {
      const ch = source[i]
      if (ch === "'" || ch === '"' || ch === '`') {
        let j = i + 1
        while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1
        if (objectFlat !== null && depth === 2) objectFlat += source.slice(i, j + 1)
        i = j
        continue
      }
      if (ch === '[' || ch === '{' || ch === '(') {
        depth += 1
        if (ch === '{' && depth === 2) {
          objectFlat = ''
          objectDepth = depth
        }
        continue
      }
      if (ch === ']' || ch === '}' || ch === ')') {
        if (ch === '}' && depth === objectDepth && objectFlat !== null) {
          const key = /\bkey:\s*['"]([^'"]+)['"]/.exec(objectFlat)?.[1]
          assert.ok(key, `column object without a key: ${objectFlat.slice(0, 60)}`)
          columns.push({ key, priority: /\bpriority:\s*['"](\w+)['"]/.exec(objectFlat)?.[1] ?? 'primary' })
          objectFlat = null
        }
        depth -= 1
        continue
      }
      if (objectFlat !== null && depth === 2) objectFlat += ch
      else if (depth === 1 && !/[\s,]/.test(ch)) {
        throw new Error(`column array element is not an object literal near: ${source.slice(i, i + 40)}`)
      }
    }
    arrays.push(columns)
  }
  return arrays
}

test('the column scanner reads inline arrays and variables, ignoring nested braces', () => {
  const sample = `
    const columns = [
      { key: 'a', label: 'A', render: (r) => { return r.x } },
      { key: 'b', priority: 'secondary', render: (r) => ({ key: 'nested' }) },
    ]
    <DataTable columns={[ { key: 'c' }, { key: 'd', priority: 'tertiary' } ]} />
  `
  assert.deepEqual(readColumnArrays(sample), [
    [
      { key: 'a', priority: 'primary' },
      { key: 'b', priority: 'secondary' },
    ],
    [
      { key: 'c', priority: 'primary' },
      { key: 'd', priority: 'tertiary' },
    ],
  ])
})

for (const page of PAGES) {
  test(`tables with six or more columns hide some below md: ${page}`, () => {
    const arrays = readColumnArrays(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'))
    assert.ok(arrays.length > 0, `${page}: no column arrays found`)
    const wide = arrays.filter((columns) => columns.length >= 6)
    assert.ok(wide.length > 0, `${page}: expected at least one table with six or more columns`)
    for (const columns of wide) {
      const primary = columns.filter((c) => c.priority === 'primary').map((c) => c.key)
      assert.ok(primary.length <= 4, `${page}: ${primary.length} primary columns (${primary.join(', ')})`)
    }
  })
}
