#!/usr/bin/env bash
set -euo pipefail

post_codex_state() {
  local state="$1"
  local payload
  payload="{\"event\":\"$state\",\"source\":\"codex-wrapper\"}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsS \
      -H 'content-type: application/json' \
      -d "$payload" \
      http://127.0.0.1:17361/hooks/codex >/dev/null 2>&1 || true
  fi
}

post_codex_state "generating"
trap 'post_codex_state "idle"' EXIT

command codex "$@"
