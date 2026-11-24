/**
 * Measure the shape of the pages R5 restructures: how many cards a page stacks,
 * and how far down the page its lead (the one block that answers the page's
 * question) starts.
 *
 *   node scripts/page-shape.mjs --base http://127.0.0.1:3120
 *
 * Visits each route in English and Korean at 1440x1000, prints one line per
 * route and language, and exits 1 when any page breaks a limit. The lead ids
 * are added to the pages by the tasks that restructure them, so a page without
 * its id fails until then.
 *
 * Like snap-ui.mjs, never point this at a server backed by real holdings; the
 * default base URL is deliberately not the usual dev port.
 */
import { pathToFileURL } from 'node:url'

/** Every `Card` (and so every `MetricHeroCard`) renders this marker; the budget counts it. */
export const CARD_SELECTOR = 'main section[data-card]'

export const SHAPE_ROUTES = [
  { path: '/tax-planning', lead: '#tax-plan-overview' },
  { path: '/rebalance', lead: '#rebalance-lead' },
  { path: '/positions/KR/005930', lead: '#position-lead' },
  { path: '/cash-inflow', lead: '#cash-inflow-lead' },
  { path: '/review', lead: '#review-summary' },
  // The trend card leads; the coverage panel that used to sit above it is on /health now.
  { path: '/net-worth', lead: '#net-worth-trend' },
  // Served only where a spending ledger or snapshot is configured; a 404 is skipped, not failed.
  { path: '/spending', lead: '#spending-lead', optional: true },
]

const DEFAULT_LIMITS = { maxCards: 10, maxLeadTop: 840 }

/** Messages for each limit a page breaks; empty when it keeps both. */
export function shapeVerdict(m, limits = DEFAULT_LIMITS) {
  const messages = []
  if (m.cards > limits.maxCards) {
    messages.push(`${m.cards} cards, limit ${limits.maxCards}`)
  }
  if (m.leadTop === null) {
    messages.push('lead block not found')
  } else if (m.leadTop > limits.maxLeadTop) {
    messages.push(`lead starts at ${Math.round(m.leadTop)}px, limit ${limits.maxLeadTop}px`)
  }
  return messages
}

const LANGUAGE_COOKIE = 'stock-observatory-language'
const LANGUAGES = ['en', 'ko']

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

async function main() {
  const baseUrl = arg('--base', 'http://127.0.0.1:3120')
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  let failures = 0

  for (const language of LANGUAGES) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      timezoneId: 'Asia/Seoul',
    })
    const { hostname } = new URL(baseUrl)
    await context.addCookies([{ name: LANGUAGE_COOKIE, value: language, domain: hostname, path: '/' }])
    const page = await context.newPage()

    for (const route of SHAPE_ROUTES) {
      const label = `${route.path} ${language}`
      try {
        const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle', timeout: 45_000 })
        if (route.optional && response?.status() === 404) {
          console.log(`skip ${label}: not served here`)
          continue
        }
        const m = await page.evaluate(({ lead, selector }) => {
          // Cards inside a collapsed details element are not part of the page's
          // first read, so they do not count.
          const cards = [...document.querySelectorAll(selector)].filter(
            (el) => !el.closest('details')
          ).length
          const el = document.querySelector(lead)
          return { cards, leadTop: el ? el.getBoundingClientRect().top : null }
        }, { lead: route.lead, selector: CARD_SELECTOR })
        const messages = shapeVerdict(m)
        const top = m.leadTop === null ? 'none' : `${Math.round(m.leadTop)}px`
        console.log(`${messages.length === 0 ? 'ok  ' : 'FAIL'} ${label}: ${m.cards} cards, lead at ${top}${messages.length ? ` (${messages.join('; ')})` : ''}`)
        if (messages.length > 0) failures += 1
      } catch (error) {
        failures += 1
        console.error(`FAIL ${label}: ${error.message.split('\n')[0]}`)
      }
    }
    await context.close()
  }

  await browser.close()
  process.exit(failures === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
