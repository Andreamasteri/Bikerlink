#!/usr/bin/env bash
# ============================================================
#  BIKERLINK — Guardia OTA
#  Verifica l'integrità del sistema di aggiornamento OTA
#  prima di ogni pubblicazione.
#
#  Uso: bash scripts/validate-ota.sh
# ============================================================

set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ERRORS=0

ok()  { echo -e "${GREEN}✔${RESET} $1"; }
fail(){ echo -e "${RED}✖ ERRORE:${RESET} $1"; ERRORS=$((ERRORS + 1)); }
info(){ echo -e "${CYAN}ℹ${RESET} $1"; }

echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo -e "${BOLD}  BikerLink — Guardia OTA${RESET}"
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo ""

LAYOUT_FILE="app/_layout.tsx"
PROFILE_FILE="app/(tabs)/profile.tsx"

# ── 1. STATIC IMPORT expo-updates in _layout.tsx ─────────────
if grep -qE "^import \* as Updates from ['\"]expo-updates['\"]" "$LAYOUT_FILE"; then
  ok "expo-updates: static import OK"
else
  fail "expo-updates deve essere importato staticamente in $LAYOUT_FILE"
  info "  Atteso: import * as Updates from \"expo-updates\""
  info "  Verificare che NON sia un dynamic import (await import(...))"
fi

# ── 2. OTASTARTUPCHECKER — 3 chiamate obbligatorie ───────────
for CALL in "Updates.checkForUpdateAsync" "Updates.fetchUpdateAsync" "Updates.reloadAsync"; do
  if grep -q "$CALL" "$LAYOUT_FILE"; then
    ok "OtaStartupChecker: $CALL OK"
  else
    fail "OtaStartupChecker manca di '$CALL'. Il checker automatico è rotto."
  fi
done

# ── 3. CURRENT_OTA_NUMBER aggiornato ─────────────────────────
CURRENT_OTA=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$PROFILE_FILE" 2>/dev/null \
  | grep -oE '[0-9]+$' || true)

if [ -z "$CURRENT_OTA" ]; then
  fail "CURRENT_OTA_NUMBER non trovato in $PROFILE_FILE"
else
  LATEST_OTA=$(node -e "
    const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
    const nums = data.filter(e => typeof e.updateNumber === 'number').map(e => e.updateNumber);
    if (nums.length === 0) { process.stderr.write('no numeric entries\n'); process.exit(1); }
    console.log(Math.max(...nums));
  " 2>/dev/null || echo "")

  if [ -z "$LATEST_OTA" ] || [ "$LATEST_OTA" = "-Infinity" ]; then
    fail "Impossibile leggere updateNumber da ota-updates.json"
  elif [ "$CURRENT_OTA" = "$LATEST_OTA" ]; then
    ok "CURRENT_OTA_NUMBER = $CURRENT_OTA corrisponde a latestOta = $LATEST_OTA"
  else
    fail "CURRENT_OTA_NUMBER=$CURRENT_OTA in profile.tsx ma l'ultima OTA in ota-updates.json è $LATEST_OTA. Aggiornare il numero prima di pubblicare."
  fi
fi

# ── 4. NESSUN PENDING nell'ultima entry ota-updates.json ──────
PENDING_CHECK=$(node -e "
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const latest = data.reduce((best, e) =>
    (typeof e.updateNumber === 'number' && e.updateNumber > (best ? best.updateNumber : -1)) ? e : best, null);
  if (!latest) { console.log('NO_ENTRY'); process.exit(0); }
  const pending = Object.entries(latest).filter(([,v]) => v === 'PENDING').map(([k]) => k);
  console.log(pending.length > 0 ? 'PENDING:' + pending.join(',') : 'OK');
" 2>/dev/null || echo "ERROR")

if [ "$PENDING_CHECK" = "OK" ]; then
  ok "ota-updates.json: nessun campo PENDING nell'ultima entry"
elif [[ "$PENDING_CHECK" == PENDING:* ]]; then
  FIELDS="${PENDING_CHECK#PENDING:}"
  fail "ota-updates.json ha campi PENDING nell'ultima entry: $FIELDS. Finalizzare prima di pubblicare."
elif [ "$PENDING_CHECK" = "NO_ENTRY" ]; then
  fail "ota-updates.json è vuoto o non ha entry valide."
else
  fail "Impossibile analizzare ota-updates.json."
fi

# ── RISULTATO FINALE ──────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════${RESET}"
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}  ✅ Sistema OTA validato — pronto per pubblicare${RESET}"
else
  echo -e "${RED}${BOLD}  ❌ $ERRORS errore/i rilevato/i — NON pubblicare finché non sono risolti${RESET}"
fi
echo -e "${BOLD}════════════════════════════════════════${RESET}"
echo ""

exit $ERRORS
