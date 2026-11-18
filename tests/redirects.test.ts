import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import CostBasisPage from '@/app/cost-basis/page'
import DividendsPage from '@/app/dividends/page'
import { redirectWithQuery } from '@/lib/table-filter'

/** Runs a page and returns the digest of the redirect it throws. */
async function redirectDigest(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) return digest
    throw error
  }
  assert.fail('the page rendered instead of redirecting')
}

test('redirectWithQuery keeps every parameter and repeats arrays', () => {
  const url = redirectWithQuery('/holdings', { status: 'missing', market: 'KR', q: 'x' })
  const [path, query] = url.split('?')
  assert.equal(path, '/holdings')
  const params = new URLSearchParams(query)
  assert.equal(params.get('status'), 'missing')
  assert.equal(params.get('market'), 'KR')
  assert.equal(params.get('q'), 'x')
  assert.deepEqual(new URLSearchParams(redirectWithQuery('/holdings', { market: ['KR', 'US'] }).split('?')[1]).getAll('market'), ['KR', 'US'])
  assert.equal(redirectWithQuery('/holdings', {}), '/holdings')
  assert.equal(redirectWithQuery('/holdings', { q: undefined }), '/holdings')
})

test('/cost-basis redirects to /holdings with its query intact', async () => {
  const digest = await redirectDigest(() => CostBasisPage({ searchParams: Promise.resolve({ status: 'missing', market: 'KR' }) }))
  assert.match(digest, /\/holdings\?/)
  assert.match(digest, /status=missing/)
  assert.match(digest, /market=KR/)
})

test('/dividends redirects to /income', async () => {
  const digest = await redirectDigest(() => DividendsPage())
  assert.match(digest, /;\/income;/)
})
