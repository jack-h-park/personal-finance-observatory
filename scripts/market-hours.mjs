// Whether the markets the portfolio is priced from are open, from the clock alone.
//
// The price-only refresh runs every thirty minutes from a scheduler that works in
// local time, and the sessions move with daylight saving (the US session is an hour
// earlier on the clock for part of the year, the Korean one never moves). Doing the
// arithmetic in each exchange's own time zone makes that a non-issue: no cron
// expression has to be rewritten twice a year.
//
// Exchange holidays are not modelled. On one the fetch returns the previous close
// and the run changes nothing, which is harmless.
//
// A session counts as open for a short grace period after its close, so the run
// that follows the bell fetches the closing price rather than the last one before it.

const SESSIONS = {
  // Korea Exchange regular session, 09:00-15:30 KST.
  KR: { timeZone: 'Asia/Seoul', opens: 9 * 60, closes: 15 * 60 + 30 },
  // NYSE and Nasdaq regular session, 09:30-16:00 ET.
  US: { timeZone: 'America/New_York', opens: 9 * 60 + 30, closes: 16 * 60 },
}

export const CLOSE_GRACE_MINUTES = 20

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

function localClock(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return { weekday: pick('weekday'), minutes: Number(pick('hour')) * 60 + Number(pick('minute')) }
}

/** { KR: boolean, US: boolean } for the given instant. */
export function marketsOpen(now = new Date()) {
  return Object.fromEntries(
    Object.entries(SESSIONS).map(([market, session]) => {
      const { weekday, minutes } = localClock(now, session.timeZone)
      const open = WEEKDAYS.has(weekday) && minutes >= session.opens && minutes < session.closes + CLOSE_GRACE_MINUTES
      return [market, open]
    })
  )
}

export function anyMarketOpen(now = new Date()) {
  return Object.values(marketsOpen(now)).some(Boolean)
}
