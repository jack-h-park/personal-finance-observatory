import type { ReactNode } from 'react'

import { Callout } from './card'
import { Badge } from './controls'

// One shape for the feedback a form page shows after a post: a success badge
// when the save went through, a danger alert above the page's first card when
// it did not. Hook-free, so server pages render it directly.

/**
 * A saved notice inside a card, such as an in-card editor's. A saved notice in
 * the page header is not this: it is the header's `status={{ severity: 'ok', label }}`.
 */
export function FormSaved({ children }: { children: ReactNode }) {
  return <Badge tone="success">{children}</Badge>
}

/**
 * The error alert: an optional title, then the messages, as a list when there
 * is more than one and not at all when there are none. Messages repeat in practice only by accident, so they are
 * keyed by position.
 */
export function FormError({ title, messages }: { title?: ReactNode; messages: ReactNode[] }) {
  return (
    <Callout tone="danger" emphasis="strong" role="alert" spacing="mb-4">
      {title ? <div className="font-medium">{title}</div> : null}
      {messages.length > 1 ? (
        <ul className="list-disc space-y-1 pl-5">
          {messages.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      ) : messages.length === 1 ? (
        <div>{messages[0]}</div>
      ) : null}
    </Callout>
  )
}
