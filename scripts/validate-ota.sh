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
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ERRORS=0

ok()   { echo -e "${GREEN}✔${RESET} $1"; }
fail() { echo -e "${RED}✖ ERRORE:${RESET} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "${YELLOW}⚠ ATTENZIONE:${RESET} $1"; }
info() { echo -e "${CYAN}ℹ${RESET} $1"; }

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

# ── 3. CURRENT_OTA_NUMBER aggiornato (cycle-aware, last by position) ─────
# DESIGN: si usa l'ultima entry PER POSIZIONE nell'array (non per status=published).
# Motivo: la procedura OTA prevede che l'entry venga aggiunta in ota-updates.json
# PRIMA di pubblicare (con CURRENT_OTA_NUMBER già aggiornato in profile.tsx).
# Al momento del check la entry può avere status "building"/"pending".
# Usare status="published" causerebbe un falso-OK: il check passerebbe anche
# se CURRENT_OTA_NUMBER non fosse stato ancora aggiornato (confronterebbe con
# la OTA precedente già published). "Last by position" è il criterio corretto
# per catturare il drift prima che la pubblicazione avvenga.
CURRENT_OTA=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$PROFILE_FILE" 2>/dev/null \
  | grep -oE '[0-9]+$' || true)

if [ -z "$CURRENT_OTA" ]; then
  fail "CURRENT_OTA_NUMBER non trovato in $PROFILE_FILE"
else
  LATEST_OTA=$(node -e "
    const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
    const rv = appJson?.expo?.runtimeVersion ?? null;
    const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
    const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
    if (cycle.length === 0) { console.log('NEW_CYCLE'); process.exit(0); }
    // Ultima entry per posizione: corrisponde all'OTA preparata o appena pubblicata.
    // Non si usa status='published' (vedi commento sopra).
    console.log(cycle[cycle.length - 1].updateNumber);
  " 2>/dev/null || echo "")

  if [ -z "$LATEST_OTA" ]; then
    fail "Impossibile leggere updateNumber da ota-updates.json"
  elif [ "$LATEST_OTA" = "NEW_CYCLE" ]; then
    ok "Nuovo ciclo runtimeVersion — nessuna OTA pubblicata ancora (CURRENT_OTA_NUMBER=$CURRENT_OTA atteso a 1)"
  elif [ "$CURRENT_OTA" = "$LATEST_OTA" ]; then
    ok "CURRENT_OTA_NUMBER = $CURRENT_OTA corrisponde all'ultima entry del ciclo corrente"
  else
    fail "CURRENT_OTA_NUMBER=$CURRENT_OTA in profile.tsx ma l'ultima entry del ciclo corrente in ota-updates.json è OTA-$LATEST_OTA. Aggiornare prima di pubblicare."
  fi
fi

# ── 4a. NESSUN PENDING nell'ultima entry del ciclo corrente ──
PENDING_LAST=$(node -e "
  const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
  if (cycle.length === 0) { console.log('NO_ENTRY'); process.exit(0); }
  // Ultima entry per posizione (coerente con check 3)
  const latest = cycle[cycle.length - 1];
  const pending = Object.entries(latest).filter(([,v]) => v === 'PENDING').map(([k]) => k);
  console.log(pending.length > 0 ? 'PENDING:' + pending.join(',') : 'OK');
" 2>/dev/null || echo "ERROR")

if [ "$PENDING_LAST" = "OK" ]; then
  ok "ota-updates.json: nessun campo PENDING nell'ultima entry"
elif [[ "$PENDING_LAST" == PENDING:* ]]; then
  FIELDS="${PENDING_LAST#PENDING:}"
  fail "ota-updates.json ha campi PENDING nell'ultima entry: $FIELDS. Finalizzare prima di pubblicare."
elif [ "$PENDING_LAST" = "NO_ENTRY" ]; then
  ok "ota-updates.json: nuovo ciclo runtimeVersion, nessuna entry ancora — OK"
else
  fail "Impossibile analizzare ota-updates.json."
fi

# ── 4b. NESSUN PENDING in qualsiasi entry del ciclo corrente ─
PENDING_ANY=$(node -e "
  const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
  if (cycle.length === 0) { console.log('OK'); process.exit(0); }
  const withPending = cycle.filter(e => Object.values(e).some(v => v === 'PENDING'));
  if (withPending.length === 0) { console.log('OK'); }
  else { console.log('PENDING:' + withPending.map(e => 'OTA-' + e.updateNumber).join(',')); }
" 2>/dev/null || echo "ERROR")

if [ "$PENDING_ANY" = "OK" ]; then
  ok "ota-updates.json: nessun campo PENDING in nessuna entry del ciclo corrente"
elif [[ "$PENDING_ANY" == PENDING:* ]]; then
  ENTRIES="${PENDING_ANY#PENDING:}"
  fail "ota-updates.json ha campi PENDING in: $ENTRIES. Queste entry non sono state finalizzate."
else
  fail "Impossibile analizzare ota-updates.json per il controllo PENDING globale."
fi

# ── 5. COMMITBASE HASH VALIDO nell'ultima entry del ciclo ────
COMMITBASE_CHECK=$(node -e "
  const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
  if (cycle.length === 0) { console.log('NO_ENTRY'); process.exit(0); }
  const latest = cycle[cycle.length - 1];
  const cb = latest.commitBase;
  if (cb === null || cb === undefined) { console.log('NULL'); }
  else if (cb === '' || cb === 'PENDING' || cb === 'N/A') { console.log('INVALID:' + JSON.stringify(cb)); }
  else if (/^[0-9a-fA-F]{7,40}$/.test(String(cb))) { console.log('OK:' + cb.substring(0,12)); }
  else { console.log('INVALID:' + JSON.stringify(cb)); }
" 2>/dev/null || echo "ERROR")

if [[ "$COMMITBASE_CHECK" == OK:* ]]; then
  HASH_PREVIEW="${COMMITBASE_CHECK#OK:}"
  ok "commitBase OTA più recente: ${HASH_PREVIEW}... (hash git valido)"
elif [ "$COMMITBASE_CHECK" = "NULL" ]; then
  fail "commitBase dell'ultima entry è null. Inserire l'hash git (git rev-parse HEAD) prima di pubblicare."
elif [[ "$COMMITBASE_CHECK" == INVALID:* ]]; then
  BAD_VAL="${COMMITBASE_CHECK#INVALID:}"
  fail "commitBase dell'ultima entry non è un hash git valido: $BAD_VAL. Usare: git rev-parse HEAD"
elif [ "$COMMITBASE_CHECK" = "NO_ENTRY" ]; then
  ok "commitBase: nuovo ciclo, nessuna entry ancora — OK"
else
  fail "Impossibile verificare commitBase dell'ultima entry."
fi

# ── 6. NESSUN UPDATENUMBER DUPLICATO nel ciclo corrente ──────
DUPES_CHECK=$(node -e "
  const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
  const nums = cycle.map(e => e.updateNumber);
  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dupes.length === 0) { console.log('OK'); }
  else { console.log('DUPES:' + [...new Set(dupes)].join(',')); }
" 2>/dev/null || echo "ERROR")

if [ "$DUPES_CHECK" = "OK" ]; then
  ok "ota-updates.json: nessun updateNumber duplicato nel ciclo corrente"
elif [[ "$DUPES_CHECK" == DUPES:* ]]; then
  NUMS="${DUPES_CHECK#DUPES:}"
  fail "ota-updates.json ha updateNumber duplicati nel ciclo corrente: $NUMS. Correggere il registro prima di pubblicare."
else
  fail "Impossibile verificare i duplicati updateNumber in ota-updates.json."
fi

# ── 7. CICLI MULTIPLI — warning se il registro ha più runtimeVersion ──
MULTI_CYCLE_CHECK=$(node -e "
  const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
  const currentRv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const rvSet = [...new Set(data.filter(e => typeof e.updateNumber === 'number').map(e => e.runtimeVersion))];
  if (rvSet.length <= 1) { console.log('OK'); process.exit(0); }
  const others = rvSet.filter(rv => rv !== currentRv);
  console.log('MULTI:currentRv=' + currentRv + ':others=' + others.join(','));
" 2>/dev/null || echo "ERROR")

if [ "$MULTI_CYCLE_CHECK" = "OK" ]; then
  ok "ota-updates.json: un solo ciclo runtimeVersion — nessun mismatch"
elif [ "$MULTI_CYCLE_CHECK" = "ERROR" ]; then
  warn "Impossibile verificare i cicli runtimeVersion in ota-updates.json"
elif [[ "$MULTI_CYCLE_CHECK" == MULTI:* ]]; then
  CURRENT_RV_VAL=$(echo "$MULTI_CYCLE_CHECK" | grep -o 'currentRv=[^:]*' | cut -d= -f2)
  OTHERS_VAL=$(echo "$MULTI_CYCLE_CHECK" | grep -o 'others=.*' | cut -d= -f2)
  warn "Il registro OTA contiene cicli multipli (runtimeVersion: $OTHERS_VAL e $CURRENT_RV_VAL)."
  info "  L'APK installato usa runtimeVersion $CURRENT_RV_VAL."
  info "  Le OTA con runtimeVersion $OTHERS_VAL NON verranno mai ricevute da questo APK."
  info "  Questo è normale se il registro è storico — ma verifica che le OTA attive siano solo per $CURRENT_RV_VAL."
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
