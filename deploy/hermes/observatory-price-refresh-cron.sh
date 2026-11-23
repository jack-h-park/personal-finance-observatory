#!/usr/bin/env bash
# observatory-price-refresh-cron.sh — Hermes cron `--no-agent --script` entrypoint for
# `pnpm refresh:prices --if-market-open`: FX and the price fetches, the ingest and the history
# backfill, about 25 seconds, without the statement extractors, Toss or the sheet publishes
# that make up most of a full refresh.
#
# Schedule it every thirty minutes (`*/30 * * * *`, the host's local time). The script itself
# decides whether a tracked market is open, in each exchange's own time zone, so daylight
# saving needs no cron arithmetic and outside the Korean and US sessions a run is a no-op.
# The full refresh (observatory-refresh-cron.sh) is unchanged and still runs every six hours.
#
# Hermes delivers this script's STDOUT verbatim to Telegram, so stdout is the alert channel
# and silence is the success state. A price run that fails once is usually one transient
# error from a price provider, and the next run is thirty minutes away, so the wrapper speaks
# only when two runs in a row failed, once, and once more when a run succeeds again.

set -uo pipefail

REPO="${OBSERVATORY_REPO:-$HOME/workspace/code/core/jackhpark-stock-observatory}"
LOG="$REPO/logs/refresh-prices-cron.log"
STATE_FILE="${OBSERVATORY_PRICE_REFRESH_STATE:-$HOME/.config/stock-portfolio-observatory/price-refresh-cron-state}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Same PATH and interpreter handling as observatory-refresh-cron.sh: Hermes cron starts with
# a minimal PATH, and the app toolchain directory has to win so native modules load.
for _d in "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin "$HOME/.local/app-toolchain/bin"; do
  [ -d "$_d" ] && case ":$PATH:" in *":$_d:"*) ;; *) PATH="$_d:$PATH";; esac
done
export PATH="$PATH:/usr/bin:/bin:/usr/sbin:/sbin"
unset _d

if [ -z "${STOCK_PYTHON_BIN:-}" ] && [ -x "$REPO/.venv/bin/python" ]; then
  export STOCK_PYTHON_BIN="$REPO/.venv/bin/python"
fi

if [ ! -f "$REPO/package.json" ]; then
  echo "⚠️ Observatory price refresh: repo not found at $REPO"
  exit 1
fi
cd "$REPO" || { echo "⚠️ Observatory price refresh: cannot cd to $REPO"; exit 1; }

mkdir -p "$(dirname "$LOG")"

OUT="$(pnpm refresh:prices --if-market-open 2>&1)"
RC=$?

# A run that did nothing is not a result: no market was open, or a full refresh held the lock.
# Neither says anything about whether prices can be fetched, so neither touches the state
# or the log (a no-op every half hour overnight would only bury the runs that did something).
if printf '%s\n' "$OUT" | grep -qE 'skipping this price run|another refresh is already running'; then
  exit 0
fi

{
  echo "=== $STAMP price refresh (rc=$RC) ==="
  printf '%s\n' "$OUT"
} >> "$LOG"

# Keep the log from growing without bound: past 2 MB, keep the last 4000 lines.
if [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
  tail -n 4000 "$LOG" > "$LOG".tmp-$$ && mv -f "$LOG".tmp-$$ "$LOG"
fi

# State is "ok" or "fail:<consecutive failures>:<alerted 0|1>".
PREV="ok"
[ -r "$STATE_FILE" ] && PREV="$(cat "$STATE_FILE" 2>/dev/null)"
NEXT="ok"
if [ "$RC" -eq 0 ]; then
  case "$PREV" in
    fail:*:1) echo "✅ Observatory price refresh recovered." ;;
  esac
else
  COUNT=1; ALERTED=0
  case "$PREV" in
    fail:*) COUNT="$(printf '%s' "$PREV" | cut -d: -f2)"; ALERTED="$(printf '%s' "$PREV" | cut -d: -f3)"; COUNT=$((COUNT + 1)) ;;
  esac
  if [ "$COUNT" -ge 2 ] && [ "$ALERTED" -ne 1 ]; then
    STEP="$(printf '%s\n' "$OUT" | grep -oE '^== [a-z:-]+ ==' | tail -1 | tr -d '= ')"
    ERR="$(printf '%s\n' "$OUT" | grep -iE 'error|failed|refusing' | tail -1)"
    echo "⚠️ Observatory price refresh failed twice in a row${STEP:+ at $STEP} — ${ERR:-see logs/refresh-prices-cron.log}
Prices keep the last good values; the six-hour full refresh still runs."
    ALERTED=1
  fi
  NEXT="fail:$COUNT:$ALERTED"
fi

# A state file that cannot be written costs a repeat alert, not a missed one.
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null || true
printf '%s\n' "$NEXT" > "$STATE_FILE".tmp-$$ 2>/dev/null &&
  mv -f "$STATE_FILE".tmp-$$ "$STATE_FILE" 2>/dev/null || true

exit 0
