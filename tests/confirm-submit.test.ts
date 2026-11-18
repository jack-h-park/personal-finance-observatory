import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import { ConfirmSubmitButton, ConfirmSubmitButtonView, MIN_CONFIRM_MS, confirmStep } from '../components/ConfirmSubmitButton'
import { getUiCopy } from '../lib/ui-copy'

// tsx compiles the component's JSX with the classic runtime, which reads a
// global React; Next supplies it in the app, so the test does here.
;(globalThis as { React?: typeof React }).React = React

test('confirmStep: the first press arms without submitting', () => {
  assert.deepEqual(confirmStep('idle', 'press'), { state: 'armed', submit: false })
})

test('confirmStep: the second press submits and disarms', () => {
  assert.deepEqual(confirmStep('armed', 'press'), { state: 'idle', submit: true })
})

test('confirmStep: an armed button disarms on timeout or blur without submitting', () => {
  assert.deepEqual(confirmStep('armed', 'timeout'), { state: 'idle', submit: false })
  assert.deepEqual(confirmStep('armed', 'blur'), { state: 'idle', submit: false })
})

test('confirmStep: a confirming press that is part of the arming gesture is ignored', () => {
  // The second click of a double-click arrives with detail 2.
  assert.deepEqual(confirmStep('armed', 'press', { clickCount: 2, msSinceArmed: 5000 }), { state: 'armed', submit: false })
  // A held key repeats presses well inside the window.
  assert.deepEqual(confirmStep('armed', 'press', { clickCount: 0, msSinceArmed: MIN_CONFIRM_MS - 1 }), { state: 'armed', submit: false })
  assert.deepEqual(confirmStep('armed', 'press', { clickCount: 1, msSinceArmed: MIN_CONFIRM_MS }), { state: 'idle', submit: true })
  assert.equal(MIN_CONFIRM_MS, 400)
})

test('confirmStep: timeout and blur leave an idle button idle', () => {
  assert.deepEqual(confirmStep('idle', 'timeout'), { state: 'idle', submit: false })
  assert.deepEqual(confirmStep('idle', 'blur'), { state: 'idle', submit: false })
})

test('an idle ConfirmSubmitButton is not a submit button, so Enter in a field cannot reach it', () => {
  const html = renderToStaticMarkup(React.createElement(ConfirmSubmitButton, null, 'Approve'))
  assert.match(html, /type="button"/)
  assert.doesNotMatch(html, /type="submit"/)
  assert.match(html, /Approve/)
  assert.match(html, /aria-live="polite"/)
})

test('an armed button is the submit button and shows the confirm label', () => {
  // Enter in a field while armed is not unit-tested (no DOM environment); the
  // browser hand check covers it.
  const view = (armed: boolean) =>
    renderToStaticMarkup(React.createElement(ConfirmSubmitButtonView, { armed, pending: false, children: 'Approve' }))
  const armed = view(true)
  assert.match(armed, /type="submit"/)
  assert.doesNotMatch(armed, /type="button"/)
  assert.match(armed, /Press again to confirm/)
  assert.doesNotMatch(armed, /Approve/)
  const idle = view(false)
  assert.match(idle, /type="button"/)
  assert.match(idle, /Approve/)
  const custom = renderToStaticMarkup(
    React.createElement(ConfirmSubmitButtonView, { armed: true, pending: false, confirmLabel: 'Really?', children: 'Approve' })
  )
  assert.match(custom, /Really\?/)
})

test('the proposal page confirms exactly the five policy actions and leaves saves one-click', () => {
  const source = fs.readFileSync('app/rebalance/proposals/[id]/page.tsx', 'utf8')
  const buttons = [...source.matchAll(/<(ConfirmSubmitButton|SubmitButton)\b[^>]*>\{(copy\.[\w.]+)\}/g)].map((m) => [m[2], m[1]])
  const byLabel = Object.fromEntries(buttons)
  assert.equal(buttons.length, Object.keys(byLabel).length, 'each label appears once')
  const confirmed = buttons.filter(([, kind]) => kind === 'ConfirmSubmitButton').map(([label]) => label).sort()
  assert.deepEqual(confirmed, ['copy.plan.approve', 'copy.plan.closeNoTrades', 'copy.statusCard.close', 'copy.statusCard.reject', 'copy.targets.approve'])
  assert.equal(byLabel['copy.targets.save'], 'SubmitButton')
  assert.equal(byLabel['copy.plan.recompute'], 'SubmitButton')
})

test('an idle ConfirmSubmitButton carries the same classes as the SubmitButton it replaces', async () => {
  const { SubmitButton } = await import('../components/SubmitButton')
  const classOf = (html: string) => /class="([^"]*)"/.exec(html)?.[1]
  for (const variant of ['solid', 'outline'] as const) {
    const confirm = renderToStaticMarkup(React.createElement(ConfirmSubmitButton, { variant, children: 'Go' }))
    const submit = renderToStaticMarkup(React.createElement(SubmitButton, { variant, children: 'Go' }))
    assert.equal(classOf(confirm), classOf(submit))
  }
})

test('form.confirm copy exists in both languages', () => {
  assert.equal(getUiCopy('en').form.confirm, 'Press again to confirm')
  assert.equal(getUiCopy('ko').form.confirm, '한 번 더 누르면 확정')
})
