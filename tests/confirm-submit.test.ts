import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ConfirmSubmitButton, confirmStep } from '../components/ConfirmSubmitButton'
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
