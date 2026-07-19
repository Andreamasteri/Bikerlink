#!/usr/bin/env bash
# check-large-files-limit-sync.sh
# Verifica che setup-hooks.sh non sia scivolato verso un numero hardcoded
# che diverge da MAX_LINES in scripts/lib/large-files-core.ts.
#
# Casi gestiti:
#   OK  — setup-hooks.sh legge dinamicamente large-files-core.ts
#         (contiene sia il riferimento al file che la variabile $MAX_LINES_VALUE)
#   OK  — setup-hooks.sh ha un numero hardcoded e coincide con MAX_LINES
#   FAIL — setup-hooks.sh ha un numero hardcoded diverso da MAX_LINES
#   FAIL — setup-hooks.sh non usa né dinamica né numero riconoscibile

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
CORE="$REPO_ROOT/scripts/lib/large-files-core.ts"
HOOKS="$REPO_ROOT/scripts/setup-hooks.sh"

# --- Estrai MAX_LINES dalla sorgente autorevole ---
AUTHORITATIVE=$(grep -E '^export const MAX_LINES\s*=' "$CORE" | grep -oE '[0-9]+' | head -1)
if [[ -z "$AUTHORITATIVE" ]]; then
  echo "❌ Impossibile estrarre MAX_LINES da $CORE"
  exit 1
fi

# --- Controlla se setup-hooks.sh usa l'estrazione dinamica ---
# La presenza di entrambi i marker indica il pattern sicuro.
USES_DYNAMIC=false
if grep -q 'large-files-core\.ts' "$HOOKS" && grep -q 'MAX_LINES_VALUE' "$HOOKS"; then
  USES_DYNAMIC=true
fi

if [[ "$USES_DYNAMIC" == "true" ]]; then
  echo "✅ check-large-files-limit-sync: setup-hooks.sh usa l'estrazione dinamica da large-files-core.ts (MAX_LINES=$AUTHORITATIVE) — nessun drift possibile."
  # Still run the broader docs/scripts gate-reference scan before exiting.
  bash "$(dirname "$0")/check-large-files-docs-sync.sh"
  exit $?
fi

# --- Fallback: cerca un numero hardcoded nella riga check-large-files ---
SUMMARY=$(grep -E 'check-large-files' "$HOOKS" | grep -oE '[0-9]+' | head -1)
if [[ -z "$SUMMARY" ]]; then
  echo "❌ setup-hooks.sh non usa il pattern dinamico NÉ un numero hardcoded riconoscibile."
  echo "   Ripristina il blocco di lettura dinamica (large-files-core.ts + MAX_LINES_VALUE)"
  echo "   oppure hardcoda il valore corretto: $AUTHORITATIVE"
  exit 1
fi

if [[ "$AUTHORITATIVE" != "$SUMMARY" ]]; then
  echo "❌ DRIFT rilevato: MAX_LINES in large-files-core.ts = $AUTHORITATIVE"
  echo "   ma setup-hooks.sh riporta $SUMMARY righe nel summary."
  echo ""
  echo "   Aggiorna setup-hooks.sh per usare il pattern dinamico oppure"
  echo "   imposta il numero a $AUTHORITATIVE."
  exit 1
fi

echo "✅ check-large-files-limit-sync: numero hardcoded $SUMMARY in sync con MAX_LINES=$AUTHORITATIVE"

# --- Also run the broader docs/scripts gate-reference scan ---
bash "$(dirname "$0")/check-large-files-docs-sync.sh"
