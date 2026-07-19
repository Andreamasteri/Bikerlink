#!/usr/bin/env bash
# CI ratchet for the "max 800 lines per TS file" rule.
# When splitting, target ≤750 lines per resulting file (see replit.md).
#
# Wraps `scripts/check-large-files-ratchet.ts` and enforces the
# human-only gate on `--update-baseline`. See replit.md
# "⛔ REGOLA FERREA — Limite 800 righe per file".
#
# Usage:
#   bash scripts/check-large-files-ratchet.sh
#   BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-large-files-ratchet.sh --update-baseline

set -euo pipefail

UPDATE=false
for arg in "$@"; do
  if [[ "$arg" == "--update-baseline" ]]; then
    UPDATE=true
  fi
done

if [[ "$UPDATE" == "true" && "${BIKERLINK_HUMAN_BASELINE_UPDATE:-0}" != "1" ]]; then
  echo "❌ Solo l'utente può aggiornare la baseline. Se il file si è ridotto, chiedi all'utente di eseguire \`BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-large-files-ratchet.sh --update-baseline\`."
  exit 1
fi

exec npx tsx scripts/check-large-files-ratchet.ts "$@"
