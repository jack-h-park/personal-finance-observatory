import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'

// /data-ops holds the one work queue: every kind the adapter can queue, each
// linking to the card that lists it, never back to /data-ops itself. The
// fixture is made up: one held position with no tax lots (a position break),
// one lot with no holding (another), one tickerless income row (a manual
// mapping), one unvalued holding (a valuation gap) and one failing check. No
// price, FX or source file exists, so the freshness row is queued too.

const dir = mkdtempSync(path.join(tmpdir(), 'work-queue-'))
const dbPath = path.join(dir, 'portfolio.db')
const db = new Database(dbPath)
db.exec(`
create table source_files (name text primary key, filename text not null, mtime_ms integer not null);
create table holdings (market text, currency text, brokerage text, account text, ticker text, name text, quantity real,
  native_cost real, base_cost real, total_cost_krw real, native_market_value real, base_market_value real,
  account_wrapper text not null default 'taxable');
create table tax_lots (market text, brokerage text, ticker text, name text, open_quantity real, cost_basis_krw real);
create table transactions (market text, brokerage text);
create table dividends (market text, currency text, brokerage text, account text, ticker text, income_category text,
  mapping_status text, type text, name text, source text, native_amount real, amount_krw real);
create table validation_checks (id integer primary key, name text, detail text, status text, severity text);
`)
db.prepare('insert into holdings values (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('US', 'USD', 'Sample Broker', 'Sample 1', 'AAA', 'Sample A', 2, 10, 13000, 13000, null, null, 'taxable')
db.prepare('insert into tax_lots values (?,?,?,?,?,?)').run('US', 'Sample Broker', 'BBB', 'Sample B', 1, 5000)
db.prepare('insert into dividends values (?,?,?,?,?,?,?,?,?,?,?,?)').run('US', 'USD', 'Sample Broker', 'Sample 1', null, 'interest', 'tickerless', 'Interest', 'Sample interest', 'sample.csv', 1, 1300)
db.prepare('insert into validation_checks (name, detail, status, severity) values (?,?,?,?)').run('sample_check', 'made up', 'fail', 'warning')
db.close()

async function load() {
  const { config } = await import('@/config')
  config.stockDbPath = dbPath
  for (const key of ['stockKrPricesPath', 'stockUsPricesPath', 'stockCryptoPricesPath', 'stockFxRatesPath', 'stockManualMappingsPath'] as const) {
    config[key] = path.join(dir, `${key}.json`)
  }
  return import('../lib/adapters/portfolio-db')
}

test('the data-ops queue carries position breaks, linked to the reconciliation card that lists them', async () => {
  const { getDataOpsReview, getReconciliationReview } = await load()
  const queue = getDataOpsReview().actionQueue
  const breaks = getReconciliationReview().positionBreaks
  assert.equal(breaks.length, 2)
  const row = queue.find((item) => item.kind === 'position_breaks')
  assert.deepEqual(row, { kind: 'position_breaks', priority: 'medium', count: breaks.length, href: '/reconciliation#reconciliation-breaks' })
})

test('every kind is queued once, and no queue row links back to /data-ops', async () => {
  const { getDataOpsReview } = await load()
  const queue = getDataOpsReview().actionQueue
  assert.deepEqual(
    queue.map((item) => item.kind),
    ['validation', 'source_freshness', 'manual_mappings', 'position_breaks', 'valuation'],
  )
  for (const item of queue) {
    assert.notEqual(item.href, '/data-ops', item.kind)
    assert.ok(!item.href.startsWith('/data-ops#') && !item.href.startsWith('/data-ops?'), `${item.kind} reloads /data-ops: ${item.href}`)
  }
  assert.deepEqual(
    Object.fromEntries(queue.map((item) => [item.kind, item.href])),
    {
      validation: '/health',
      source_freshness: '/health',
      manual_mappings: '#data-ops-manual-mappings',
      position_breaks: '/reconciliation#reconciliation-breaks',
      valuation: '#data-ops-valuation',
    },
  )
})

test('the reconciliation review no longer builds a queue of its own', async () => {
  const { getReconciliationReview } = await load()
  assert.equal('actionQueue' in getReconciliationReview(), false)
})

// Each in-page anchor the queue emits lands on a Card that always renders on
// /data-ops, and the /reconciliation target is the breaks card.
test('every anchor a queue row links to is a Card id on its page', async () => {
  const { WORK_QUEUE_HREF } = await load()
  const pages: Record<string, string> = { '': 'app/data-ops/page.tsx', '/reconciliation': 'app/reconciliation/page.tsx' }
  const anchors = Object.values(WORK_QUEUE_HREF).filter((href) => href.includes('#'))
  assert.ok(anchors.length >= 3, anchors.join(', '))
  for (const href of anchors) {
    const [route, id] = href.split('#')
    const source = readFileSync(pages[route], 'utf8')
    assert.equal((source.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1, `exactly one id="${id}" in ${pages[route]}`)
    assert.ok(source.includes(`<Card id="${id}"`), `id="${id}" is not on a Card in ${pages[route]}`)
  }
})

// The Action Center hero counts the queue; the tiles under it split that
// count, breaks included, so the visible parts add up to the headline.
test('the action center tiles add up to the headline, position breaks included', async () => {
  const { getDataOpsReview, getReconciliationReview } = await load()
  const { dataOpsLinkedIssues, dataOpsQueueTiles } = await import('@/lib/header-status')
  const { getPageCopy } = await import('@/lib/ui-copy')
  const queue = getDataOpsReview().actionQueue
  const tiles = dataOpsQueueTiles(queue)
  assert.equal(tiles.breaks, getReconciliationReview().positionBreaks.length)
  const headline = dataOpsLinkedIssues(getPageCopy('dataOps', 'en'), queue).issues.count
  assert.equal(tiles.mapping + tiles.valuation + tiles.sourceCheck + tiles.breaks, headline)
  assert.deepEqual(dataOpsQueueTiles([]), { mapping: 0, valuation: 0, sourceCheck: 0, breaks: 0 })
})

test('the action center KPI band reads every tile from the queue, breaks among them', () => {
  const source = readFileSync('app/data-ops/page.tsx', 'utf8')
  const band = source.slice(source.indexOf('<KpiBand'), source.indexOf('</KpiBand>'))
  for (const tile of ['tiles.mapping', 'tiles.valuation', 'tiles.sourceCheck', 'tiles.breaks']) {
    assert.ok(band.includes(`fmtNumber(${tile})`), `the band shows ${tile}`)
  }
  assert.ok(band.includes('copy.positionBreaks'), 'the breaks tile has its own label')
})
