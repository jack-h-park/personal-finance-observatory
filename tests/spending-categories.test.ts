import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSpending, type SpendingViewRow } from '../lib/domain/spending-view'
import {
  SPENDING_CATEGORY_KEYS,
  SPENDING_CATEGORY_SOURCES,
  canonicalSpendingCategory,
  categoryShareItems,
  withCanonicalCategories,
} from '../lib/spending-categories'
import { getPageCopy } from '../lib/ui-copy'

test('issuer and BankSalad labels for the same kind of spending share one key', () => {
  for (const label of ['식비', '카페/간식', 'Dining & Drinks', 'Groceries']) assert.equal(canonicalSpendingCategory(label), 'food')
  for (const label of ['온라인쇼핑', '패션/쇼핑', 'Shopping']) assert.equal(canonicalSpendingCategory(label), 'shopping')
  for (const label of ['주거/통신', '주거비', 'Utilities']) assert.equal(canonicalSpendingCategory(label), 'housing')
  assert.equal(canonicalSpendingCategory('Home'), 'household')
  assert.equal(canonicalSpendingCategory('자녀/육아'), 'education')
  assert.equal(canonicalSpendingCategory(' Travel '), 'travel')
})

test('an unmapped label passes through, and no label stays none', () => {
  assert.equal(canonicalSpendingCategory('Pets'), 'Pets')
  assert.equal(canonicalSpendingCategory(undefined), undefined)
})

test('every source label maps to exactly one key, and every key is named in both languages', () => {
  const seen = new Map<string, string>()
  for (const key of SPENDING_CATEGORY_KEYS) {
    for (const label of SPENDING_CATEGORY_SOURCES[key]) {
      assert.equal(seen.has(label), false, `${label} is listed under ${seen.get(label)} and ${key}`)
      seen.set(label, key)
    }
  }
  for (const language of ['en', 'ko'] as const) {
    const names = getPageCopy('spending', language).categoryNames
    for (const key of SPENDING_CATEGORY_KEYS) assert.ok(names[key], `${language} has no name for ${key}`)
  }
})

const row = (id: string, currency: 'USD' | 'KRW', amountMinor: number, category?: string): SpendingViewRow => ({
  id, accountId: 'a', postedDate: '2026-07-10', activityDate: '2026-07-10', currency, amountMinor, kind: 'purchase', description: id,
  ...(category ? { category, categorySource: currency === 'USD' ? 'issuer' as const : 'banksalad' as const } : {}),
})

test('the rankings merge a USD issuer label and a KRW BankSalad label into one row', () => {
  const rates = new Map([['2026-07-10', { date: '2026-07-10', rate: 1400, source: 'test' }]])
  const rows = withCanonicalCategories([row('a', 'USD', -1000, 'Shopping'), row('b', 'KRW', -5000, '온라인쇼핑'), row('c', 'KRW', -700, 'Pets'), row('d', 'KRW', -300)])
  const { categories, uncategorized, categorySources } = analyzeSpending(rows, { today: '2026-08-10', period: 12, rates }).combined
  assert.deepEqual(categories, [{ name: 'shopping', amountMinor: 19000, count: 2 }, { name: 'Pets', amountMinor: 700, count: 1 }])
  assert.deepEqual(uncategorized, { amountMinor: 300, count: 1 })
  assert.deepEqual(categorySources, { issuer: 1, notion: 0, banksalad: 2 })
})

test('category shares put the leading categories first, the rest together, then uncategorized', () => {
  const combined = {
    categories: [{ name: 'food', amountMinor: 5000, count: 5 }, { name: 'shopping', amountMinor: 3000, count: 3 }, { name: 'travel', amountMinor: 1000, count: 1 }],
    uncategorized: { amountMinor: 1000, count: 2 },
  }
  assert.deepEqual(categoryShareItems(combined, 2), [
    { key: 'food', amountMinor: 5000, count: 5, pct: 50 },
    { key: 'shopping', amountMinor: 3000, count: 3, pct: 30 },
    { key: 'rest', amountMinor: 1000, count: 1, pct: 10 },
    { key: 'uncategorized', amountMinor: 1000, count: 2, pct: 10 },
  ])
  assert.deepEqual(categoryShareItems({ categories: [], uncategorized: { amountMinor: 0, count: 0 } }, 2), [])
})
