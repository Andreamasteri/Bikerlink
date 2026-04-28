#!/bin/bash
# ============================================================
#  BikerLink — OTA Publisher (un comando solo)
#  Uso: bash scripts/publish-ota.sh "messaggio di release"
#
#  Lo script gestisce automaticamente:
#   - calcolo updateNumber (ota-updates.json)
#   - aggiornamento CURRENT_OTA_NUMBER in lib/ota.ts
#   - insert entry pending in ota-updates.json
#   - export bundle con reset cache Metro
#   - verifica CURRENT_OTA_NUMBER nel bundle compilato
#   - upload su object storage
#   - pubblicazione sul backend di PRODUZIONE
#   - verifica live con backoff (max 30s)
#   - finalizzazione ota-updates.json con ID reali
#   - rollback automatico su qualsiasi errore
# ============================================================
set -euo pipefail

RELEASE_MESSAGE="${1:-}"

if [ -z "$RELEASE_MESSAGE" ]; then
  echo "Uso: $0 \"messaggio di release\""
  echo "Esempio: $0 \"Fix audio + nuova schermata profilo\""
  echo ""
  echo "Variabili d'ambiente richieste:"
  echo "  BIKERLINK_ADMIN_EMAIL    — email account admin"
  echo "  BIKERLINK_ADMIN_PASSWORD — password account admin"
  echo ""
  echo "Variabili d'ambiente opzionali:"
  echo "  BIKERLINK_BACKEND_URL    — URL backend (default: https://biker-link.replit.app)"
  echo "  BIKERLINK_PUBLIC_URL     — URL pubblico per bundle download (default: uguale a BACKEND_URL)"
  echo ""
  echo "Per rollback: bash scripts/rollback-ota.sh <updateNumber>"
  exit 1
fi

# ─── Configurazione ───────────────────────────────────────
BACKEND_URL="${BIKERLINK_BACKEND_URL:-https://biker-link.replit.app}"
PUBLIC_URL="${BIKERLINK_PUBLIC_URL:-$BACKEND_URL}"
COOKIE_JAR="/tmp/ota-publish-cookies-$$.txt"
DIST_DIR="dist-ota"
OTA_UPDATES_FILE="ota-updates.json"
OTA_TS_FILE="lib/ota.ts"

ADMIN_EMAIL="${BIKERLINK_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${BIKERLINK_ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Errore: imposta BIKERLINK_ADMIN_EMAIL e BIKERLINK_ADMIN_PASSWORD"
  exit 1
fi

# ─── Stato rollback ───────────────────────────────────────
ORIG_OTA_NUMBER=""
ORIG_OTA_TS_CONTENT=""
ORIG_OTA_UPDATES_CONTENT=""
ROLLBACK_NEEDED=0
ENTRY_INSERTED=0

cleanup() {
  rm -f "$COOKIE_JAR"
  rm -rf "$DIST_DIR"
  if [ "$ROLLBACK_NEEDED" = "1" ]; then
    echo ""
    echo "   ⚠ Rollback automatico in corso..."
    if [ -n "$ORIG_OTA_TS_CONTENT" ]; then
      echo "$ORIG_OTA_TS_CONTENT" > "$OTA_TS_FILE"
      echo "   ✔ lib/ota.ts ripristinato (CURRENT_OTA_NUMBER=$ORIG_OTA_NUMBER)"
    fi
    if [ -n "$ORIG_OTA_UPDATES_CONTENT" ]; then
      echo "$ORIG_OTA_UPDATES_CONTENT" > "$OTA_UPDATES_FILE"
      echo "   ✔ ota-updates.json ripristinato"
    fi
    echo "   ✘ Pubblicazione annullata — stato pre-pubblicazione ripristinato"
  fi
}
trap cleanup EXIT

# ─── Lettura runtimeVersion da app.json ───────────────────
RUNTIME_VERSION=$(node -e "
  try {
    const j = JSON.parse(require('fs').readFileSync('app.json','utf8'));
    const rv = j?.expo?.runtimeVersion ?? null;
    if (!rv) { process.stderr.write('runtimeVersion non trovato in app.json\n'); process.exit(1); }
    process.stdout.write(rv);
  } catch(e) { process.stderr.write('Impossibile leggere app.json: ' + e.message + '\n'); process.exit(1); }
" 2>&1) || { echo "   ERRORE: $RUNTIME_VERSION"; exit 1; }

# ─── Calcolo automatico updateNumber ──────────────────────
NEXT_OTA_INFO=$(node -e "
  const fs = require('fs');
  const appJson = JSON.parse(fs.readFileSync('app.json','utf8'));
  const rv = appJson?.expo?.runtimeVersion ?? null;
  const data = JSON.parse(fs.readFileSync('$OTA_UPDATES_FILE','utf8'));
  const cycle = data.filter(e => typeof e.updateNumber === 'number' && e.runtimeVersion === rv);
  const lastNum = cycle.length > 0 ? cycle[cycle.length - 1].updateNumber : 0;
  const nextNum = lastNum + 1;
  const lastEntry = cycle.length > 0 ? cycle[cycle.length - 1] : null;
  const apkBuildId = lastEntry?.apkBuildId ?? null;
  const apkVersionCode = lastEntry?.apkVersionCode ?? null;
  const apkVersionName = lastEntry?.apkVersionName ?? null;
  const apkUrl = lastEntry?.apkUrl ?? null;
  const apkBuildDashboard = lastEntry?.apkBuildDashboard ?? null;
  console.log(JSON.stringify({ nextNum, lastNum, apkBuildId, apkVersionCode, apkVersionName, apkUrl, apkBuildDashboard }));
" 2>/dev/null) || { echo "   ERRORE: impossibile calcolare updateNumber da $OTA_UPDATES_FILE"; exit 1; }

NEXT_OTA=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).nextNum))")
LAST_OTA=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).lastNum))")
APK_BUILD_ID=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkBuildId ?? ''); })")
APK_VERSION_CODE=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkVersionCode ?? ''); })")
APK_VERSION_NAME=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkVersionName ?? ''); })")
APK_URL=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkUrl ?? ''); })")
APK_BUILD_DASHBOARD=$(echo "$NEXT_OTA_INFO" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ const j=JSON.parse(d); console.log(j.apkBuildDashboard ?? ''); })")

VERSION="1.${NEXT_OTA}.0"
GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "N/A")
GIT_COMMIT_SHORT="${GIT_COMMIT_HASH:0:12}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       BikerLink OTA Publisher — un comando solo  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  OTA-$NEXT_OTA (rv $RUNTIME_VERSION) — v$VERSION"
echo "  Commit: $GIT_COMMIT_SHORT"
echo "  Backend: $BACKEND_URL"
echo ""

# ─── Salva stato originale per rollback ───────────────────
ORIG_OTA_TS_CONTENT=$(cat "$OTA_TS_FILE")
ORIG_OTA_NUMBER=$(grep -oE 'CURRENT_OTA_NUMBER\s*=\s*[0-9]+' "$OTA_TS_FILE" | grep -oE '[0-9]+$' || echo "")
ORIG_OTA_UPDATES_CONTENT=$(cat "$OTA_UPDATES_FILE")
ROLLBACK_NEEDED=1

# ─── Step A: Aggiorna lib/ota.ts ──────────────────────────
echo "[A] Aggiornamento CURRENT_OTA_NUMBER in lib/ota.ts ($ORIG_OTA_NUMBER → $NEXT_OTA)..."
COMMENT_LINE="// ⚠️ CHECKLIST RELEASE: aggiornare questo numero PRIMA di ogni pubblicazione OTA
// Ciclo $RUNTIME_VERSION — APK v${APK_VERSION_CODE:-?} — aggiornare ad ogni nuova OTA pubblicata"
printf '%s\nexport const CURRENT_OTA_NUMBER = %s;\n' "$COMMENT_LINE" "$NEXT_OTA" > "$OTA_TS_FILE"
echo "   ✔ CURRENT_OTA_NUMBER=$NEXT_OTA"

# ─── Step B: Aggiorna ota-updates.json ────────────────────
echo "[B] Aggiornamento ota-updates.json (supersede OTA-$LAST_OTA, inserisce OTA-$NEXT_OTA pending)..."
OTA_UPDATES_FILE="$OTA_UPDATES_FILE" \
OTA_NEXT="$NEXT_OTA" \
OTA_VERSION="$VERSION" \
OTA_RUNTIME_VERSION="$RUNTIME_VERSION" \
OTA_COMMIT="$GIT_COMMIT_HASH" \
OTA_APK_BUILD_ID="$APK_BUILD_ID" \
OTA_APK_VERSION_CODE="$APK_VERSION_CODE" \
OTA_APK_VERSION_NAME="$APK_VERSION_NAME" \
OTA_APK_URL="$APK_URL" \
OTA_APK_BUILD_DASHBOARD="$APK_BUILD_DASHBOARD" \
OTA_RELEASE_MESSAGE="$RELEASE_MESSAGE" \
node -e "
  const fs = require('fs');
  const rv = process.env.OTA_RUNTIME_VERSION;
  const nextNum = parseInt(process.env.OTA_NEXT, 10);
  const releaseMsg = process.env.OTA_RELEASE_MESSAGE;
  const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE, 'utf8'));
  // Marca superseded l'ultima entry active/published del ciclo corrente
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].runtimeVersion === rv && typeof data[i].updateNumber === 'number') {
      if (data[i].status === 'published' || data[i].status === 'active') {
        data[i].status = 'superseded';
        break;
      }
    }
  }
  // Inserisce nuova entry pending — tutti i valori passati via env (nessuna interpolazione shell)
  const apkVersionCode = process.env.OTA_APK_VERSION_CODE ? parseInt(process.env.OTA_APK_VERSION_CODE, 10) : null;
  const newEntry = {
    updateNumber: nextNum,
    version: process.env.OTA_VERSION,
    cycle: '8.x',
    channel: 'preview',
    platform: 'android',
    message: JSON.stringify('OTA-' + nextNum + ' rv' + rv + ': ' + releaseMsg).slice(1, -1),
    note: 'CURRENT_OTA_NUMBER=' + nextNum + '. Pubblicato da publish-ota.sh (un comando solo).',
    runtimeVersion: rv,
    jsEngine: 'hermes',
    platforms: ['android'],
    releaseId: null,
    bundleUrl: null,
    updateGroupId: null,
    androidUpdateId: null,
    iosUpdateId: null,
    commitBase: process.env.OTA_COMMIT,
    easDashboard: null,
    apkBuildId: process.env.OTA_APK_BUILD_ID || null,
    apkBuildDashboard: process.env.OTA_APK_BUILD_DASHBOARD || null,
    apkVersionCode: apkVersionCode,
    apkVersionName: process.env.OTA_APK_VERSION_NAME || null,
    apkUrl: process.env.OTA_APK_URL || null,
    status: 'pending'
  };
  data.push(newEntry);
  fs.writeFileSync(process.env.OTA_UPDATES_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('OK');
" || { echo "   ERRORE: impossibile aggiornare $OTA_UPDATES_FILE"; exit 1; }
ENTRY_INSERTED=1
echo "   ✔ Entry OTA-$NEXT_OTA inserita (pending)"

# ─── Step C: Export bundle con reset cache ────────────────
echo "[C] Esportazione bundle JavaScript (Metro --reset-cache)..."
rm -rf "$DIST_DIR"
EXPO_LOG="/tmp/ota-expo-$$.log"
if ! EXPO_PUBLIC_DOMAIN=biker-link.replit.app npx expo export --platform android --output-dir "$DIST_DIR" --reset-cache > "$EXPO_LOG" 2>&1; then
  echo "   ERRORE: expo export fallito"
  tail -20 "$EXPO_LOG"
  rm -f "$EXPO_LOG"
  exit 1
fi
grep -E "(✓|✗|Bundle|Error)" "$EXPO_LOG" | tail -5 || true
rm -f "$EXPO_LOG"
echo "   ✔ Esportazione completata"

# ─── Step D: Ricerca bundle ───────────────────────────────
echo "[D] Ricerca bundle principale..."
ANDROID_DIR="$DIST_DIR/_expo/static/js/android"
if [ ! -d "$ANDROID_DIR" ]; then
  echo "   ERRORE: directory $ANDROID_DIR non trovata"
  find "$DIST_DIR" -type f 2>/dev/null | head -20
  exit 1
fi

BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "index*.hbc" -o -name "index*.js" -o -name "entry*.hbc" -o -name "entry*.js" \) ! -name "*.map" 2>/dev/null | head -1)
if [ -z "$BUNDLE_FILE" ]; then
  BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "*.hbc" -o -name "*.js" \) ! -name "*.map" -type f 2>/dev/null \
    -exec wc -c {} + 2>/dev/null | sort -n | tail -2 | head -1 | awk '{print $2}')
fi

if [ -z "$BUNDLE_FILE" ] || [ ! -f "$BUNDLE_FILE" ]; then
  echo "   ERRORE: bundle non trovato in $ANDROID_DIR"
  find "$DIST_DIR" -type f 2>/dev/null | head -20
  exit 1
fi

BUNDLE_SIZE=$(wc -c < "$BUNDLE_FILE")
BUNDLE_SIZE_HUMAN=$(node -e "const s=$BUNDLE_SIZE; process.stdout.write(s>1048576 ? (s/1048576).toFixed(1)+' MB' : Math.round(s/1024)+' KB')")
echo "   ✔ Bundle trovato: $(basename "$BUNDLE_FILE") ($BUNDLE_SIZE_HUMAN)"

# ─── Step E: Verifica CURRENT_OTA_NUMBER nel bundle ───────
echo "[E] Verifica CURRENT_OTA_NUMBER=$NEXT_OTA nel bundle compilato..."
BUNDLE_EXT="${BUNDLE_FILE##*.}"
FOUND_OTA=""

if [ "$BUNDLE_EXT" = "hbc" ]; then
  # Hermes bytecode: usa strings su file binario
  FOUND_OTA=$(strings "$BUNDLE_FILE" 2>/dev/null | grep -oE "CURRENT_OTA_NUMBER=[0-9]+" | head -1 | grep -oE "[0-9]+$" || true)
  if [ -z "$FOUND_OTA" ]; then
    # Prova con grep raw byte su file binario (Hermes potrebbe non avere la stringa esatta)
    FOUND_OTA=$(grep -oa "CURRENT_OTA_NUMBER=[0-9]*" "$BUNDLE_FILE" 2>/dev/null | head -1 | grep -oE "[0-9]+$" || true)
  fi
else
  # JS bundle standard
  FOUND_OTA=$(grep -oa "CURRENT_OTA_NUMBER=[0-9]*" "$BUNDLE_FILE" 2>/dev/null | head -1 | grep -oE "[0-9]+$" || true)
fi

if [ -z "$FOUND_OTA" ]; then
  echo ""
  echo "   ╔════════════════════════════════════════════════════════╗"
  echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — marker non trovato       ║"
  echo "   ║  CURRENT_OTA_NUMBER non trovato nel bundle ($BUNDLE_EXT)   ║"
  echo "   ║  Potrebbe essere cache Metro stale — riprovare.       ║"
  echo "   ╚════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
elif [ "$FOUND_OTA" = "$NEXT_OTA" ]; then
  echo "   ✔ Bundle verificato: CURRENT_OTA_NUMBER=$FOUND_OTA (corretto)"
else
  echo ""
  echo "   ╔════════════════════════════════════════════════════════╗"
  echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — Bundle ha numero errato  ║"
  echo "   ║  Bundle contiene CURRENT_OTA_NUMBER=$FOUND_OTA         ║"
  echo "   ║  Atteso: CURRENT_OTA_NUMBER=$NEXT_OTA                  ║"
  echo "   ║  Probabile cache Metro stale — usa --reset-cache       ║"
  echo "   ╚════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ─── Step F: Upload bundle su object storage ──────────────
echo "[F] Upload bundle su object storage..."
UPLOAD_RESPONSE=$(node "$(dirname "$0")/ota-upload-bundle.mjs" "$BUNDLE_FILE" "$VERSION" 2>&1)
BUNDLE_URL=$(echo "$UPLOAD_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).url ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
if [ -z "$BUNDLE_URL" ]; then
  echo "   ERRORE upload: $UPLOAD_RESPONSE"
  exit 1
fi
echo "   ✔ Bundle URL: $BUNDLE_URL"

# ─── Step G: Login al backend di PRODUZIONE ───────────────
echo "[G] Login admin su $BACKEND_URL..."
LOGIN_JSON=$(node -e "process.stdout.write(JSON.stringify({identifier:'$ADMIN_EMAIL',password:process.env.BIKERLINK_ADMIN_PASSWORD}))" 2>/dev/null)
RAW_LOGIN=$(curl -s -D - -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-Proto: https" \
  -d "{\"identifier\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
LOGIN_BODY=$(echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
if ! echo "$LOGIN_BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { const j=JSON.parse(d); process.exit(j.id ? 0 : 1); } catch { process.exit(1); } })" 2>/dev/null; then
  echo "   ERRORE login: $LOGIN_BODY"
  exit 1
fi
SESSION_COOKIE=$(echo "$RAW_LOGIN" | grep -i "^set-cookie:" | grep "connect.sid" | head -1 | sed 's/.*connect\.sid=\([^;]*\).*/connect.sid=\1/' | tr -d '\r')
if [ -z "$SESSION_COOKIE" ]; then
  echo "   ERRORE: nessun session cookie ricevuto"
  exit 1
fi
echo "   ✔ Autenticato"

# ─── Step H: Creazione release draft ──────────────────────
echo "[H] Creazione release OTA (draft)..."
NOTES_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "OTA-$NEXT_OTA rv$RUNTIME_VERSION: $RELEASE_MESSAGE")
RV_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RUNTIME_VERSION")
CREATE_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$VERSION\",\"runtimeVersion\":$RV_JSON,\"bundlePath\":\"$BUNDLE_URL\",\"releaseNotes\":$NOTES_JSON}")
RELEASE_ID=$(echo "$CREATE_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).id ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
if [ -z "$RELEASE_ID" ]; then
  echo "   ERRORE creazione release: $CREATE_RESPONSE"
  exit 1
fi
echo "   ✔ Release creata — ID: $RELEASE_ID"

# ─── Step I: Pubblicazione release ────────────────────────
echo "[I] Pubblicazione release..."
PUBLISH_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota/$RELEASE_ID/publish")
PUBLISH_STATUS=$(echo "$PUBLISH_RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).status ?? ''); } catch { console.log(''); } })" 2>/dev/null || true)
if [ "$PUBLISH_STATUS" != "active" ]; then
  echo "   ERRORE pubblicazione: $PUBLISH_RESPONSE"
  exit 1
fi
echo "   ✔ Release pubblicata (status: active)"

# ─── Step J: Verifica live con backoff ────────────────────
echo "[J] Verifica live su produzione (backoff max 30s)..."
MAX_WAIT=30
WAIT_INTERVAL=5
ELAPSED=0
VERIFIED=0

while [ $ELAPSED -le $MAX_WAIT ]; do
  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "expo-runtime-version: $RUNTIME_VERSION" \
    -H "expo-platform: android" \
    -H "expo-protocol-version: 1" \
    --max-time 10 \
    "$BACKEND_URL/api/expo-updates" 2>/dev/null || echo -e "\nCURL_FAILED")

  HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
  HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)

  if [ "$HTTP_CODE" = "200" ]; then
    SERVED_RELEASE_ID=$(echo "$HTTP_BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{ try { console.log(JSON.parse(d).id ?? ''); } catch { console.log(''); } })" 2>/dev/null || echo "")
    if [ "$SERVED_RELEASE_ID" = "$RELEASE_ID" ]; then
      echo "   ✔ Produzione serve OTA-$NEXT_OTA (releaseId=$RELEASE_ID) — ${ELAPSED}s"
      VERIFIED=1
      break
    else
      echo "   ⟳ Produzione serve releaseId=$SERVED_RELEASE_ID (atteso $RELEASE_ID) — retry in ${WAIT_INTERVAL}s..."
    fi
  elif [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "304" ]; then
    echo "   ⟳ Produzione risponde $HTTP_CODE (cache) — retry in ${WAIT_INTERVAL}s..."
  else
    echo "   ⚠ Produzione risponde HTTP $HTTP_CODE — retry in ${WAIT_INTERVAL}s..."
  fi

  sleep $WAIT_INTERVAL
  ELAPSED=$((ELAPSED + WAIT_INTERVAL))
done

if [ "$VERIFIED" != "1" ]; then
  echo ""
  echo "   ╔════════════════════════════════════════════════════════╗"
  echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — verifica live fallita    ║"
  echo "   ║  La produzione non serve OTA-$NEXT_OTA dopo ${MAX_WAIT}s.     ║"
  echo "   ║  La release è nel DB ma NON attiva in produzione.     ║"
  echo "   ║  Verifica: bash scripts/validate-ota.sh               ║"
  echo "   ╚════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

# ─── Step K: Finalizzazione ota-updates.json ──────────────
echo "[K] Finalizzazione ota-updates.json con ID reali..."
OTA_UPDATES_FILE="$OTA_UPDATES_FILE" \
OTA_NEXT="$NEXT_OTA" \
OTA_RUNTIME_VERSION="$RUNTIME_VERSION" \
OTA_RELEASE_ID="$RELEASE_ID" \
OTA_BUNDLE_URL="$BUNDLE_URL" \
node -e "
  const fs = require('fs');
  const rv = process.env.OTA_RUNTIME_VERSION;
  const nextNum = parseInt(process.env.OTA_NEXT, 10);
  const data = JSON.parse(fs.readFileSync(process.env.OTA_UPDATES_FILE, 'utf8'));
  let updated = false;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].updateNumber === nextNum && data[i].runtimeVersion === rv) {
      data[i].releaseId = process.env.OTA_RELEASE_ID;
      data[i].bundleUrl = process.env.OTA_BUNDLE_URL;
      data[i].status = 'published';
      data[i].publishedAt = new Date().toISOString();
      updated = true;
      break;
    }
  }
  if (!updated) { process.stderr.write('Entry OTA-' + nextNum + ' non trovata\n'); process.exit(1); }
  fs.writeFileSync(process.env.OTA_UPDATES_FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('OK');
" || {
  echo ""
  echo "   ╔════════════════════════════════════════════════════════╗"
  echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — finalizzazione fallita   ║"
  echo "   ║  ota-updates.json non aggiornato — rollback attivo.   ║"
  echo "   ║  La release è pubblica in prod: $RELEASE_ID  ║"
  echo "   ║  Aggiornare manualmente ota-updates.json.             ║"
  echo "   ╚════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
}

echo "   ✔ ota-updates.json aggiornato (status: published)"

# ─── Pubblicazione completata — disabilita rollback ───────
ROLLBACK_NEEDED=0

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ✅ OTA-$NEXT_OTA pubblicata con successo!$(printf '%*s' $((36 - ${#NEXT_OTA})) '')║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  %-20s: %-43s║\n" "Commit" "$GIT_COMMIT_SHORT"
printf "║  %-20s: %-43s║\n" "Release ID" "$RELEASE_ID"
printf "║  %-20s: %-43s║\n" "Bundle URL" "$BUNDLE_URL"
printf "║  %-20s: %-43s║\n" "OTA-guard" "bash scripts/validate-ota.sh"
printf "║  %-20s: %-43s║\n" "Rollback" "bash scripts/rollback-ota.sh $((NEXT_OTA - 1))"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "   Tutti gli utenti riceveranno l'aggiornamento al prossimo avvio."
echo ""
