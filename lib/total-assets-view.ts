import type { TotalAssetsPoint } from '@/lib/net-worth'
import type { ClassKey } from '@/lib/total-assets-change'

export const ASSET_CLASS_KEYS: readonly ClassKey[] = ['stocks', 'crypto', 'cash', 'pensions', 'gold']

/**
 * The classes a `?classes=` value names, in stack order. Absent, empty or
 * naming no known class: every class, so the chart is never blank.
 */
export function resolveClasses(param: string | string[] | undefined): ClassKey[] {
  const raw = Array.isArray(param) ? param[0] : param
  const named = new Set((raw ?? '').split(',').map((part) => part.trim()))
  const picked = ASSET_CLASS_KEYS.filter((key) => named.has(key))
  return picked.length ? picked : [...ASSET_CLASS_KEYS]
}

/**
 * The `?classes=` value after toggling one class, or null for "every class"
 * (no parameter). Turning off the last class is refused: the selection stays.
 */
export function toggleClass(selected: readonly ClassKey[], key: ClassKey): string | null {
  const next = selected.includes(key) ? selected.filter((item) => item !== key) : ASSET_CLASS_KEYS.filter((item) => item === key || selected.includes(item))
  if (!next.length) return selected.length === ASSET_CLASS_KEYS.length ? null : selected.join(',')
  return next.length === ASSET_CLASS_KEYS.length ? null : next.join(',')
}

/**
 * Points for the stacked chart restricted to `classes`: a hidden class is null
 * and adds nothing, and `total` is the sum of the shown classes. In `share`
 * mode each shown class is its percent of that sum, so the stack reaches 100;
 * a date where the shown classes sum to zero has no shares (every class null).
 */
export function viewPoints(points: readonly TotalAssetsPoint[], classes: readonly ClassKey[], share: boolean): TotalAssetsPoint[] {
  const shown = new Set(classes)
  return points.map((point) => {
    const total = ASSET_CLASS_KEYS.reduce((sum, key) => sum + (shown.has(key) ? (point[key] ?? 0) : 0), 0)
    const value = (key: ClassKey) => {
      if (!shown.has(key) || point[key] == null) return null
      if (!share) return point[key]
      return total === 0 ? null : (point[key]! / total) * 100
    }
    return {
      date: point.date,
      stocks: value('stocks'),
      crypto: value('crypto'),
      cash: value('cash'),
      pensions: value('pensions'),
      gold: value('gold'),
      total: share ? (total === 0 ? 0 : 100) : total,
    }
  })
}
