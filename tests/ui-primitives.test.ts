import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { CardRow, MiniStat, MiniStatGrid, Split, Stat, StatStrip, Total, TotalsStrip } from '@/components/layout'
import { ProgressBar, ShareBar } from '@/components/bars'
import { PositionCell } from '@/components/PositionCell'
import { Badge, Callout, Card, MetricHeroCard, FormError, FormSaved, HeroAside, MetricField, Note, Panel, SectionHeading } from '@/components/ui'
import { LinkChip, LinkChips } from '@/components/LinkChips'
import { Tabs } from '@/components/Tabs'
import { OperatorDetails } from '@/components/OperatorDetails'
import { PageHeader } from '@/components/PageHeader'
import { routeName, routeSection } from '@/lib/page-names'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'

// tsx compiles the component's JSX with the classic runtime, which reads a
// global React; Next supplies it in the app, so the test does here.
;(globalThis as { React?: typeof React }).React = React

const h = React.createElement

/** The class attribute of the element whose text is exactly `text`. */
function classOfText(html: string, text: string): string | undefined {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`<div class="([^"]*)">${escaped}</div>`))
  return match?.[1]
}

const BASE = 'mt-1 font-medium leading-tight tabular-nums'

test('MetricField value defaults to the title size and neutral ink', () => {
  const html = renderToStaticMarkup(h(MetricField, { label: 'L', value: 'V' }))
  assert.equal(classOfText(html, 'V'), `${BASE} text-title text-ink`)
})

test('MetricField size="metric" emits text-metric', () => {
  const html = renderToStaticMarkup(h(MetricField, { label: 'L', value: 'V', size: 'metric' }))
  assert.equal(classOfText(html, 'V'), `${BASE} text-metric text-ink`)
})

test('MetricField size="caption" emits text-caption', () => {
  const html = renderToStaticMarkup(h(MetricField, { label: 'L', value: 'V', size: 'caption' }))
  assert.equal(classOfText(html, 'V'), `${BASE} text-caption text-ink`)
})

test('MetricField truncate adds truncate before the tone class', () => {
  const html = renderToStaticMarkup(h(MetricField, { label: 'L', value: 'V', truncate: true }))
  assert.equal(classOfText(html, 'V'), `${BASE} text-title truncate text-ink`)
})

test('MetricField tone="success" ends in text-success', () => {
  const html = renderToStaticMarkup(h(MetricField, { label: 'L', value: 'V', tone: 'success' }))
  assert.equal(classOfText(html, 'V'), `${BASE} text-title text-success`)
})

test('HeroAside joins two children with one divider and ends with the note', () => {
  const html = renderToStaticMarkup(
    h(HeroAside, {
      title: 'T',
      note: 'N',
      children: [
        h(MetricField, { key: 'a', label: 'A', value: 'VA', size: 'metric' }),
        h(MetricField, { key: 'b', label: 'B', value: 'VB' }),
      ],
    })
  )
  const outer = '<div class="flex min-h-[16rem] flex-col justify-between gap-4"><div class="space-y-4">'
  assert.ok(html.includes(outer), html)
  const dividers = html.match(/<div class="h-px bg-line-subtle"><\/div>/g) ?? []
  assert.equal(dividers.length, 1)
  const a = html.indexOf('>VA<')
  const divider = html.indexOf('<div class="h-px bg-line-subtle">')
  const b = html.indexOf('>VB<')
  assert.ok(a < divider && divider < b, 'divider sits between the two children')
  assert.ok(
    html.includes(
      '</div><div class="rounded-md bg-surface px-3 py-2 text-label leading-relaxed text-ink-3">N</div></div>'
    ),
    html
  )
})

/** The class attribute of the outermost element. */
function outerClass(html: string): string | undefined {
  return html.match(/^<[a-z]+ class="([^"]*)"/)?.[1]
}

const STAT_STRIP = 'grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line-subtle bg-line-subtle'

test('StatStrip columns="md-4" adds md:grid-cols-4', () => {
  const html = renderToStaticMarkup(h(StatStrip, { columns: 'md-4' , children: 'x' }))
  assert.equal(outerClass(html), `${STAT_STRIP} md:grid-cols-4`)
})

test('StatStrip columns="lg-4" adds lg:grid-cols-4', () => {
  const html = renderToStaticMarkup(h(StatStrip, { columns: 'lg-4' , children: 'x' }))
  assert.equal(outerClass(html), `${STAT_STRIP} lg:grid-cols-4`)
})

test('StatStrip columns="sm-5" adds sm:grid-cols-5', () => {
  const html = renderToStaticMarkup(h(StatStrip, { columns: 'sm-5' , children: 'x' }))
  assert.equal(outerClass(html), `${STAT_STRIP} sm:grid-cols-5`)
})

const MICRO_LABEL = 'font-medium uppercase text-ink-3 text-micro tracking-[0.08em]'

test('Stat defaults to py-3, the title size and neutral ink, with no sub', () => {
  const html = renderToStaticMarkup(h(Stat, { label: 'L', value: 'V' }))
  assert.equal(
    html,
    `<div class="bg-card px-3 py-3"><div class="${MICRO_LABEL}">L</div><div class="mt-1 font-medium tabular-nums text-title text-ink">V</div></div>`
  )
})

test('Stat sub renders the small line under the value', () => {
  const html = renderToStaticMarkup(h(Stat, { label: 'L', value: 'V', sub: 'S' }))
  assert.equal(classOfText(html, 'S'), 'mt-0.5 text-label tabular-nums text-ink-3')
})

test('Stat tone="warning" ends the value in text-warning', () => {
  const html = renderToStaticMarkup(h(Stat, { label: 'L', value: 'V', tone: 'warning' }))
  assert.equal(classOfText(html, 'V'), 'mt-1 font-medium tabular-nums text-title text-warning')
})

test('Stat dense size="body-lg" uses py-2.5 and text-body-lg', () => {
  const html = renderToStaticMarkup(h(Stat, { label: 'L', value: 'V', dense: true, size: 'body-lg', tone: 'success' }))
  assert.equal(outerClass(html), 'bg-card px-3 py-2.5')
  assert.equal(classOfText(html, 'V'), 'mt-1 font-medium tabular-nums text-body-lg text-success')
})

test('MiniStatGrid columns={3} spacing="mt-3"', () => {
  const html = renderToStaticMarkup(h(MiniStatGrid, { columns: 3, spacing: 'mt-3' , children: 'x' }))
  assert.equal(outerClass(html), 'mt-3 grid gap-3 text-caption grid-cols-3')
})

test('MiniStatGrid columns={2}', () => {
  const html = renderToStaticMarkup(h(MiniStatGrid, { columns: 2 , children: 'x' }))
  assert.equal(outerClass(html), 'grid gap-3 text-caption grid-cols-2')
})

test('MiniStatGrid columns="sm-4"', () => {
  const html = renderToStaticMarkup(h(MiniStatGrid, { columns: 'sm-4' , children: 'x' }))
  assert.equal(outerClass(html), 'grid gap-3 text-caption sm:grid-cols-4')
})

test('MiniStat is a bare div with a caption label and an unsized value', () => {
  const html = renderToStaticMarkup(h(MiniStat, { label: 'L', value: 'V', tone: 'danger' }))
  assert.equal(
    html,
    '<div><div class="text-caption text-ink-3">L</div><div class="font-medium tabular-nums text-danger">V</div></div>'
  )
})

test('MiniStat defaults to neutral ink', () => {
  const html = renderToStaticMarkup(h(MiniStat, { label: 'L', value: 'V' }))
  assert.equal(classOfText(html, 'V'), 'font-medium tabular-nums text-ink')
})

const TOTALS = 'grid gap-3 rounded-md border border-line-subtle bg-surface px-3 py-2 text-caption'

test('TotalsStrip columns="sm-3"', () => {
  const html = renderToStaticMarkup(h(TotalsStrip, { columns: 'sm-3', children: 'x' }))
  assert.equal(outerClass(html), `${TOTALS} sm:grid-cols-3`)
})

test('TotalsStrip columns="sm-4"', () => {
  const html = renderToStaticMarkup(h(TotalsStrip, { columns: 'sm-4', children: 'x' }))
  assert.equal(outerClass(html), `${TOTALS} sm:grid-cols-4`)
})

test('TotalsStrip columns="sm-5"', () => {
  const html = renderToStaticMarkup(h(TotalsStrip, { columns: 'sm-5', children: 'x' }))
  assert.equal(outerClass(html), `${TOTALS} sm:grid-cols-5`)
})

test('Total is a bare div with the default Label and a neutral value', () => {
  const html = renderToStaticMarkup(h(Total, { label: 'L', value: 'V' }))
  assert.equal(
    html,
    '<div><div class="font-medium uppercase text-ink-3 text-label tracking-[0.08em]">L</div><div class="font-medium tabular-nums text-ink">V</div></div>'
  )
})

test('Total tone="danger" ends the value in text-danger', () => {
  const html = renderToStaticMarkup(h(Total, { label: 'L', value: 'V', tone: 'danger' }))
  assert.equal(classOfText(html, 'V'), 'font-medium tabular-nums text-danger')
})

// --- LinkChip / LinkChips / Tabs ---

/** The opening tag of the first <a> in the markup. */
function anchorTag(html: string): string {
  return html.match(/<a [^>]*>/)?.[0] ?? ''
}
function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

const CHIP_INFO = 'rounded-sm border px-2 py-1 text-label font-medium'
const CHIP_SUBTLE = 'rounded-sm border px-2 py-1 text-label'
const CHIP_INK = 'inline-flex min-h-8 items-center rounded-sm border px-2.5 text-label font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-info/40'

const chipCases: [string, 'info' | 'subtle' | 'ink' | undefined, boolean, string][] = [
  ['info (default) active', undefined, true, `${CHIP_INFO} border-info bg-info/10 text-info`],
  ['info inactive', 'info', false, `${CHIP_INFO} border-line text-ink-3 hover:border-info hover:text-info`],
  ['subtle active', 'subtle', true, `${CHIP_SUBTLE} border-line bg-surface font-medium text-ink`],
  ['subtle inactive', 'subtle', false, `${CHIP_SUBTLE} border-transparent text-ink-3 hover:border-line hover:text-ink`],
  ['ink active', 'ink', true, `${CHIP_INK} border-ink bg-ink text-card`],
  ['ink inactive', 'ink', false, `${CHIP_INK} border-line bg-card text-ink-2 hover:border-ink-3 hover:bg-surface hover:text-ink`],
]
for (const [name, variant, active, expected] of chipCases) {
  test(`LinkChip ${name}`, () => {
    const html = renderToStaticMarkup(h(LinkChip, { href: '/x', active, ...(variant ? { variant } : {}), children: 'C' }))
    assert.equal(attr(anchorTag(html), 'class'), expected)
  })
}

test('LinkChip ariaCurrent defaults to "true": aria-current only when active', () => {
  const on = anchorTag(renderToStaticMarkup(h(LinkChip, { href: '/x', active: true, children: 'C' })))
  const off = anchorTag(renderToStaticMarkup(h(LinkChip, { href: '/x', active: false, children: 'C' })))
  assert.equal(attr(on, 'aria-current'), 'true')
  assert.equal(attr(off, 'aria-current'), undefined)
})

test('LinkChip ariaCurrent="page" emits aria-current="page" when active', () => {
  const on = anchorTag(renderToStaticMarkup(h(LinkChip, { href: '/x', active: true, ariaCurrent: 'page', children: 'C' })))
  const off = anchorTag(renderToStaticMarkup(h(LinkChip, { href: '/x', active: false, ariaCurrent: 'page', children: 'C' })))
  assert.equal(attr(on, 'aria-current'), 'page')
  assert.equal(attr(off, 'aria-current'), undefined)
})

test('LinkChip ariaCurrent="none" emits no aria-current and no aria-pressed, and forwards aria-label and title', () => {
  const tag = anchorTag(renderToStaticMarkup(h(LinkChip, { href: '/x', active: true, ariaCurrent: 'none', title: 'T', 'aria-label': 'A', children: 'C' })))
  assert.equal(attr(tag, 'aria-current'), undefined)
  assert.equal(attr(tag, 'aria-pressed'), undefined)
  assert.equal(attr(tag, 'aria-label'), 'A')
  assert.equal(attr(tag, 'title'), 'T')
  assert.equal(attr(tag, 'href'), '/x')
})

const ITEMS = [
  { key: 'a', href: '/?k=a', label: 'A' },
  { key: 'b', href: '/?k=b', label: 'B', title: 'Bee' },
] as const

test('LinkChips as="fragment" (default) renders bare chips, keyed by the caller', () => {
  const html = renderToStaticMarkup(h(LinkChips, { items: [...ITEMS], current: 'b' }))
  assert.ok(html.startsWith('<a '))
  assert.equal((html.match(/<a /g) ?? []).length, 2)
  assert.ok(html.includes('aria-current="true"'))
  assert.ok(html.includes('title="Bee"'))
})

test('LinkChips ariaCurrent="page" variant="subtle" marks the active chip with page and the subtle classes', () => {
  const html = renderToStaticMarkup(h(LinkChips, { items: [...ITEMS], current: 'b', ariaCurrent: 'page', variant: 'subtle' }))
  const tags = html.match(/<a [^>]*>/g) ?? []
  assert.equal(tags.length, 2)
  assert.equal(attr(tags[0], 'aria-current'), undefined)
  assert.equal(attr(tags[0], 'class'), `${CHIP_SUBTLE} border-transparent text-ink-3 hover:border-line hover:text-ink`)
  assert.equal(attr(tags[1], 'aria-current'), 'page')
  assert.equal(attr(tags[1], 'class'), `${CHIP_SUBTLE} border-line bg-surface font-medium text-ink`)
})

test('LinkChips as="nav" wraps in a labelled nav', () => {
  const html = renderToStaticMarkup(h(LinkChips, { items: [...ITEMS], current: 'a', as: 'nav', label: 'Years' }))
  assert.ok(html.startsWith('<nav aria-label="Years" class="flex flex-wrap items-center justify-end gap-1">'), html)
})

test('LinkChips as="group" wraps in a labelled role=group div', () => {
  const html = renderToStaticMarkup(h(LinkChips, { items: [...ITEMS], current: 'a', as: 'group', label: 'G' }))
  assert.ok(html.startsWith('<div role="group" aria-label="G" class="flex flex-wrap items-center justify-end gap-1">'), html)
})

const TAB_BASE = '-mb-px inline-flex min-h-8 items-center border-b-2 px-3 text-caption font-medium'

test('Tabs nav and items', () => {
  const html = renderToStaticMarkup(h(Tabs, { label: 'P', items: [{ key: 's', href: '/p?tab=s', label: 'S' }, { key: 't', href: '/p?tab=t', label: 'T' }], current: 's' }))
  assert.ok(html.startsWith('<nav aria-label="P" class="mb-5 flex flex-wrap gap-1 border-b border-line-subtle">'), html)
  const tags = html.match(/<a [^>]*>/g) ?? []
  assert.equal(tags.length, 2)
  assert.equal(attr(tags[0], 'class'), `${TAB_BASE} border-info text-ink`)
  assert.equal(attr(tags[0], 'aria-current'), 'page')
  assert.equal(attr(tags[1], 'class'), `${TAB_BASE} border-transparent text-ink-3 hover:text-ink`)
  assert.equal(attr(tags[1], 'aria-current'), undefined)
})

/** The outer element's tag and attributes, as rendered. */
function outer(html: string): { tag: string; attrs: string; className: string | undefined } {
  const match = html.match(/^<(\w+)([^>]*)>/)
  assert.ok(match, `no element in ${html}`)
  const className = match[2].match(/ class="([^"]*)"/)?.[1]
  return { tag: match[1], attrs: match[2], className }
}

const PANEL = 'rounded-md border border-line-subtle bg-surface'

test('Panel defaults to a bordered div with px-3 py-2 and no text classes', () => {
  const el = outer(renderToStaticMarkup(h(Panel, { children: 'x' })))
  assert.equal(el.tag, 'div')
  assert.equal(el.className, `${PANEL} px-3 py-2`)
})

test('Panel spacing="mt-4" leads the class string', () => {
  assert.equal(outer(renderToStaticMarkup(h(Panel, { spacing: 'mt-4', children: 'x' }))).className, `mt-4 ${PANEL} px-3 py-2`)
})

test('Panel text values', () => {
  const cls = (text: 'caption' | 'caption-2' | 'caption-3' | 'caption-note' | 'label-note') =>
    outer(renderToStaticMarkup(h(Panel, { text, children: 'x' }))).className
  assert.equal(cls('caption'), `${PANEL} px-3 py-2 text-caption`)
  assert.equal(cls('caption-2'), `${PANEL} px-3 py-2 text-caption text-ink-2`)
  assert.equal(cls('caption-3'), `${PANEL} px-3 py-2 text-caption text-ink-3`)
  assert.equal(cls('caption-note'), `${PANEL} px-3 py-2 text-caption leading-relaxed text-ink-3`)
  assert.equal(cls('label-note'), `${PANEL} px-3 py-2 text-label leading-relaxed text-ink-3`)
})

test('Panel caption-2 note forwards role and id, with spacing="mb-4"', () => {
  const el = outer(renderToStaticMarkup(h(Panel, { text: 'caption-2', spacing: 'mb-4', role: 'note', id: 'n', children: 'x' })))
  assert.equal(el.className, `mb-4 ${PANEL} px-3 py-2 text-caption text-ink-2`)
  assert.match(el.attrs, / role="note"/)
  assert.match(el.attrs, / id="n"/)
})

test('Panel caption-note with spacing="mb-3"', () => {
  const el = outer(renderToStaticMarkup(h(Panel, { text: 'caption-note', spacing: 'mb-3', children: 'x' })))
  assert.equal(el.className, `mb-3 ${PANEL} px-3 py-2 text-caption leading-relaxed text-ink-3`)
})

test('Panel pad values', () => {
  assert.equal(outer(renderToStaticMarkup(h(Panel, { pad: 'md', children: 'x' }))).className, `${PANEL} p-3`)
  assert.equal(outer(renderToStaticMarkup(h(Panel, { pad: 'tall', children: 'x' }))).className, `${PANEL} px-3 py-3`)
})

test('Panel layout values', () => {
  assert.equal(outer(renderToStaticMarkup(h(Panel, { layout: 'stack-2', children: 'x' }))).className, `${PANEL} px-3 py-2 space-y-2`)
  assert.equal(
    outer(renderToStaticMarkup(h(Panel, { pad: 'tall', layout: 'tall', children: 'x' }))).className,
    `${PANEL} px-3 py-3 flex min-h-[15rem] flex-col`
  )
  assert.equal(
    outer(renderToStaticMarkup(h(Panel, { text: 'label-note', layout: 'span-2', children: 'x' }))).className,
    `${PANEL} px-3 py-2 text-label leading-relaxed text-ink-3 sm:col-span-2`
  )
})

test('Panel as="a" adds the hover border and forwards href, target and rel', () => {
  const el = outer(
    renderToStaticMarkup(h(Panel, { as: 'a', href: 'https://example.com/', target: '_blank', rel: 'noreferrer', children: 'x' }))
  )
  assert.equal(el.tag, 'a')
  assert.equal(el.className, `${PANEL} px-3 py-2 hover:border-info`)
  assert.match(el.attrs, / href="https:\/\/example.com\/"/)
  assert.match(el.attrs, / target="_blank"/)
  assert.match(el.attrs, / rel="noreferrer"/)
})

test('Panel as="form" pad="md" forwards action', () => {
  const el = outer(renderToStaticMarkup(h(Panel, { as: 'form', pad: 'md', action: '/save', children: 'x' })))
  assert.equal(el.tag, 'form')
  assert.equal(el.className, `${PANEL} p-3`)
  assert.match(el.attrs, / action="\/save"/)
})

test('Panel bordered={false} text="label-note" is the borderless soft note', () => {
  const soft = 'rounded-md bg-surface px-3 py-2 text-label leading-relaxed text-ink-3'
  const cls = (spacing?: 'mt-3' | 'mb-3') =>
    outer(renderToStaticMarkup(h(Panel, { bordered: false, text: 'label-note', spacing, children: 'x' }))).className
  assert.equal(cls(), soft)
  assert.equal(cls('mt-3'), `mt-3 ${soft}`)
  assert.equal(cls('mb-3'), `mb-3 ${soft}`)
  const p = outer(renderToStaticMarkup(h(Panel, { as: 'p', bordered: false, text: 'label-note', spacing: 'mb-5', children: 'x' })))
  assert.equal(p.tag, 'p')
  assert.equal(p.className, `mb-5 ${soft}`)
})

test('Callout strong caption is the proposal banner, toned by the Badge triplet', () => {
  const props = { emphasis: 'strong', size: 'caption', role: 'status', spacing: 'mb-4' } as const
  const success = outer(renderToStaticMarkup(h(Callout, { ...props, tone: 'success', children: 'x' })))
  assert.equal(success.tag, 'div')
  assert.equal(success.className, 'mb-4 rounded-md border px-3 py-2 text-caption border-success/30 bg-success/10 text-success')
  assert.match(success.attrs, / role="status"/)
  const warning = outer(renderToStaticMarkup(h(Callout, { ...props, tone: 'warning', children: 'x' })))
  assert.equal(warning.className, 'mb-4 rounded-md border px-3 py-2 text-caption border-warning/30 bg-warning/10 text-warning')
})

test('Callout strong label, as a div and as a p', () => {
  const div = outer(renderToStaticMarkup(h(Callout, { tone: 'warning', size: 'label', spacing: 'mb-4', children: 'x' })))
  assert.equal(div.tag, 'div')
  assert.equal(div.className, 'mb-4 rounded-md border px-3 py-2 text-label border-warning/30 bg-warning/10 text-warning')
  assert.doesNotMatch(div.attrs, / role=/)
  const p = outer(
    renderToStaticMarkup(h(Callout, { tone: 'warning', emphasis: 'strong', size: 'label', as: 'p', spacing: 'mb-3', children: 'x' }))
  )
  assert.equal(p.tag, 'p')
  assert.equal(p.className, 'mb-3 rounded-md border px-3 py-2 text-label border-warning/30 bg-warning/10 text-warning')
})

test('Callout soft warning, label relaxed and caption relaxed with role="status"', () => {
  assert.equal(
    outer(renderToStaticMarkup(h(Callout, { tone: 'warning', emphasis: 'soft', size: 'label', relaxed: true, children: 'x' }))).className,
    'rounded-md border px-3 py-2 text-label leading-relaxed border-warning/30 bg-warning/5 text-ink-2'
  )
  const status = outer(
    renderToStaticMarkup(
      h(Callout, { tone: 'warning', emphasis: 'soft', size: 'caption', relaxed: true, role: 'status', spacing: 'mt-3', children: 'x' })
    )
  )
  assert.equal(status.className, 'mt-3 rounded-md border px-3 py-2 text-caption leading-relaxed border-warning/30 bg-warning/5 text-ink-2')
  assert.match(status.attrs, / role="status"/)
})

test('Callout soft success layout="aside" has no size and the aside width', () => {
  assert.equal(
    outer(renderToStaticMarkup(h(Callout, { tone: 'success', emphasis: 'soft', layout: 'aside', children: 'x' }))).className,
    'rounded-md border px-3 py-2 border-success/30 bg-success/5 text-ink-2 shrink-0 lg:max-w-[19rem]'
  )
})

test('Callout rule is a left rule in the tone colour', () => {
  for (const tone of ['info', 'success', 'warning'] as const) {
    assert.equal(
      outer(renderToStaticMarkup(h(Callout, { tone, emphasis: 'rule', children: 'x' }))).className,
      `border-l-2 border-${tone} px-3 py-1`
    )
  }
})

// — Note ——————————————————————————————————————————————————————————————————————
// One assertion per class combination the footnote inventory recorded.

const NOTE_CASES: [string, Record<string, unknown>, string][] = [
  ['label, no spacing', {}, 'text-label text-ink-3'],
  ['label above-2', { spacing: 'above-2' }, 'mt-2 text-label text-ink-3'],
  ['label above-3', { spacing: 'above-3' }, 'mt-3 text-label text-ink-3'],
  ['label above-1', { spacing: 'above-1' }, 'mt-1 text-label text-ink-3'],
  ['label above-0.5', { spacing: 'above-0.5' }, 'mt-0.5 text-label text-ink-3'],
  ['label below-3', { spacing: 'below-3' }, 'mb-3 text-label text-ink-3'],
  ['label below-5', { spacing: 'below-5' }, 'mb-5 text-label text-ink-3'],
  ['label relaxed', { relaxed: true }, 'text-label leading-relaxed text-ink-3'],
  ['label relaxed above-3', { relaxed: true, spacing: 'above-3' }, 'mt-3 text-label leading-relaxed text-ink-3'],
  ['label relaxed above-2', { relaxed: true, spacing: 'above-2' }, 'mt-2 text-label leading-relaxed text-ink-3'],
  ['label relaxed above-1', { relaxed: true, spacing: 'above-1' }, 'mt-1 text-label leading-relaxed text-ink-3'],
  ['label relaxed below-3', { relaxed: true, spacing: 'below-3' }, 'mb-3 text-label leading-relaxed text-ink-3'],
  ['caption, no spacing', { size: 'caption' }, 'text-caption text-ink-3'],
  ['caption below-3', { size: 'caption', spacing: 'below-3' }, 'mb-3 text-caption text-ink-3'],
  ['caption below-4', { size: 'caption', spacing: 'below-4' }, 'mb-4 text-caption text-ink-3'],
  ['caption below-3 warning', { size: 'caption', spacing: 'below-3', tone: 'warning' }, 'mb-3 text-caption text-warning'],
  ['body', { size: 'body' }, 'text-body text-ink-3'],
  ['micro medium above-2', { size: 'micro', weight: 'medium', spacing: 'above-2' }, 'mt-2 text-micro font-medium text-ink-3'],
  ['inherit', { size: 'inherit' }, 'text-ink-3'],
  ['row above-3', { row: true, spacing: 'above-3' }, 'mt-3 flex flex-wrap items-center gap-2 text-label text-ink-3'],
  ['row below-4', { row: true, spacing: 'below-4' }, 'mb-4 flex flex-wrap items-center gap-2 text-label text-ink-3'],
  ['band top relaxed', { band: 'top', relaxed: true }, 'border-t border-line-subtle px-4 py-3 text-label leading-relaxed text-ink-3'],
  [
    'band bottom relaxed',
    { band: 'bottom', relaxed: true },
    'border-b border-line-subtle bg-surface px-4 py-3 text-label leading-relaxed text-ink-3',
  ],
]

for (const [name, props, expected] of NOTE_CASES) {
  test(`Note ${name}`, () => {
    const el = outer(renderToStaticMarkup(h(Note, { ...props, children: 'x' } as never)))
    assert.equal(el.tag, 'p')
    assert.equal(el.className, expected)
  })
}

test('Note forwards title and keeps a Badge child inside the paragraph', () => {
  const html = renderToStaticMarkup(h(Note, { row: true, spacing: 'below-4', title: 'why', children: h(Badge, { tone: 'warning', children: 'b' }) }))
  assert.match(html, /^<p class="[^"]*" title="why"><span class="[^"]*">b<\/span><\/p>$/)
})

// — SectionHeading ————————————————————————————————————————————————————————————

test('SectionHeading pension: page size with mb-1, bare h2', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { size: 'page', spacing: 'mb-1', children: 'T' }))
  assert.equal(html, '<h2 class="mb-1 text-title font-medium text-ink">T</h2>')
})

test('SectionHeading band: the briefing band row with an inline subtitle', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { size: 'section', tracking: true, layout: 'band', subtitle: 'S', children: 'T' }))
  assert.equal(
    html,
    '<div class="mb-3 mt-7 flex flex-wrap items-baseline gap-2.5 first:mt-0">' +
      '<h2 class="text-body-lg font-medium tracking-tight text-ink">T</h2>' +
      '<span class="text-label text-ink-3">S</span></div>'
  )
})

test('SectionHeading eyebrow: micro label above a tight page heading with mt-1', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { size: 'page', tight: true, eyebrow: 'E', children: 'T' }))
  assert.equal(
    html,
    '<div><div class="font-medium uppercase text-ink-3 text-micro tracking-[0.08em]">E</div>' +
      '<h2 class="mt-1 text-title font-medium leading-tight text-ink">T</h2></div>'
  )
})

test('SectionHeading tight tracking page heading (opportunity analysis)', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { size: 'page', tight: true, tracking: true, children: 'T' }))
  assert.equal(html, '<h2 class="text-title font-medium leading-tight tracking-tight text-ink">T</h2>')
})

test('SectionHeading action: h3 and the action in a flex row (timeline month)', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { level: 3, size: 'page', action: h('span', null, 'B'), children: 'T' }))
  assert.equal(html, '<div class="flex items-center gap-2"><h3 class="text-title font-medium text-ink">T</h3><span>B</span></div>')
})

test('SectionHeading stacked subtitle (card header)', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { size: 'section', subtitle: 'S', children: 'T' }))
  assert.equal(html, '<div><h2 class="text-body-lg font-medium text-ink">T</h2><p class="mt-0.5 text-label text-ink-3">S</p></div>')
})

test('SectionHeading minor h3 (proposal sub-headings)', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { level: 3, size: 'minor', children: 'T' }))
  assert.equal(html, '<h3 class="text-label font-medium text-ink">T</h3>')
})

test('SectionHeading muted sub h3 with mb-2 (FBAR sub-section)', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { level: 3, size: 'sub', tone: 'muted', spacing: 'mb-2', children: 'T' }))
  assert.equal(html, '<h3 class="mb-2 text-body font-medium text-ink-2">T</h3>')
})

test('SectionHeading forwards id to the heading', () => {
  const html = renderToStaticMarkup(h(SectionHeading, { id: 'x', children: 'T' }))
  assert.equal(html, '<h2 id="x" class="text-body-lg font-medium text-ink">T</h2>')
})

// Bars

test('ShareBar defaults: a 12px surface track with full-height segments (overview market bar)', () => {
  const html = renderToStaticMarkup(
    h(ShareBar, { segments: [{ key: 'a', pct: 60, title: 'A 60%', style: { backgroundImage: 'g' } }, { key: 'b', pct: 40 }] })
  )
  assert.equal(
    html,
    '<div class="flex overflow-hidden rounded-pill h-3 bg-surface"><div class="h-full" style="width:60%;background-image:g" title="A 60%"></div><div class="h-full" style="width:40%"></div></div>'
  )
})

test('ShareBar md height with mt-5 and token fills (overview term mix)', () => {
  const html = renderToStaticMarkup(h(ShareBar, { height: 'md', spacing: 'mt-5', segments: [{ key: 'l', pct: 70, className: 'bg-success' }] }))
  assert.equal(html, '<div class="mt-5 flex overflow-hidden rounded-pill h-2 bg-surface"><div class="h-full bg-success" style="width:70%"></div></div>')
})

test('ShareBar ariaHidden and a subtle sm track', () => {
  const html = renderToStaticMarkup(h(ShareBar, { ariaHidden: true, height: 'sm', track: 'subtle', segments: [] }))
  assert.equal(html, '<div class="flex overflow-hidden rounded-pill h-1.5 bg-line-subtle" aria-hidden="true"></div>')
})

test('ProgressBar defaults: md subtle track with a success fill', () => {
  const html = renderToStaticMarkup(h(ProgressBar, { pct: 40 }))
  assert.equal(html, '<div class="overflow-hidden rounded-pill h-2 bg-line-subtle"><div class="h-full bg-success" style="width:40%"></div></div>')
})

test('ProgressBar sm with mt-1.5 and a warning fill (tax comparison)', () => {
  const html = renderToStaticMarkup(h(ProgressBar, { pct: 40, tone: 'warning', height: 'sm', spacing: 'mt-1.5' }))
  assert.equal(html, '<div class="mt-1.5 overflow-hidden rounded-pill h-1.5 bg-line-subtle"><div class="h-full bg-warning" style="width:40%"></div></div>')
})

test('ProgressBar spacing mt-1 and mt-4', () => {
  assert.match(renderToStaticMarkup(h(ProgressBar, { pct: 1, height: 'sm', spacing: 'mt-1' })), /^<div class="mt-1 overflow-hidden rounded-pill h-1.5 bg-line-subtle">/)
  assert.match(renderToStaticMarkup(h(ProgressBar, { pct: 1, spacing: 'mt-4' })), /^<div class="mt-4 overflow-hidden rounded-pill h-2 bg-line-subtle">/)
})

test('ProgressBar roundedFill on a surface track (review concentration)', () => {
  const html = renderToStaticMarkup(h(ProgressBar, { pct: 55, tone: 'info', track: 'surface', roundedFill: true }))
  assert.equal(html, '<div class="overflow-hidden rounded-pill h-2 bg-surface"><div class="h-full rounded-pill bg-info" style="width:55%"></div></div>')
})

test('ProgressBar clamps to [0, 100]', () => {
  assert.match(renderToStaticMarkup(h(ProgressBar, { pct: 150 })), /style="width:100%"/)
  assert.match(renderToStaticMarkup(h(ProgressBar, { pct: -5 })), /style="width:0%"/)
})

// Position cell

const TICKER_LINK = '<a class="font-mono text-caption font-medium text-info hover:underline" href="/positions/US/AAA">AAA</a>'

test('PositionCell stacked: market badge and ticker link over the name', () => {
  const html = renderToStaticMarkup(h(PositionCell, { market: 'US', ticker: 'AAA', name: 'Alpha' }))
  assert.match(
    html,
    new RegExp(
      '^<div class="min-w-\\[14rem\\]"><div class="flex items-center gap-2"><span class="[^"]*">US</span>' +
        TICKER_LINK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '</div><div class="mt-1 max-w-\\[20rem\\] truncate text-caption font-medium text-ink">Alpha</div></div>$'
    )
  )
})

test('PositionCell stacked keeps the name line when the name is missing', () => {
  const html = renderToStaticMarkup(h(PositionCell, { market: 'US', ticker: 'AAA', name: null }))
  assert.ok(html.endsWith('<div class="mt-1 max-w-[20rem] truncate text-caption font-medium text-ink"></div></div>'))
})

test('PositionCell ticker layout is the link alone', () => {
  const html = renderToStaticMarkup(h(PositionCell, { market: 'US', ticker: 'AAA', layout: 'ticker', showMarket: false }))
  assert.equal(html, TICKER_LINK)
})

// Rows and splits

test('CardRow columns="main": main column and an 18-24rem side', () => {
  const html = renderToStaticMarkup(h(CardRow, { columns: 'main', children: 'x' }))
  assert.equal(html, '<div class="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">x</div>')
})

test('CardRow columns="side-main": the side column first', () => {
  const html = renderToStaticMarkup(h(CardRow, { columns: 'side-main', children: 'x' }))
  assert.equal(html, '<div class="mb-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">x</div>')
})

for (const [props, expected] of [
  [{ side: '20rem', at: 'lg', gap: 4 }, 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'],
  [{ side: '18rem', at: 'lg', gap: 5 }, 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]'],
  [{ side: '18rem', at: 'md', gap: 3 }, 'grid gap-3 md:grid-cols-[1fr_18rem]'],
  [{ side: '26rem', at: 'xl', gap: 4 }, 'grid gap-4 xl:grid-cols-[1fr_26rem]'],
  [{ side: '20rem', at: 'xl', gap: 5, sideFirst: true }, 'grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]'],
] as const) {
  test(`Split ${JSON.stringify(props)}`, () => {
    const html = renderToStaticMarkup(h(Split, { ...props, children: 'x' }))
    assert.equal(html, `<div class="${expected}">x</div>`)
  })
}

test('Split throws on a combination not in its table', () => {
  assert.throws(() => renderToStaticMarkup(h(Split, { side: '26rem', at: 'md', gap: 3, children: 'x' })), /Split/)
})

// — Card issues ————————————————————————————————————————————————————————————————

/** The header of a rendered Card. */
function cardHeader(html: string): string {
  return html.match(/<header[^>]*>([\s\S]*)<\/header>/)?.[1] ?? ''
}

test('Card issues with a count shows a warning badge in the header', () => {
  const html = renderToStaticMarkup(h(Card, { title: 'T', issues: { count: 3 }, children: 'x' }))
  const header = cardHeader(html)
  assert.match(header, /<span class="[^"]*border-warning\/30 bg-warning\/10 text-warning[^"]*">3 to review<\/span>/)
})

test('Card issues with problem severity shows a danger badge', () => {
  const html = renderToStaticMarkup(h(Card, { title: 'T', issues: { count: 2, severity: 'problem' }, children: 'x' }))
  assert.match(cardHeader(html), /<span class="[^"]*text-danger[^"]*">2 to review<\/span>/)
})

test('Card issues with a zero count renders no badge', () => {
  const withZero = renderToStaticMarkup(h(Card, { title: 'T', issues: { count: 0 }, children: 'x' }))
  const without = renderToStaticMarkup(h(Card, { title: 'T', children: 'x' }))
  assert.equal(withZero, without)
})

test('Card issues badge sits before the action', () => {
  const html = renderToStaticMarkup(
    h(Card, { title: 'T', issues: { count: 1 }, action: h('a', { href: '/x' }, 'act'), children: 'x' }),
  )
  const header = cardHeader(html)
  assert.ok(header.includes('1 to review'))
  assert.ok(header.indexOf('1 to review') < header.indexOf('act'))
})

test('Card with an action and no issues keeps its header unchanged', () => {
  const html = renderToStaticMarkup(h(Card, { title: 'T', action: h('a', { href: '/x' }, 'act'), children: 'x' }))
  assert.match(cardHeader(html), /<\/div><a href="\/x">act<\/a>$/)
})

test('Card issues needs a title', () => {
  // @ts-expect-error a count badge renders only in the header, so it needs a title
  const props: React.ComponentProps<typeof Card> = { issues: { count: 1 }, children: 'x' }
  assert.ok(props)
})

const FORM_ERROR_OPEN =
  '<div class="mb-4 rounded-md border px-3 py-2 border-danger/30 bg-danger/10 text-danger" role="alert">'

test('FormError with two messages is a danger alert Callout with a two-item list', () => {
  const html = renderToStaticMarkup(h(FormError, { title: 'T', messages: ['first', 'second'] }))
  assert.ok(html.startsWith(FORM_ERROR_OPEN), html)
  assert.ok(html.includes('<div class="font-medium">T</div>'), html)
  assert.equal((html.match(/<li>/g) ?? []).length, 2)
  assert.ok(html.indexOf('>T<') < html.indexOf('<ul'), 'the title leads the list')
})

test('FormError with one message renders no list and needs no title', () => {
  const html = renderToStaticMarkup(h(FormError, { messages: ['only'] }))
  assert.ok(html.startsWith(FORM_ERROR_OPEN), html)
  assert.ok(!html.includes('<ul'), html)
  assert.ok(!html.includes('<li'), html)
  assert.ok(!html.includes('font-medium'), html)
  assert.ok(html.includes('only'), html)
})

test('FormSaved renders the success Badge', () => {
  assert.equal(
    renderToStaticMarkup(h(FormSaved, { children: 'Saved' })),
    renderToStaticMarkup(h(Badge, { tone: 'success', children: 'Saved' })),
  )
  assert.match(renderToStaticMarkup(h(FormSaved, { children: 'Saved' })), /border-success\/30 bg-success\/10 text-success/)
})

test('FormError with no messages renders the title alone', () => {
  const html = renderToStaticMarkup(h(FormError, { title: 'T', messages: [] }))
  assert.equal(html, `${FORM_ERROR_OPEN}<div class="font-medium">T</div></div>`)
})

// — PageHeader status and actions ————————————————————————————————————————————

/** A stand-in for the App Router, which AutoRefresh needs mounted to render. */
const ROUTER = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

// Loose on purpose: Partial of the trail union would let eyebrow and parent mix, which the type forbids.
function renderHeader(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(AppRouterContext.Provider, { value: ROUTER as never }, h(PageHeader, { title: 'T', ...props } as React.ComponentProps<typeof PageHeader>))
  )
}

/** The text a reader sees: tags (and so their attributes) removed. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}

test('PageHeader status with href is a link around the severity badge', () => {
  const html = renderHeader({ status: { severity: 'attention', label: 'x', href: '#a' }, autoRefresh: false })
  const warning = renderToStaticMarkup(h(Badge, { tone: 'warning', children: 'x' }))
  const link = html.match(/<a [^>]*href="#a"[^>]*>(.*?)<\/a>/)
  assert.ok(link, html)
  assert.equal(link[1], warning)
  // The focus ring the repo already uses on a linked badge, shown on keyboard focus only.
  assert.match(link[0], /focus-visible:ring-2 focus-visible:ring-info\/40/)
})

test('PageHeader status without href renders the badge and no link', () => {
  const html = renderHeader({ status: { severity: 'problem', label: 'x' }, autoRefresh: false })
  assert.ok(!html.includes('<a '), html)
  assert.ok(html.includes(renderToStaticMarkup(h(Badge, { tone: 'danger', children: 'x' }))), html)
})

test('PageHeader renders status, then actions, then the clock', () => {
  const html = renderHeader({ status: { severity: 'ok', label: 'STATUS' }, actions: h('span', null, 'ACTIONS') })
  const status = html.indexOf('STATUS')
  const actions = html.indexOf('ACTIONS')
  const clock = html.indexOf('aria-pressed')
  assert.ok(status > 0 && status < actions && actions < clock, html)
})

test('PageHeader slot wraps between children and never inside one', () => {
  const html = renderHeader({ status: { severity: 'ok', label: 'S' }, actions: h('span', null, 'A') })
  assert.match(html, /class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1"/)
  // Two wrappers (actions, clock); the badge carries whitespace-nowrap itself.
  assert.equal((html.match(/class="flex items-center whitespace-nowrap"/g) ?? []).length, 2, html)
})

test('PageHeader clock shows no refresh interval; the title still names it', () => {
  const html = renderHeader({})
  assert.ok(!/30/.test(visibleText(html)), visibleText(html))
  assert.match(html, /title="Auto-refresh every 30s"/)
})

test('PageHeader no longer takes action', () => {
  // @ts-expect-error status and actions replaced it; tsc fails any caller left behind
  const props: React.ComponentProps<typeof PageHeader> = { title: 'T', action: 'x' }
  assert.ok(props)
})

test('PageHeader parent renders Section > Parent in a labelled nav, in the eyebrow place', () => {
  const html = renderHeader({ parent: '/holdings', language: 'en', autoRefresh: false })
  const nav = html.match(/<nav aria-label="Breadcrumb"[^>]*>(.*?)<\/nav>/)
  assert.ok(nav, html)
  const link = nav[1].match(/<a [^>]*href="\/holdings"[^>]*>(.*?)<\/a>/)
  assert.ok(link, nav[1])
  assert.equal(link[1], routeName('/holdings', 'en'))
  assert.ok(nav[1].includes(routeSection('/holdings', 'en').replace('&', '&amp;')), nav[1])
  assert.match(nav[1], /<span aria-hidden="true"[^>]*>\u203a<\/span>/)
  // The eyebrow class lives on the nav; no second eyebrow element outside it.
  assert.equal((html.match(/t-eyebrow/g) ?? []).length, 1, html)
  assert.match(nav[0], /t-eyebrow/)
})

test('PageHeader breadcrumb wraps between crumbs, never inside one', () => {
  const html = renderHeader({ parent: '/holdings', language: 'ko', autoRefresh: false })
  const nav = html.match(/<nav [^>]*>(.*?)<\/nav>/)
  assert.ok(nav, html)
  assert.match(nav[0], /flex-wrap/)
  const crumbs = [...nav[1].matchAll(/<(span|a)\b(?![^>]*aria-hidden)[^>]*>/g)]
  assert.equal(crumbs.length, 2, nav[1])
  for (const crumb of crumbs) assert.match(crumb[0], /whitespace-nowrap/, crumb[0])
})

test('PageHeader parent names the nav in Korean', () => {
  const html = renderHeader({ parent: '/rebalance', language: 'ko', autoRefresh: false })
  assert.match(html, /<nav aria-label="현재 위치"/)
  assert.ok(html.includes(routeName('/rebalance', 'ko')), html)
})

test('PageHeader parent and eyebrow are exclusive', () => {
  // @ts-expect-error a header names its parent or carries an eyebrow, not both
  const props: React.ComponentProps<typeof PageHeader> = { title: 'T', parent: '/holdings', language: 'en', eyebrow: 'E' }
  assert.ok(props)
})

test('Card forwards id to its section', () => {
  const html = renderToStaticMarkup(h(Card, { id: 'anchor', title: 'T', children: 'x' }))
  assert.ok(html.startsWith('<section id="anchor" '), html)
  // A linked card clears the phone's sticky top bar; one without an id is unchanged.
  assert.match(html, /class="[^"]*\bscroll-mt-24\b/)
  assert.ok(!renderToStaticMarkup(h(Card, { title: 'T', children: 'x' })).includes('scroll-mt'))
})

/** The source of the `status={...}` prop on a page's PageHeader, braces balanced. */
function statusBlock(source: string): string {
  const start = source.indexOf('status={')
  assert.ok(start >= 0, 'no status prop')
  let depth = 0
  for (let i = start + 'status='.length; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw new Error('unbalanced status prop')
}

/**
 * A header pill that reports a problem links to the card that lists it, and
 * both read one `*LinkedIssues` pair from lib/header-status.ts: the status
 * prop is the pair's `status`, the target Card's badge is the pair's `issues`.
 * Each row names the page, the pair's variable, the helper that builds it
 * (tests/linked-issues.test.ts pins its href, count and severity) and the Card
 * id it lands on. Each of these cards renders unconditionally on its page, so
 * the target exists whenever the pill is linked; matching `<Card id=` means
 * moving the id onto an element that does not always render fails here.
 */
const STATUS_ANCHORS: Array<{ page: string; pair: string; helper: string; id: string }> = [
  { page: 'app/reconciliation/page.tsx', pair: 'breaks', helper: 'reconciliationLinkedIssues', id: 'reconciliation-breaks' },
  { page: 'app/health/page.tsx', pair: 'operationalIssues', helper: 'healthLinkedIssues', id: 'health-operational-status' },
  { page: 'app/income/page.tsx', pair: 'tickerless', helper: 'incomeLinkedIssues', id: 'income-tickerless' },
  { page: 'app/data-ops/page.tsx', pair: 'priorityWork', helper: 'dataOpsLinkedIssues', id: 'data-ops-priority-work' },
  { page: 'app/rebalance/page.tsx', pair: 'holdWatch', helper: 'rebalanceLinkedIssues', id: 'rebalance-hold-watch' },
  { page: 'app/data-map/page.tsx', pair: 'reviewQueue', helper: 'dataMapLinkedIssues', id: 'data-map-review-queue' },
]

for (const { page, pair, helper, id } of STATUS_ANCHORS) {
  test(`${page}: the header status links to the card #${id}, and both read one pair`, () => {
    const source = readFileSync(page, 'utf8')
    assert.ok(source.includes(`const ${pair} = ${helper}(`), `${pair} is not built by ${helper}`)
    assert.equal(statusBlock(source), `status={${pair}.status}`)
    assert.equal((source.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1, `exactly one id="${id}"`)
    const card = source.indexOf(`<Card id="${id}"`)
    assert.ok(card >= 0, `id="${id}" is not on a Card`)
    const openTag = source.slice(card, source.indexOf('>', source.indexOf(`issues=`, card)) + 1)
    assert.ok(openTag.includes(`issues={${pair}.issues}`), `the card's badge is not ${pair}.issues`)
  })
}

// /review keeps its stale-input pill with no card to link to (the list lives
// on /health): the status still comes from its builder, which sets no href
// (tests/linked-issues.test.ts), and no card on the page carries its badge.
test('app/review/page.tsx: the header status is unlinked and no card reads its badge', () => {
  const source = readFileSync('app/review/page.tsx', 'utf8')
  assert.ok(source.includes('const readiness = reviewLinkedIssues('))
  assert.equal(statusBlock(source), 'status={readiness.status}')
  assert.ok(!source.includes('readiness.issues'))
  assert.ok(!source.includes('id="review-'))
})

// The exception: cash-inflow's target is not an issues card and renders only
// under the unclassified filter. The pill's href is what switches that filter
// on (tests/header-status.test.ts pins the #cash-inflow-unclassified part).
test('app/cash-inflow/page.tsx: the header status opens the filter that renders its target', () => {
  const source = readFileSync('app/cash-inflow/page.tsx', 'utf8')
  assert.ok(statusBlock(source).includes("cashInflowHeaderStatus(copy, data.unclassifiedCount, data.undatedCount, href({ category: 'unclassified' }))"))
  const branch = source.indexOf("{filter === 'unclassified' ? (")
  const target = source.indexOf('id="cash-inflow-unclassified"')
  assert.ok(branch >= 0 && target > branch, 'the target sits inside the unclassified branch')
  assert.equal((source.match(/id="cash-inflow-unclassified"/g) ?? []).length, 1)
})

test('OperatorDetails renders a closed details with the operator summary', () => {
  const en = renderToStaticMarkup(h(OperatorDetails, { language: 'en', children: h('p', null, 'x') }))
  assert.ok(en.startsWith('<details'))
  assert.ok(!en.includes(' open'))
  assert.ok(en.includes('>Operator details</summary>'))
  const ko = renderToStaticMarkup(h(OperatorDetails, { language: 'ko', children: h('p', null, 'x') }))
  assert.ok(ko.includes('>운영 정보</summary>'))
})

// Every caller knows the reader's language; a default would let a new caller
// render English on a Korean page without a type error.
export function operatorDetailsNeedsLanguage() {
  // @ts-expect-error language is required
  return OperatorDetails({ children: null })
}

test('MetricHeroCard puts its id on the section so a page can name its lead', () => {
  const html = renderToStaticMarkup(h(MetricHeroCard, { id: 'x', title: 'Title', eyebrow: 'Eyebrow', value: '1' }))
  assert.match(html, /<section[^>]*\bid="x"/)
})
