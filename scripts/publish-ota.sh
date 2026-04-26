#!/bin/bash
set -euo pipefail

VERSION="${1:-}"
RELEASE_NOTES="${2:-}"

if [ -z "$VERSION" ] || [ -z "$RELEASE_NOTES" ]; then
  echo "Uso: $0 <version> \"note di release\""
  echo "Esempio: $0 1.2.0 \"Corretto bug match, nuovo sistema OTA\""
  echo ""
  echo "  Entrambi i parametri sono obbligatori."
  echo ""
  echo "Variabili d'ambiente richieste:"
  echo "  BIKERLINK_ADMIN_EMAIL    — email dell'account admin"
  echo "  BIKERLINK_ADMIN_PASSWORD — password dell'account admin"
  echo ""
  echo "Variabili d'ambiente opzionali:"
  echo "  BIKERLINK_BACKEND_URL    — URL backend (default: http://localhost:5000)"
  exit 1
fi

BACKEND_URL="${BIKERLINK_BACKEND_URL:-http://localhost:5000}"
COOKIE_JAR="/tmp/ota-publish-cookies-$$.txt"
DIST_DIR="dist-ota"

ADMIN_EMAIL="${BIKERLINK_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${BIKERLINK_ADMIN_PASSWORD:-}"

if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
  echo "Errore: imposta BIKERLINK_ADMIN_EMAIL e BIKERLINK_ADMIN_PASSWORD"
  echo "  export BIKERLINK_ADMIN_EMAIL='admin@bikerlink.it'"
  echo "  export BIKERLINK_ADMIN_PASSWORD='tuapassword'"
  exit 1
fi

cleanup() {
  rm -f "$COOKIE_JAR"
  rm -rf "$DIST_DIR"
}
trap cleanup EXIT

# Cattura hash git corrente (per il log finale)
GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "N/A")
GIT_COMMIT_SHORT="${GIT_COMMIT_HASH:0:12}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       BikerLink OTA Publisher v${VERSION}$(printf '%*s' $((28 - ${#VERSION})) '')║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Commit: $GIT_COMMIT_SHORT"
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  CHECKLIST PRE-PUBBLICAZIONE (da fare PRIMA)    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  ① Aggiungi entry in ota-updates.json con:     ║"
echo "║     - commitBase = hash git (non PENDING)       ║"
echo "║     - IDs sconosciuti = null (non PENDING)      ║"
echo "║  ② Aggiorna CURRENT_OTA_NUMBER in lib/ota.ts   ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Questo script esegue automaticamente:          ║"
echo "║  ③ Guard validate-ota.sh  (blocca se fallisce) ║"
echo "║  ④ Export bundle JavaScript (Metro bundler)    ║"
echo "║  ⑤ Upload bundle su object storage             ║"
echo "║  ⑥ Pubblicazione release sul backend custom    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  DOPO la pubblicazione (usa gli ID qui sotto):  ║"
echo "║  ⑦ Aggiorna ota-updates.json con ID reali      ║"
echo "║  ⑧ Riesegui validate-ota.sh per conferma       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Step 0 (Guard): Esecuzione validate-ota.sh — blocca se fallisce
echo "[0/6] Guard OTA — validate-ota.sh..."
GUARD_SCRIPT="$(dirname "$0")/validate-ota.sh"
if [ ! -f "$GUARD_SCRIPT" ]; then
  echo "   ERRORE: script di validazione non trovato: $GUARD_SCRIPT"
  exit 1
fi
if ! bash "$GUARD_SCRIPT"; then
  echo ""
  echo "   ╔════════════════════════════════════════════════════╗"
  echo "   ║  ❌ PUBBLICAZIONE BLOCCATA — Guard OTA fallito    ║"
  echo "   ║  Correggi gli errori sopra e riprova.              ║"
  echo "   ╚════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi
echo "   Guard OK — procedo con la pubblicazione"
echo ""

# Step 1: Login — extract session cookie from headers (needed for Secure cookies over HTTP)
echo "[1/6] Login come admin..."
LOGIN_JSON=$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$ADMIN_PASSWORD" '{"identifier":$e,"password":$p}')
RAW_LOGIN=$(curl -s -D - -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-Proto: https" \
  -d "$LOGIN_JSON")
LOGIN_RESPONSE=$(echo "$RAW_LOGIN" | sed '/^\r$/q' | tail -1 && echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
LOGIN_BODY=$(echo "$RAW_LOGIN" | awk 'BEGIN{body=0} /^\r$/{body=1; next} body{print}')
if ! echo "$LOGIN_BODY" | jq -e '.id' > /dev/null 2>&1; then
  echo "   ERRORE login: $LOGIN_BODY"
  exit 1
fi
SESSION_COOKIE=$(echo "$RAW_LOGIN" | grep -i "^set-cookie:" | grep "connect.sid" | head -1 | sed 's/.*connect\.sid=\([^;]*\).*/connect.sid=\1/' | tr -d '\r')
if [ -z "$SESSION_COOKIE" ]; then
  echo "   ERRORE: nessun session cookie ricevuto"
  exit 1
fi
echo "   OK — autenticato"

# Step 2: Export bundle
echo "[2/6] Esportazione bundle JavaScript..."
rm -rf "$DIST_DIR"
EXPO_LOG="/tmp/ota-expo-$$.log"
if ! EXPO_PUBLIC_DOMAIN=biker-link.replit.app npx expo export --platform android --output-dir "$DIST_DIR" > "$EXPO_LOG" 2>&1; then
  echo "   ERRORE: expo export fallito"
  tail -20 "$EXPO_LOG"
  rm -f "$EXPO_LOG"
  exit 1
fi
grep -E "(✓|✗|Bundle|Error)" "$EXPO_LOG" | tail -5 || true
rm -f "$EXPO_LOG"
echo "   Esportazione completata"

# Step 3: Find bundle file — prefer entry bundle (.hbc Hermes or .js Metro)
# Expo SDK 55+ with jsEngine:hermes exports .hbc (Hermes Bytecode) instead of .js
echo "[3/6] Ricerca bundle principale..."
ANDROID_DIR="$DIST_DIR/_expo/static/js/android"
if [ ! -d "$ANDROID_DIR" ]; then
  echo "   ERRORE: directory $ANDROID_DIR non trovata"
  find "$DIST_DIR" -type f 2>/dev/null | head -20
  exit 1
fi

# Prefer file with "index" or "entry" in name — support .js (Metro) and .hbc (Hermes, SDK 55+)
BUNDLE_FILE=$(find "$ANDROID_DIR" \( -name "index*.hbc" -o -name "index*.js" -o -name "entry*.hbc" -o -name "entry*.js" \) ! -name "*.map" 2>/dev/null | head -1)

# Fallback: largest .hbc or .js file (exclude .map)
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
echo "   Bundle trovato: $(basename "$BUNDLE_FILE") ($BUNDLE_SIZE_HUMAN)"

# Step 4: Upload bundle directly via object storage (bypass HTTP layer)
echo "[4/6] Upload bundle su object storage..."
UPLOAD_RESPONSE=$(node "$(dirname "$0")/ota-upload-bundle.mjs" "$BUNDLE_FILE" "$VERSION" 2>&1)
BUNDLE_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.url // empty' 2>/dev/null || true)
if [ -z "$BUNDLE_URL" ]; then
  echo "   ERRORE upload: $UPLOAD_RESPONSE"
  exit 1
fi
echo "   Bundle URL: $BUNDLE_URL"

# Step 5: Create release (draft) then publish explicitly
echo "[5/6] Creazione release OTA..."
NOTES_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RELEASE_NOTES")
CREATE_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$VERSION\",\"bundlePath\":\"$BUNDLE_URL\",\"releaseNotes\":$NOTES_JSON}")
RELEASE_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id // empty' 2>/dev/null)
if [ -z "$RELEASE_ID" ]; then
  echo "   ERRORE creazione release: $CREATE_RESPONSE"
  exit 1
fi
echo "   Release creata (draft) — ID: $RELEASE_ID"

echo "   Pubblicazione release..."
PUBLISH_RESPONSE=$(curl -s -H "Cookie: $SESSION_COOKIE" -H "X-Forwarded-Proto: https" -X POST "$BACKEND_URL/api/admin/ota/$RELEASE_ID/publish")
PUBLISH_STATUS=$(echo "$PUBLISH_RESPONSE" | jq -r '.status // empty' 2>/dev/null)
if [ "$PUBLISH_STATUS" != "active" ]; then
  echo "   ERRORE pubblicazione: $PUBLISH_RESPONSE"
  exit 1
fi
echo "   Release pubblicata — stato: $PUBLISH_STATUS"

# Step 6: Confirm active version via /api/updates/check
echo "[6/6] Verifica stato OTA attivo..."
CHECK_RESPONSE=$(curl -s "$BACKEND_URL/api/updates/check?appVersion=$VERSION")
ACTIVE_VERSION=$(echo "$CHECK_RESPONSE" | jq -r '.version // "nessuno"' 2>/dev/null)
ACTIVE_BUNDLE=$(echo "$CHECK_RESPONSE" | jq -r '.bundlePath // "N/A"' 2>/dev/null)
MANIFEST_URL=$(echo "$CHECK_RESPONSE" | jq -r '.manifestUrl // "N/A"' 2>/dev/null)
PUBLISHED_AT=$(echo "$CHECK_RESPONSE" | jq -r '.publishedAt // "N/A"' 2>/dev/null)
echo "   Versione attiva: $ACTIVE_VERSION"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ✅ Release OTA v${VERSION} pubblicata con successo!$(printf '%*s' $((17 - ${#VERSION})) '')║"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Commit hash      : $GIT_COMMIT_HASH"
echo "║  Release ID       : $RELEASE_ID"
echo "║  Bundle URL       : $BUNDLE_URL"
echo "║  Manifest URL     : $MANIFEST_URL"
echo "║  Versione att.    : $ACTIVE_VERSION"
echo "║  Bundle attivo    : $ACTIVE_BUNDLE"
echo "║  Pubblicato il    : $PUBLISHED_AT"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  ⑦ Aggiorna ota-updates.json con gli ID qui sopra             ║"
echo "║  ⑧ Riesegui: bash scripts/validate-ota.sh                     ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "   Tutti gli utenti riceveranno l'aggiornamento al prossimo avvio."
echo ""
