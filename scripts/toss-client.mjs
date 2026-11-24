// toss-client.mjs — the Toss Securities Open API token and current prices,
// shared by fetch-toss.mjs and the price fetches.
//
// Toss keeps one valid token per client and issuing a new one revokes the
// previous one, so every caller reuses one cached token instead of issuing its
// own. The cache holds a bearer token: it is written 0600, never printed, and
// lives outside the repository beside the price-refresh cron state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const TOSS_BASE = process.env.TOSS_OPENAPI_BASE || 'https://openapi.tossinvest.com'
/** Reuse a cached token until this long before it expires. */
const EXPIRY_MARGIN_MS = 10 * 60 * 1000
/** `/api/v1/prices` takes at most this many symbols per call. */
export const PRICES_BATCH = 200

export function tossTokenCachePath(env = process.env) {
  return env.TOSS_TOKEN_CACHE || path.join(os.homedir(), '.config', 'stock-portfolio-observatory', 'toss-token.json')
}

function readCachedToken(file, clientId, now) {
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (cached?.clientId !== clientId || typeof cached.accessToken !== 'string') return null
    if (!(Number(cached.expiresAt) - EXPIRY_MARGIN_MS > now)) return null
    return cached.accessToken
  } catch {
    return null
  }
}

function writeCachedToken(file, clientId, accessToken, expiresAt) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify({ clientId, accessToken, expiresAt })}\n`, { mode: 0o600 })
  fs.renameSync(temp, file)
}

function describeError(status, body) {
  try {
    const parsed = JSON.parse(body)
    const detail = parsed.error_description || parsed.error?.message || parsed.error || ''
    if (/IP/i.test(String(detail))) return `${status} ${detail} (this machine's public IP is not on the Toss allowlist)`
    return `${status} ${String(detail).slice(0, 200)}`
  } catch {
    return `${status} ${body.slice(0, 200)}`
  }
}

/**
 * A client for one set of credentials, or null when there are none (local
 * development and CI). `fetchImpl` and `now` are injectable for tests.
 */
export function createTossClient({ env = process.env, fetchImpl = fetch, now = () => Date.now(), cachePath = tossTokenCachePath(env) } = {}) {
  const clientId = env.TOSS_OPENAPI_CLIENT_ID
  const clientSecret = env.TOSS_OPENAPI_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const base = env.TOSS_OPENAPI_BASE || TOSS_BASE

  async function issueToken() {
    const res = await fetchImpl(`${base}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`token: ${describeError(res.status, body)}`)
    const parsed = JSON.parse(body)
    const expiresAt = now() + Number(parsed.expires_in || 3600) * 1000
    writeCachedToken(cachePath, clientId, parsed.access_token, expiresAt)
    return parsed.access_token
  }

  let token = null
  async function accessToken() {
    token ??= readCachedToken(cachePath, clientId, now()) ?? (await issueToken())
    return token
  }

  /** GET a JSON path; a 401 (revoked or expired token) reissues the token once. */
  async function get(pathAndQuery, headers = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await fetchImpl(`${base}${pathAndQuery}`, { headers: { ...headers, Authorization: `Bearer ${await accessToken()}` } })
      const body = await res.text()
      if (res.status === 401 && attempt === 0) {
        token = await issueToken()
        continue
      }
      if (!res.ok) throw new Error(`${pathAndQuery.split('?')[0]}: ${describeError(res.status, body)}`)
      return JSON.parse(body)
    }
    throw new Error(`${pathAndQuery.split('?')[0]}: unauthorized after reissuing the token`)
  }

  /** Current prices for up to any number of symbols: Map(symbol -> { price, quotedAt, currency }). */
  async function prices(symbols) {
    const unique = [...new Set(symbols.filter(Boolean))]
    const out = new Map()
    for (let index = 0; index < unique.length; index += PRICES_BATCH) {
      const query = new URLSearchParams({ symbols: unique.slice(index, index + PRICES_BATCH).join(',') })
      const result = (await get(`/api/v1/prices?${query}`)).result ?? []
      for (const row of result) {
        const price = Number(row?.lastPrice)
        if (!row?.symbol || !Number.isFinite(price) || price <= 0) continue
        out.set(String(row.symbol), { price, quotedAt: typeof row.timestamp === 'string' ? row.timestamp : null, currency: row.currency ?? null })
      }
    }
    return out
  }

  return { accessToken, get, prices }
}

/**
 * Toss prices for the symbols, or an empty map when Toss cannot be used: no
 * credentials, an IP outside the allowlist, a rate limit or an outage. The
 * price fetches then use Yahoo alone, so Toss never fails a run.
 */
export async function tossPricesOrEmpty(symbols, options = {}) {
  const client = createTossClient(options)
  if (!client) return new Map()
  try {
    return await client.prices(symbols)
  } catch (error) {
    console.warn(`Toss prices unavailable, using Yahoo only: ${error.message}`)
    return new Map()
  }
}
