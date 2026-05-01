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
OTA_FILE="lib/ota.ts"
OTA_CHECK_FILE="lib/ota-check.ts"

# ── 1. STATIC IMPORT expo-updates ─────────────
# Le chiamate a Updates.* possono vivere in _layout.tsx (legacy) oppure
# in lib/ota-check.ts (modulo dedicato dopo il refactor OTA-7).
if grep -qE "^import \* as Updates from ['\"]expo-updates['\"]" "$LAYOUT_FILE" \
   || ([ -f "$OTA_CHECK_FILE" ] && grep -qE "^import \* as Updates from ['\"]expo-updates['\"]" "$OTA_CHECK_FILE"); then
  ok "expo-updates: static import OK"
else
  fail "expo-updates deve essere importato staticamente in $LAYOUT_FILE o in $OTA_CHECK_FILE"
  info "  Atteso: import * as Updates from \"expo-updates\""
  info "  Verificare che NON sia un dynamic import (await import(...))"
fi

# ── 2. OTASTARTUPCHECKER — 3 chiamate obbligatorie ───────────
# Cerchiamo i metodi sia nel layout che nel modulo dedicato.
for CALL in "Updates.checkForUpdateAsync" "Updates.fetchUpdateAsync" "Updates.reloadAsync"; do
  if grep -q "$CALL" "$LAYOUT_FILE" \
     || ([ -f "$OTA_CHECK_FILE" ] && grep -q "$CALL" "$OTA_CHECK_FILE"); then
    ok "OtaStartupChecker: $CALL OK"
  else
    fail "OtaStartupChecker manca di '$CALL' (cercato in $LAYOUT_FILE e $OTA_CHECK_FILE). Il checker automatico è rotto."
  fi
done

# ── 3. CURRENT_OTA_NUMBER aggiornato (cycle-aware, last by position) ─────
# DESIGN: si usa l'ultima entry PER POSIZIONE nell'array (non per status=published).
# Motivo: la procedura OTA prevede che l'entry venga aggiunta in ota-updates.json
# PRIMA di pubblicare (con CURRENT_OTA_NUMBER già aggiornato in lib/ota.ts).
# Al momento del check la entry può avere status "building"/"pending".
# Usare status="published" causerebbe un falso-OK: il check passerebbe anche
# se CURRENT_OTA_NUMBER non fosse stato ancora aggiornato (confronterebbe con
# la OTA precedente già published). "Last by position" è il criterio corretto
# per catturare il drift prima che la pubblicazione avvenga.
CURRENT_OTA=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$OTA_FILE" 2>/dev/null \
  | grep -oE '[0-9]+$' || true)

if [ -z "$CURRENT_OTA" ]; then
  fail "CURRENT_OTA_NUMBER non trovato in $OTA_FILE"
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
    fail "CURRENT_OTA_NUMBER=$CURRENT_OTA in lib/ota.ts ma l'ultima entry del ciclo corrente in ota-updates.json è OTA-$LATEST_OTA. Aggiornare prima di pubblicare."
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

# ── 4c. IDS EAS NULL in entry published del ciclo corrente (atteso, info-only) ──
# NOTA: Task #980 ha dismesso EAS Updates. Le entry pubblicate dopo la dismissione
# hanno volutamente updateGroupId/androidUpdateId = null. Questo blocco resta
# come info-only per visibilità storica e NON è più un warning bloccante.
NULL_EAS_IDS=$(node -e "
  const appJson = JSON.parse(require('fs').readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(require('fs').readFileSync('ota-updates.json','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
  const published = cycle.filter(e => e.status === 'published');
  const noted = [];
  for (const e of published) {
    const missing = [];
    if (e.updateGroupId === null || e.updateGroupId === undefined) missing.push('updateGroupId');
    if (e.androidUpdateId === null || e.androidUpdateId === undefined) missing.push('androidUpdateId');
    if (missing.length > 0) noted.push('OTA-' + e.updateNumber);
  }
  if (noted.length === 0) { console.log('NONE'); }
  else { console.log('NULL_IDS:' + noted.join(',')); }
" 2>/dev/null || echo "ERROR")

if [ "$NULL_EAS_IDS" = "NONE" ]; then
  ok "ota-updates.json: nessun ID EAS legacy mancante (registro storico completo)"
elif [[ "$NULL_EAS_IDS" == NULL_IDS:* ]]; then
  ENTRIES="${NULL_EAS_IDS#NULL_IDS:}"
  info "ota-updates.json: $ENTRIES senza IDs EAS — atteso (EAS Updates dismesso, Task #980)"
elif [ "$NULL_EAS_IDS" = "ERROR" ]; then
  warn "Impossibile leggere lo stato degli IDs EAS legacy in ota-updates.json."
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

# ── 6b. NIENTE EAS UPDATES — solo backend custom ─────────────
# Verifica che l'endpoint OTA sia il backend custom su sia app.json sia
# AndroidManifest.xml. EAS Updates è dismesso (solo `eas build` per le APK):
# se app.json punta ancora a u.expo.dev, ogni nuova APK ricostruita
# nasce con il manifest sbagliato e ignora le OTA pubblicate sul backend custom.
EXPECTED_OTA_URL="https://biker-link.replit.app/api/expo-updates"

APP_JSON_URL=$(node -e "
  try {
    const j = JSON.parse(require('fs').readFileSync('app.json','utf8'));
    process.stdout.write(j?.expo?.updates?.url ?? '');
  } catch { process.stdout.write('READ_ERROR'); }
" 2>/dev/null || echo "READ_ERROR")

if [ "$APP_JSON_URL" = "READ_ERROR" ] || [ -z "$APP_JSON_URL" ]; then
  fail "Impossibile leggere expo.updates.url da app.json"
elif [ "$APP_JSON_URL" = "$EXPECTED_OTA_URL" ]; then
  ok "app.json updates.url = backend custom"
else
  fail "app.json updates.url='$APP_JSON_URL' — atteso '$EXPECTED_OTA_URL'. EAS Updates è dismesso."
fi

if grep -q "u.expo.dev" app.json 2>/dev/null; then
  fail "app.json contiene ancora 'u.expo.dev'. EAS Updates è dismesso: rimuovere ogni riferimento."
else
  ok "app.json non contiene riferimenti a u.expo.dev"
fi

ANDROID_MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$ANDROID_MANIFEST" ]; then
  if grep -q "u.expo.dev" "$ANDROID_MANIFEST" 2>/dev/null; then
    fail "$ANDROID_MANIFEST contiene 'u.expo.dev'. Aggiornare EXPO_UPDATE_URL al backend custom."
  else
    ok "AndroidManifest.xml non contiene riferimenti a u.expo.dev"
  fi
  if grep -q "android:name=\"expo.modules.updates.EXPO_UPDATE_URL\".*android:value=\"$EXPECTED_OTA_URL\"" "$ANDROID_MANIFEST"; then
    ok "AndroidManifest.xml EXPO_UPDATE_URL = backend custom"
  else
    fail "AndroidManifest.xml: meta-data EXPO_UPDATE_URL non punta a $EXPECTED_OTA_URL"
  fi
else
  warn "$ANDROID_MANIFEST non trovato — saltato check manifest Android"
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

# ── 8. LIVE SERVER GUARD — verifica che la produzione serva l'OTA corrente ──
echo ""
echo -e "${BOLD}── Live Server Guard ──────────────────────────────────────${RESET}"

PROD_URL="${BIKERLINK_BACKEND_URL:-https://biker-link.replit.app}"
LIVE_CHECK_SKIP="${SKIP_LIVE_CHECK:-0}"

LIVE_INFO=$(node -e "
  const fs = require('fs');
  try {
    const rv = JSON.parse(fs.readFileSync('app.json','utf8'))?.expo?.runtimeVersion ?? '8.0.0';
    const otaSrc = fs.readFileSync('lib/ota.ts','utf8');
    const m = otaSrc.match(/CURRENT_OTA_NUMBER\s*=\s*(\d+)/);
    if (!m) { console.log('ERROR:no_ota_number'); process.exit(0); }
    const otaNum = parseInt(m[1], 10);
    const data = JSON.parse(fs.readFileSync('ota-updates.json','utf8'));
    const entry = data.find(e => e.updateNumber === otaNum && e.runtimeVersion === rv);
    if (!entry) { console.log('ERROR:no_entry:ota=' + otaNum + ':rv=' + rv); process.exit(0); }
    console.log('OK:rv=' + rv + ':ota=' + otaNum + ':releaseId=' + entry.releaseId);
  } catch(e) { console.log('ERROR:exception:' + e.message.replace(/\n/g,' ')); }
" 2>/dev/null || echo "ERROR:node_failed")

if [[ "$LIVE_INFO" == ERROR:* ]]; then
  warn "Live check saltato — impossibile leggere i dati locali OTA: $LIVE_INFO"
else
  EXPECTED_RV=$(echo "$LIVE_INFO" | grep -o 'rv=[^:]*' | head -1 | cut -d= -f2)
  EXPECTED_OTA=$(echo "$LIVE_INFO" | grep -o 'ota=[^:]*' | head -1 | cut -d= -f2)
  EXPECTED_RELEASE_ID=$(echo "$LIVE_INFO" | grep -o 'releaseId=.*' | cut -d= -f2)

  info "Controllo produzione: $PROD_URL/api/expo-updates (rv=$EXPECTED_RV, platform=android)"

  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "expo-runtime-version: $EXPECTED_RV" \
    -H "expo-platform: android" \
    -H "expo-protocol-version: 1" \
    --max-time 15 \
    "$PROD_URL/api/expo-updates" 2>/dev/null || echo -e "\nCURL_FAILED")

  HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "CURL_FAILED" ] || [ -z "$HTTP_CODE" ]; then
    warn "Live check non disponibile — impossibile raggiungere $PROD_URL"
  elif [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "304" ]; then
    if [ "$LIVE_CHECK_SKIP" = "1" ]; then
      warn "LIVE_CHECK_SKIP=1 OTA_NOT_PUBLISHED: produzione risponde $HTTP_CODE per rv=$EXPECTED_RV (OTA-$EXPECTED_OTA non ancora pubblicata)"
      info "  Esegui publish-ota.sh poi ri-esegui senza SKIP_LIVE_CHECK=1 per confermare."
    else
      fail "LIVE_CHECK_FAIL OTA_NOT_PUBLISHED: produzione risponde HTTP $HTTP_CODE per rv=$EXPECTED_RV — OTA-$EXPECTED_OTA non viene servita!"
      info "  Esegui publish-ota.sh, poi ri-esegui validate-ota.sh per confermare."
      info "  Usa SKIP_LIVE_CHECK=1 bash scripts/validate-ota.sh per saltare questo check."
    fi
  elif [ "$HTTP_CODE" = "200" ]; then
    SERVED_RELEASE_ID=$(echo "$HTTP_BODY" | node -e "
      let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
        try { const j=JSON.parse(d); console.log(j.id ?? ''); } catch{ console.log(''); }
      });
    " 2>/dev/null || echo "")

    if [ -z "$SERVED_RELEASE_ID" ]; then
      if [ "$LIVE_CHECK_SKIP" = "1" ]; then
        warn "LIVE_CHECK_SKIP=1: produzione risponde 200 senza release ID (no-update o formato inatteso) — OTA-$EXPECTED_OTA non ancora pubblicata"
        info "  Esegui publish-ota.sh poi ri-esegui senza SKIP_LIVE_CHECK=1 per confermare."
      else
        fail "LIVE_CHECK_FAIL: produzione risponde 200 ma impossibile estrarre release ID dal manifest (risposta non valida)"
        info "  Verifica che $PROD_URL/api/expo-updates restituisca un manifest JSON valido con campo 'id'."
      fi
    elif [ "$SERVED_RELEASE_ID" = "$EXPECTED_RELEASE_ID" ]; then
      ok "LIVE_CHECK_OK: produzione serve OTA-$EXPECTED_OTA (releaseId=$SERVED_RELEASE_ID)"
    else
      if [ "$LIVE_CHECK_SKIP" = "1" ]; then
        warn "LIVE_CHECK_SKIP=1 OTA_NOT_PUBLISHED: produzione serve releaseId=$SERVED_RELEASE_ID, atteso=$EXPECTED_RELEASE_ID (OTA-$EXPECTED_OTA)"
      else
        fail "LIVE_CHECK_FAIL OTA_NOT_PUBLISHED: produzione serve releaseId=$SERVED_RELEASE_ID, ma OTA-$EXPECTED_OTA ha releaseId=$EXPECTED_RELEASE_ID"
        info "  Il server potrebbe servire una OTA diversa da quella attesa. Verifica il DB di produzione."
      fi
    fi
  else
    warn "Live check: risposta inattesa HTTP $HTTP_CODE da $PROD_URL/api/expo-updates"
  fi
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
