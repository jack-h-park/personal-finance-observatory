#!/usr/bin/env bash
set -euo pipefail

label=com.jackpark.stock-observatory
system_target="system/$label"
system_plist="/Library/LaunchDaemons/$label.plist"
gui_domain="gui/$(id -u)"
gui_target="$gui_domain/$label"
gui_plist="$HOME/Library/LaunchAgents/$label.plist"
template="$(dirname "${BASH_SOURCE[0]}")/$label.plist"

system_installed() {
  [ -e "$system_plist" ] || [ -L "$system_plist" ] ||
    launchctl print "$system_target" >/dev/null 2>&1
}

gui_registered() {
  launchctl print "$gui_target" >/dev/null 2>&1
}

gui_only() {
  if system_installed; then
    case "$1" in
      redeploy) hint="Run make prepare-system-redeploy as runtime, then activate as administrator." ;;
      install-service) hint="Run make stage-system-service as runtime to prepare a system plist." ;;
      *) hint="Manage $system_target from an administrator session." ;;
    esac
    echo "refusing $1: $system_target is the installed web service. $hint" >&2
    exit 1
  fi
}

require_runtime() {
  if [ "$(id -un)" != runtime ] || [ "$HOME" != /Users/runtime ]; then
    echo "run this command as runtime with HOME=/Users/runtime" >&2
    exit 1
  fi
}

require_system_stage() {
  require_runtime
  if gui_registered; then
    echo "refusing to stage while $gui_target is registered" >&2
    exit 1
  fi
}

render_plist() {
  local dest="$1" workdir="$2" pnpm="$3" node_dir="$4"
  cp "$template" "$dest"
  plutil -replace WorkingDirectory -string "$workdir" "$dest"
  plutil -replace StandardOutPath -string "$workdir/logs/observatory.out.log" "$dest"
  plutil -replace StandardErrorPath -string "$workdir/logs/observatory.err.log" "$dest"
  plutil -remove ProgramArguments.0 "$dest"
  plutil -insert ProgramArguments.0 -string "$pnpm" "$dest"
  plutil -replace EnvironmentVariables.PATH -string "$node_dir:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" "$dest"
}

case "$1" in
  production-guard)
    if system_installed || gui_registered ||
      launchctl list 2>/dev/null | awk -v label="$label" '$3 == label { found=1 } END { exit !found }'; then
      echo "refusing: $label is installed here, so this is the host. Its database is the source, not a copy." >&2
      exit 1
    fi
    ;;
  gui-only)
    gui_only "$2"
    ;;
  require-system-stage)
    require_system_stage
    ;;
  require-runtime-system)
    require_runtime
    if ! launchctl print "$system_target" >/dev/null 2>&1 ||
      [ "$(plutil -extract UserName raw -o - "$system_plist")" != runtime ] ||
      [ "$(plutil -extract WorkingDirectory raw -o - "$system_plist")" != "$(pwd -P)" ]; then
      echo "run $2 from the checkout registered as $system_target under runtime" >&2
      exit 1
    fi
    if gui_registered; then
      echo "refusing $2: both $system_target and $gui_target are registered" >&2
      exit 1
    fi
    ;;
  status)
    target="$gui_target"
    if system_installed; then target="$system_target"; fi
    if details=$(launchctl print "$target" 2>/dev/null); then
      echo "$target"
      printf '%s\n' "$details" | awk '/^[[:space:]]*(path|state|username|pid|runs|last exit code) = /'
    else
      echo "$target: not loaded"
    fi
    ;;
  restart-gui)
    gui_only restart
    launchctl kickstart -k "$gui_target"
    ;;
  stop-gui|uninstall-gui)
    gui_only "${1%-gui}"
    if gui_registered; then launchctl bootout "$gui_target"; fi
    if [ "$1" = uninstall-gui ]; then rm -f "$gui_plist"; fi
    ;;
  install-gui)
    gui_only install-service
    mkdir -p "$(dirname "$gui_plist")" "$2/logs"
    stage=$(mktemp "$gui_plist.XXXXXXXX")
    trap 'rm -f "$stage"' EXIT
    render_plist "$stage" "$2" "$3" "$4"
    plutil -lint "$stage"
    if gui_registered; then launchctl bootout "$gui_target"; fi
    mv "$stage" "$gui_plist"
    launchctl bootstrap "$gui_domain" "$gui_plist"
    ;;
  stage-system)
    require_system_stage
    mkdir -p "$2/logs"
    stage_dir=$(mktemp -d -t observatory-launchd)
    stage="$stage_dir/$label.plist"
    render_plist "$stage" "$2" "$3" "$4"
    plutil -insert UserName -string runtime "$stage"
    plutil -insert EnvironmentVariables.HOME -string "$HOME" "$stage"
    plutil -lint "$stage"
    echo "Staged $stage for administrator installation. Keep only one registration."
    ;;
  *)
    echo "unknown service action: $1" >&2
    exit 2
    ;;
esac
