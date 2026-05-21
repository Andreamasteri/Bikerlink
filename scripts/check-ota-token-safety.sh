#!/usr/bin/env bash
# ============================================================
#  BIKERLINK — OTA Token Safety Guard
#  Verifica che .local/ota-token non sia mai committato
#  né rimosso dal .gitignore per errore.
#
#  Uso: bash scripts/check-ota-token-safety.sh
# ============================================================

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ERRORS=0

ok()   { echo -e "${GREEN}✔${RESET} $1"; }
fail() { echo -e "${RED}✖ ERRORE:${RESET} $1"; ERRORS=$((ERRORS + 1)); }
info() { echo -e "${CYAN}ℹ${RESET} $1"; }

echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "${BOLD}  BikerLink — OTA Token Safety Guard${RESET}"
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo ""

TOKEN_PATH=".local/ota-token"
GITIGNORE=".gitignore"

# ── 1. TOKEN ELENCATO IN .gitignore ──────────────────────────
if grep -qF "$TOKEN_PATH" "$GITIGNORE" 2>/dev/null; then
  ok "$TOKEN_PATH è presente in $GITIGNORE"
else
  fail "$TOKEN_PATH NON è elencato in $GITIGNORE — aggiungere subito la riga '$TOKEN_PATH'"
  info "  Comando: echo '$TOKEN_PATH' >> $GITIGNORE"
fi

# ── 2. TOKEN NON TRACCIATO DA GIT ────────────────────────────
if git ls-files --error-unmatch "$TOKEN_PATH" > /dev/null 2>&1; then
  fail "$TOKEN_PATH è TRACCIATO da git — rimuoverlo dall'indice immediatamente!"
  info "  Comando: git rm --cached $TOKEN_PATH"
  info "  Poi aggiungere '$TOKEN_PATH' a $GITIGNORE se mancante."
else
  ok "$TOKEN_PATH non è tracciato da git"
fi

# ── 3. TOKEN NON IN STAGING (--cached) ───────────────────────
if git diff --cached --name-only 2>/dev/null | grep -qF "$TOKEN_PATH"; then
  fail "$TOKEN_PATH è in staging (sarà incluso nel prossimo commit) — rimuoverlo con: git restore --staged $TOKEN_PATH"
else
  ok "$TOKEN_PATH non è in staging"
fi

# ── RISULTATO FINALE ──────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✅ OTA token al sicuro — nessun rischio di leak${RESET}"
else
  echo -e "${RED}${BOLD}  ❌ $ERRORS problema/i rilevato/i — rischio leak token OTA!${RESET}"
fi
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo ""

exit $ERRORS
