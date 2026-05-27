#!/bin/bash
# check-direct-eval-scope.sh — Enforce che `eval(` esista in un solo file
# documentato del server. Serve a "restringere lo scope" dell'esbuild flag
# `--log-override:direct-eval=silent` impostato in scripts/build-server.sh:
# il flag silenzia il warning a livello bundle, ma questo check garantisce
# che il warning non si stia in realtà nascondendo per nuovo codice non
# autorizzato.
#
# File autorizzato (unico): server/ai/db-integrity/registry.ts
# Motivazione: serve `import.meta.url` in dev ESM (tsx) con fallback safe
# a __dirname nel bundle CJS. Vedi commento inline nel file.
#
# Exit 0 → OK (solo il file autorizzato usa eval).
# Exit 1 → FAIL (un altro file ha introdotto eval direct call).

set -uo pipefail

ALLOWED_FILE="server/ai/db-integrity/registry.ts"

# Ricerca `eval(` ignorando commenti // e /* */ con un filtro semplice
# (sufficiente perché il match avviene su statement TS reali).
MATCHES=$(rg -n '^\s*[^/*\s].*\beval\(' server/ shared/ --type ts 2>/dev/null || true)

if [ -z "$MATCHES" ]; then
  echo "[check-direct-eval-scope] OK — nessuna chiamata eval() trovata."
  exit 0
fi

# Estrai i path unici dei file che usano eval.
USED_FILES=$(echo "$MATCHES" | awk -F: '{print $1}' | sort -u)

VIOLATIONS=""
for f in $USED_FILES; do
  if [ "$f" != "$ALLOWED_FILE" ]; then
    VIOLATIONS+="$f"$'\n'
  fi
done

if [ -n "$VIOLATIONS" ]; then
  echo "[check-direct-eval-scope] FAIL — eval() trovato in file NON autorizzati:"
  echo "$VIOLATIONS" | sed 's/^/  - /'
  echo ""
  echo "Solo $ALLOWED_FILE può usare eval() (vedi commento inline nel file)."
  echo "Se serve davvero eval() altrove, prima rimuovi il flag"
  echo "  --log-override:direct-eval=silent"
  echo "da scripts/build-server.sh, poi aggiorna questo check."
  exit 1
fi

echo "[check-direct-eval-scope] OK — eval() solo in $ALLOWED_FILE (autorizzato)."
exit 0
