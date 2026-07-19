#!/usr/bin/env bash
# setup-hooks.sh — installa i git hooks di sicurezza per BikerLink
# Esegui una volta dopo aver clonato il repo: bash scripts/setup-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPT_DIR="$REPO_ROOT/scripts"

echo "🔧 Installazione git hooks BikerLink..."

# --- pre-commit: detect-secrets ---
PRE_COMMIT_SRC="$SCRIPT_DIR/pre-commit"
PRE_COMMIT_DST="$HOOKS_DIR/pre-commit"

if [[ ! -f "$PRE_COMMIT_SRC" ]]; then
  echo "❌ Script sorgente non trovato: $PRE_COMMIT_SRC"
  exit 1
fi

cp "$PRE_COMMIT_SRC" "$PRE_COMMIT_DST"
chmod +x "$PRE_COMMIT_DST"
echo "✅ pre-commit hook installato in $PRE_COMMIT_DST"

# --- Verifica detect-secrets ---
DETECT_SECRETS_BIN=""
for candidate in \
  "$(command -v detect-secrets 2>/dev/null)" \
  "$HOME/.local/bin/detect-secrets" \
  "/home/runner/workspace/.pythonlibs/bin/detect-secrets" \
  "/usr/local/bin/detect-secrets"; do
  if [[ -x "$candidate" ]]; then
    DETECT_SECRETS_BIN="$candidate"
    break
  fi
done

if [[ -z "$DETECT_SECRETS_BIN" ]]; then
  echo ""
  echo "⚠️  detect-secrets non trovato nel PATH."
  echo "   Installa con: pip install detect-secrets"
  echo "   Poi riesegui questo script."
else
  echo "✅ detect-secrets trovato: $DETECT_SECRETS_BIN"

  # Genera baseline se mancante
  BASELINE="$REPO_ROOT/.secrets.baseline"
  if [[ ! -f "$BASELINE" ]]; then
    echo "📋 Genero baseline iniziale (.secrets.baseline)..."
    cd "$REPO_ROOT"
    "$DETECT_SECRETS_BIN" scan > "$BASELINE"
    echo "✅ Baseline creata. Rivedi $BASELINE prima di committare."
  else
    echo "ℹ️  Baseline esistente trovata ($BASELINE) — non sovrascritta."
  fi
fi

# Leggi MAX_LINES dalla sorgente autorevole in modo che il summary
# rimanga sempre in sync quando il limite cambia.
LARGE_FILES_CORE="$SCRIPT_DIR/lib/large-files-core.ts"
MAX_LINES_VALUE="800"  # fallback se il file non è leggibile
if [[ -f "$LARGE_FILES_CORE" ]]; then
  _extracted=$(grep -E '^export const MAX_LINES\s*=' "$LARGE_FILES_CORE" | grep -oE '[0-9]+' | head -1)
  if [[ -n "$_extracted" ]]; then
    MAX_LINES_VALUE="$_extracted"
  fi
fi

echo ""
echo "🎉 Setup completato. Il hook pre-commit è attivo."
echo "   Gate inclusi nel pre-commit:"
echo "     • detect-secrets                  — blocca commit con token/segreti"
echo "     • check-large-files               — ratchet $MAX_LINES_VALUE righe per file"
echo "     • lint-migration-indexes          — indici DESC/WHERE a rischio"
echo "     • check-ai-direct-generateobject  — bypass generateStructured rilevato"
echo "     • check-deploy-build-step-numbers — numerazione [N/TOTAL] corretta"
echo "   Per bypassare (solo falsi positivi): git commit --no-verify"

# Verifica wiring post-installazione
echo ""
echo "🔍 Verifica wiring hook installato..."
if bash "$SCRIPT_DIR/check-pre-commit-hook-wiring.sh"; then
  echo "✅ Wiring verificato — il hook è aggiornato e include tutti i gate."
else
  echo "❌ Wiring fallito — qualcosa non va con il hook appena installato."
  exit 1
fi
