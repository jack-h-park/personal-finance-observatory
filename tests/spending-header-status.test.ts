import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { spendingLinkedIssues } from '@/lib/header-status'
import { getPageCopy } from '@/lib/ui-copy'

const href = '/spending?view=review&period=12#spending-holds'

for (const language of ['en', 'ko'] as const) {
  const copy = getPageCopy('spending', language)

  test(`spending (${language}): holds lead the pill, link to the holds card and match its badge`, () => {
    const linked = spendingLinkedIssues(copy, { holds: 6, reviewIncomplete: false, missingFx: 0, reviewHref: href })
    assert.deepEqual(linked.status, { severity: 'attention', label: copy.statusHolds('6'), href })
    assert.deepEqual(linked.issues, { count: 6, severity: 'attention' })
  })

  test(`spending (${language}): holds and missing rates share one pill`, () => {
    const linked = spendingLinkedIssues(copy, { holds: 6, reviewIncomplete: false, missingFx: 2, reviewHref: href })
    assert.deepEqual(linked.status, { severity: 'attention', label: copy.statusHoldsAndMissingFx('6', '2'), href })
  })

  test(`spending (${language}): an incomplete review without holds still links to the card`, () => {
    const linked = spendingLinkedIssues(copy, { holds: 0, reviewIncomplete: true, missingFx: 0, reviewHref: href })
    assert.deepEqual(linked.status, { severity: 'attention', label: copy.statusIncomplete, href })
    assert.deepEqual(linked.issues, { count: 0, severity: 'attention' })
  })

  test(`spending (${language}): missing rates alone are a pill without a link`, () => {
    const linked = spendingLinkedIssues(copy, { holds: 0, reviewIncomplete: false, missingFx: 2, reviewHref: href })
    assert.deepEqual(linked.status, { severity: 'attention', label: copy.statusMissingFx('2'), href: undefined })
  })

  test(`spending (${language}): nothing to review reads as all clear`, () => {
    const linked = spendingLinkedIssues(copy, { holds: 0, reviewIncomplete: false, missingFx: 0, reviewHref: href })
    assert.deepEqual(linked.status, { severity: 'ok', label: copy.statusClear, href: undefined })
  })
}
