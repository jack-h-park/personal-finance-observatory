'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode, Ref } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui'
import { usePageLanguage } from '@/components/LanguageProvider'
import { getUiCopy } from '@/lib/ui-copy'

type ConfirmState = 'idle' | 'armed'
type ConfirmEvent = 'press' | 'timeout' | 'blur'

/** How long an armed button waits for the second press before it gives up. */
const ARMED_MS = 6000

/** A press this soon after arming is the same gesture (a double-click, a held key), not a confirmation. */
export const MIN_CONFIRM_MS = 400

/**
 * The confirmation state machine, kept pure so it can be tested on its own.
 * The first press arms; only a press on an armed button submits. Running out of
 * time or losing focus puts it back to idle without submitting.
 *
 * A press on an armed button is ignored (it stays armed, nothing submits) when
 * it is the second click of a multi-click (`clickCount > 1`) or lands within
 * MIN_CONFIRM_MS of arming, so a double-click or key repeat cannot arm and
 * confirm before the reader has seen the confirm label.
 */
export function confirmStep(
  state: ConfirmState,
  event: ConfirmEvent,
  press: { clickCount?: number; msSinceArmed?: number } = {}
): { state: ConfirmState; submit: boolean } {
  if (event !== 'press') return { state: 'idle', submit: false }
  if (state === 'idle') return { state: 'armed', submit: false }
  const hasty = (press.clickCount ?? 1) > 1 || (press.msSinceArmed ?? Infinity) < MIN_CONFIRM_MS
  return hasty ? { state: 'armed', submit: false } : { state: 'idle', submit: true }
}

/**
 * A submit button for an action that changes policy, which asks for a second press.
 *
 * Approving targets or a plan, closing and rejecting a proposal each rewrite
 * what the portfolio is supposed to look like, and each sat one stray click
 * away. Idle, it looks exactly like the SubmitButton it replaces. The first
 * press arms it and swaps the label for the confirm wording; a second press
 * within six seconds submits; a blur or the timeout disarms it.
 *
 * Implicit submission (Enter in a text field) must never confirm:
 * - Idle, the button is `type="button"`, so it is never the form's default
 *   button. A form whose only other control is one text field would still
 *   submit on Enter with no submitter at all, so a submit listener on the form
 *   cancels any submission without a submitter.
 * - Armed, the button is `type="submit"` and can be the default button, in
 *   which case the browser fires a synthetic click at it on Enter. A press only
 *   counts when it is a real pointer click (`detail > 0`) or keyboard activation
 *   of the button itself (it has focus); anything else is cancelled and
 *   disarms it.
 * - The submission itself goes through `form.requestSubmit(button)`, never the
 *   click's default action, so the state change that turns the button back into
 *   `type="button"` cannot race the browser's activation behaviour, and the
 *   server action still receives the button's own name/value/formAction.
 * - The form guard cancels every submitter-less submission in a form holding this button.
 *
 * The click, timer, blur and Enter wiring has no DOM test environment here; it
 * is covered by the browser hand check. The reducer and the rendered markup of
 * both states are unit-tested.
 */
export function ConfirmSubmitButton({
  children,
  confirmLabel,
  pendingLabel,
  variant = 'outline',
  size = 'sm',
}: {
  children: ReactNode
  /** Overrides the shared "Press again to confirm" wording. */
  confirmLabel?: ReactNode
  /** Overrides the shared "Saving…" wording where a form does something else. */
  pendingLabel?: string
  variant?: 'solid' | 'outline' | 'ghost'
  size?: 'sm' | 'md'
}) {
  const { pending } = useFormStatus()
  const [state, setState] = useState<ConfirmState>('idle')
  const ref = useRef<HTMLButtonElement>(null)
  const armedAt = useRef(0)
  const armed = state === 'armed'

  // Disarm after the timeout; the cleanup clears the timer on disarm and unmount.
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setState((s) => confirmStep(s, 'timeout').state), ARMED_MS)
    return () => clearTimeout(timer)
  }, [armed])

  // Cancel implicit submissions that have no submitter (see the comment above).
  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const guard = (event: SubmitEvent) => {
      if (event.submitter) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    form.addEventListener('submit', guard)
    return () => form.removeEventListener('submit', guard)
  }, [])

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    // The click's own default action never submits; requestSubmit below does.
    event.preventDefault()
    const button = event.currentTarget
    const genuine = event.detail > 0 || document.activeElement === button
    if (!genuine) {
      setState((s) => confirmStep(s, 'blur').state)
      return
    }
    const now = Date.now()
    const next = confirmStep(state, 'press', { clickCount: event.detail, msSinceArmed: now - armedAt.current })
    if (state === 'idle' && next.state === 'armed') armedAt.current = now
    if (next.submit) button.form?.requestSubmit(button)
    setState(next.state)
  }

  return (
    <ConfirmSubmitButtonView
      buttonRef={ref}
      armed={armed}
      pending={pending}
      confirmLabel={confirmLabel}
      pendingLabel={pendingLabel}
      variant={variant}
      size={size}
      onClick={onClick}
      onBlur={() => setState((s) => confirmStep(s, 'blur').state)}
    >
      {children}
    </ConfirmSubmitButtonView>
  )
}

/**
 * The markup of ConfirmSubmitButton for a given state, with no state of its own,
 * so both states can be rendered in a test. Idle it is `type="button"` with the
 * caller's label; armed it is `type="submit"` with the confirm label.
 */
export function ConfirmSubmitButtonView({
  armed,
  pending,
  children,
  confirmLabel,
  pendingLabel,
  variant = 'outline',
  size = 'sm',
  buttonRef,
  onClick,
  onBlur,
}: {
  armed: boolean
  pending: boolean
  children: ReactNode
  confirmLabel?: ReactNode
  pendingLabel?: string
  variant?: 'solid' | 'outline' | 'ghost'
  size?: 'sm' | 'md'
  buttonRef?: Ref<HTMLButtonElement>
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  onBlur?: () => void
}) {
  const copy = getUiCopy(usePageLanguage()).form
  return (
    <Button
      ref={buttonRef}
      type={armed ? 'submit' : 'button'}
      variant={variant}
      size={size}
      loading={pending}
      onClick={onClick}
      onBlur={onBlur}
    >
      <span aria-live="polite">{pending ? (pendingLabel ?? copy.saving) : armed ? (confirmLabel ?? copy.confirm) : children}</span>
    </Button>
  )
}
