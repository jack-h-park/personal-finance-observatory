import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTossClient, tossPricesOrEmpty } from '../scripts/toss-client.mjs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toss-client-'))
const env = (name) => ({ TOSS_OPENAPI_CLIENT_ID: 'client-a', TOSS_OPENAPI_CLIENT_SECRET: 'secret', TOSS_OPENAPI_BASE: 'https://toss.test', TOSS_TOKEN_CACHE: path.join(dir, `${name}.json`) })

/** A fake Toss: counts token issues, serves prices, and can reject one token. */
function fakeToss({ revoked = new Set(), failPrices = null } = {}) {
  const calls = { tokens: 0, prices: [] }
  const fetchImpl = async (url, options = {}) => {
    const u = new URL(url)
    if (u.pathname === '/oauth2/token') {
      calls.tokens += 1
      return new Response(JSON.stringify({ access_token: `tok-${calls.tokens}`, expires_in: 86400 }), { status: 200 })
    }
    const auth = options.headers?.Authorization ?? ''
    if (revoked.has(auth.replace('Bearer ', ''))) return new Response(JSON.stringify({ error: 'token-revoked' }), { status: 401 })
    if (failPrices) return new Response(JSON.stringify({ error: failPrices }), { status: 403 })
    const symbols = u.searchParams.get('symbols').split(',')
    calls.prices.push(symbols.length)
    return new Response(JSON.stringify({ result: symbols.map((symbol) => ({ symbol, lastPrice: '100', timestamp: '2030-03-12T10:00:00+09:00', currency: 'KRW' })) }), { status: 200 })
  }
  return { calls, fetchImpl }
}

test('no credentials means no client and no request', async () => {
  assert.equal(createTossClient({ env: {} }), null)
  assert.equal((await tossPricesOrEmpty(['005930'], { env: {} })).size, 0)
})

test('the token is cached 0600 and reused across clients, so a second run does not revoke the first', async () => {
  const toss = fakeToss()
  const options = { env: env('reuse'), fetchImpl: toss.fetchImpl }
  await createTossClient(options).prices(['005930'])
  await createTossClient(options).prices(['000660'])
  assert.equal(toss.calls.tokens, 1)
  const file = options.env.TOSS_TOKEN_CACHE
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
})

test('a cached token near expiry is reissued', async () => {
  const toss = fakeToss()
  const start = Date.parse('2030-03-12T00:00:00Z')
  await createTossClient({ env: env('expiry'), fetchImpl: toss.fetchImpl, now: () => start }).prices(['A'])
  await createTossClient({ env: env('expiry'), fetchImpl: toss.fetchImpl, now: () => start + 86400 * 1000 - 5 * 60 * 1000 }).prices(['A'])
  assert.equal(toss.calls.tokens, 2)
})

test('a revoked token is reissued once on 401', async () => {
  const toss = fakeToss({ revoked: new Set(['tok-1']) })
  const prices = await createTossClient({ env: env('revoked'), fetchImpl: toss.fetchImpl }).prices(['005930'])
  assert.equal(prices.get('005930').price, 100)
  assert.equal(toss.calls.tokens, 2)
})

test('a 403 naming the token is reissued once, a 403 for the IP is not', async () => {
  const calls = { tokens: 0 }
  const fetchImpl = async (url, options = {}) => {
    if (new URL(url).pathname === '/oauth2/token') {
      calls.tokens += 1
      return new Response(JSON.stringify({ access_token: `tok-${calls.tokens}`, expires_in: 86400 }), { status: 200 })
    }
    if (options.headers.Authorization === 'Bearer tok-1') return new Response(JSON.stringify({ error: 'invalid-token' }), { status: 403 })
    return new Response(JSON.stringify({ result: [{ symbol: 'A', lastPrice: '1', timestamp: '2030-03-12T10:00:00+09:00' }] }), { status: 200 })
  }
  assert.equal((await createTossClient({ env: env('forbidden-token'), fetchImpl }).prices(['A'])).size, 1)
  assert.equal(calls.tokens, 2)
  const ipBlocked = fakeToss({ failPrices: 'ip-not-allowed' })
  await assert.rejects(createTossClient({ env: env('forbidden-ip'), fetchImpl: ipBlocked.fetchImpl }).prices(['A']), /ip-not-allowed/)
  assert.equal(ipBlocked.calls.tokens, 1, 'no reissue for an IP refusal')
})

test('symbols are requested in batches of 200', async () => {
  const toss = fakeToss()
  const symbols = Array.from({ length: 450 }, (_, i) => String(i).padStart(6, '0'))
  const prices = await createTossClient({ env: env('batch'), fetchImpl: toss.fetchImpl }).prices(symbols)
  assert.deepEqual(toss.calls.prices, [200, 200, 50])
  assert.equal(prices.size, 450)
})

test('a Toss error falls back to an empty map instead of failing the run', async () => {
  const toss = fakeToss({ failPrices: 'ip-not-allowed' })
  const warn = console.warn
  const messages = []
  console.warn = (message) => messages.push(message)
  try {
    const prices = await tossPricesOrEmpty(['005930'], { env: env('error'), fetchImpl: toss.fetchImpl })
    assert.equal(prices.size, 0)
  } finally {
    console.warn = warn
  }
  assert.match(messages.join('\n'), /Yahoo only/)
  assert.doesNotMatch(messages.join('\n'), /tok-/, 'the token never reaches a log line')
})
