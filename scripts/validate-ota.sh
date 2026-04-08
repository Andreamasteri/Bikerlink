#!/usr/bin/env bash
# ============================================================
#  BIKERLINK — Guardia OTA
#  Verifica l'integrità del sistema di aggiornamento OTA
#  prima di ogni pubblicazione.
#
#  Uso interattivo:  bash scripts/validate-ota.sh
#  Uso CI:          OTA_GUARD_PASSWORD=xxxx bash scripts/validate-ota.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# ── 1. AUTENTICAZIONE ────────────────────────────────────────
EXPECTED_PASSWORD="${BIKERLINK_ADMIN_PASSWORD:-}"

if [ -z "$EXPECTED_PASSWORD" ]; then
  echo -e "${RED}✖ ERRORE:${RESET} BIKERLINK_ADMIN_PASSWORD non è impostata nell'ambiente."
  echo "   Assicurarsi che il secret sia configurato prima di eseguire questo script."
  exit 1
fi

if [ -n "${OTA_GUARD_PASSWORD:-}" ]; then
  INPUT_PASSWORD="$OTA_GUARD_PASSWORD"
else
  echo -e "${YELLOW}🔒 Inserire la password OTA per procedere:${RESET}"
  read -rs INPUT_PASSWORD
  echo ""
fi

if [ "$INPUT_PASSWORD" != "$EXPECTED_PASSWORD" ]; then
  echo -e "${RED}❌ Password errata. Accesso negato.${RESET}"
  echo ""
  exit 1
fi

echo -e "${GREEN}🔓 Accesso autorizzato.${RESET}"
echo ""
echo -e "${BOLD}Verifica invarianti sistema OTA...${RESET}"
echo ""

# ── 2. STATIC IMPORT expo-updates in _layout.tsx ─────────────
LAYOUT_FILE="app/_layout.tsx"

if grep -qE "^import \* as Updates from ['\"]expo-updates['\"]" "$LAYOUT_FILE"; then
  ok "expo-updates: static import OK"
else
  fail "expo-updates deve essere importato staticamente in $LAYOUT_FILE"
  info "  Atteso: import * as Updates from \"expo-updates\""
  info "  Verificare che NON sia un dynamic import (await import(...))"
fi

# ── 3. OTASTARTUPCHECKER intatto ─────────────────────────────
for CALL in "Updates.checkForUpdateAsync" "Updates.fetchUpdateAsync" "Updates.reloadAsync"; do
  if grep -q "$CALL" "$LAYOUT_FILE"; then
    ok "OtaStartupChecker: $CALL OK"
  else
    fail "OtaStartupChecker manca di '$CALL' in $LAYOUT_FILE. Il checker automatico è rotto."
  fi
done

# ── 4. CURRENT_OTA_NUMBER aggiornato ─────────────────────────
PROFILE_FILE="app/(tabs)/profile.tsx"

CURRENT_OTA=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$PROFILE_FILE" | grep -oE '[0-9]+$' || true)

if [ -z "$CURRENT_OTA" ]; then
  fail "CURRENT_OTA_NUMBER non trovato in $PROFILE_FILE"
else
  LATEST_OTA=$(node -e "
    const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
    const nums = data.map(e => typeof e.updateNumber === 'number' ? e.updateNumber : 0);
    console.log(Math.max(...nums));
  " 2>/dev/null || echo "")

  if [ -z "$LATEST_OTA" ]; then
    fail "Impossibile leggere updateNumber da ota-updates.json"
  elif [ "$CURRENT_OTA" = "$LATEST_OTA" ]; then
    ok "CURRENT_OTA_NUMBER = $CURRENT_OTA corrisponde a latestOta = $LATEST_OTA"
  else
    fail "CURRENT_OTA_NUMBER=$CURRENT_OTA in profile.tsx ma l'ultima OTA in ota-updates.json è $LATEST_OTA"
    info "  Aggiornare CURRENT_OTA_NUMBER a $LATEST_OTA prima di pubblicare."
  fi
fi

# ── 5. NESSUN PENDING nell'ultima entry ota-updates.json ──────
PENDING_CHECK=$(node -e "
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const latest = data.reduce((best, e) =>
    (typeof e.updateNumber === 'number' && e.updateNumber > (best?.updateNumber ?? -1)) ? e : best, null);
  if (!latest) { console.log('NO_ENTRY'); process.exit(0); }
  const pending = Object.entries(latest).filter(([,v]) => v === 'PENDING').map(([k]) => k);
  console.log(pending.length > 0 ? 'PENDING:' + pending.join(',') : 'OK');
" 2>/dev/null || echo "ERROR")

if [ "$PENDING_CHECK" = "OK" ]; then
  ok "ota-updates.json: nessun campo PENDING nell'ultima entry"
elif [[ "$PENDING_CHECK" == PENDING:* ]]; then
  FIELDS="${PENDING_CHECK#PENDING:}"
  fail "ota-updates.json ha campi PENDING nell'ultima entry: $FIELDS"
  info "  Finalizzare i campi PENDING (androidUpdateId, updateGroupId, easDashboard) prima di pubblicare."
elif [ "$PENDING_CHECK" = "NO_ENTRY" ]; then
  fail "ota-updates.json è vuoto o non ha entry valide."
else
  fail "Impossibile analizzare ota-updates.json (node error)."
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
