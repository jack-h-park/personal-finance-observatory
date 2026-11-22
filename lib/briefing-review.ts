import type {
  BriefingActivity,
  BriefingMarket,
  BriefingMoverNote,
  BriefingPosition,
  BriefingSessionMove,
} from '@/lib/adapters/briefing-archive'

/*
 * Reshapes one market of an archived briefing for the review page.
 *
 * The published briefing site is the reading surface; this page is the archive
 * view, so it shows each researched note once and keeps everything without a
 * note to a single line of ticker and change. The same ticker routinely sits in
 * both the "since the previous briefing" list and the "versus cost" list with
 * the same note, and repeating that paragraph twice is most of what made the
 * page long.
 *
 * Nothing here recomputes a figure: every number is carried from the document
 * as written. It only groups and filters.
 */

/** One ticker with something written about it, shown once. */
export type NotedMover = {
  ticker: string
  name: string | null
  /** The move since the previous briefing, when the ticker was a session mover. */
  session: BriefingSessionMove | null
  /** Standing versus cost, when the ticker was a best/worst-versus-cost mover. */
  vsCost: BriefingPosition | null
  /** The researched note, or null when only a restatement caveat applies. */
  why: string | null
}

export type MarketReview = {
  noted: NotedMover[]
  /** Session movers with nothing written about them. */
  quietUp: BriefingSessionMove[]
  quietDown: BriefingSessionMove[]
  /** Versus-cost movers with nothing written about them, and not already noted above. */
  quietBest: BriefingPosition[]
  quietWorst: BriefingPosition[]
  /** Share-count changes worth a row of their own. */
  activity: BriefingActivity[]
  /** Buys and sells of less than one share, folded into a count. */
  fractional: BriefingActivity[]
}

type Notes = Record<string, BriefingMoverNote | undefined>

/**
 * A buy or sell of under one share is almost always a dividend reinvestment or a
 * fractional top-up. Opening, closing and a restated count change what is held,
 * so those keep their row whatever the size.
 */
export function isFractionalTrade(a: BriefingActivity) {
  return (a.kind === 'bought' || a.kind === 'sold') && Math.abs(a.quantityChange) < 1
}

const noteOf = (notes: Notes, ticker: string) => {
  const why = notes[ticker]?.why
  return typeof why === 'string' && why.trim() ? why : null
}

export function reviewMarket(market: BriefingMarket, notes: Notes): MarketReview {
  const session = market.session?.available && !market.session.marketClosed ? market.session : null
  const byTicker = new Map<string, NotedMover>()
  const noted: NotedMover[] = []

  const entry = (ticker: string, name: string | null | undefined) => {
    let found = byTicker.get(ticker)
    if (!found) {
      found = { ticker, name: name ?? null, session: null, vsCost: null, why: noteOf(notes, ticker) }
      byTicker.set(ticker, found)
      noted.push(found)
    } else if (!found.name && name) {
      found.name = name
    }
    return found
  }

  const quietUp: BriefingSessionMove[] = []
  const quietDown: BriefingSessionMove[] = []
  for (const [list, quiet] of [
    [session?.gainers ?? [], quietUp],
    [session?.losers ?? [], quietDown],
  ] as const) {
    for (const m of list) {
      // A suspected restatement carries its own caveat, so it is never "quiet".
      if (noteOf(notes, m.ticker) || m.suspectedRestatement) entry(m.ticker, m.name).session = m
      else quiet.push(m)
    }
  }

  const quietBest: BriefingPosition[] = []
  const quietWorst: BriefingPosition[] = []
  const aggregates = market.aggregates
  // With few eligible positions one ticker can rank in both cost lists; list it once.
  const quietCost = new Set<string>()
  for (const [list, quiet] of [
    [aggregates?.gainers ?? [], quietBest],
    [aggregates?.losers ?? [], quietWorst],
  ] as const) {
    for (const p of list) {
      const existing = byTicker.get(p.ticker)
      if (existing) existing.vsCost ??= p
      else if (noteOf(notes, p.ticker)) entry(p.ticker, p.name).vsCost = p
      else if (!quietCost.has(p.ticker)) {
        quietCost.add(p.ticker)
        quiet.push(p)
      }
    }
  }

  const activity: BriefingActivity[] = []
  const fractional: BriefingActivity[] = []
  // Activity is shown on a closed-market day too: the share counts still moved.
  for (const a of market.session?.available ? market.session.activity : []) {
    ;(isFractionalTrade(a) ? fractional : activity).push(a)
  }

  return { noted, quietUp, quietDown, quietBest, quietWorst, activity, fractional }
}
