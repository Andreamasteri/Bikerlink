#!/bin/bash
set -euo pipefail

VERSION="${1:-}"
RELEASE_NOTES="${2:-}"

if [ -z "$VERSION" ]; then
  echo "Uso: $0 <version> \"note di release\""
  echo "Esempio: $0 1.2.0 \"Corretto bug match, nuovo sistema OTA\""
  echo ""
  echo "Variabili d'ambiente richieste:"
  echo "  BIKERLINK_ADMIN_EMAIL    — email dell'account admin"
  echo "  BIKERLINK_ADMIN_PASSWORD — password dell'account admin"
  exit 1
fi

BACKEND_URL="http://localhost:5000"
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

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║       BikerLink OTA Publisher v${VERSION}$(printf '%*s' $((28 - ${#VERSION})) '')║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Step 1: Login
echo "[1/5] Login come admin..."
LOGIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -X POST "$BACKEND_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
if ! echo "$LOGIN_RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
  echo "   ERRORE login: $LOGIN_RESPONSE"
  exit 1
fi
echo "   OK — autenticato"

# Step 2: Export bundle
echo "[2/5] Esportazione bundle JavaScript..."
rm -rf "$DIST_DIR"
EXPO_PUBLIC_DOMAIN=biker-link.replit.app npx expo export --platform android --output-dir "$DIST_DIR" 2>&1 | grep -E "(✓|✗|Bundle|Error)" | tail -5 || true
echo "   Esportazione completata"

# Step 3: Find bundle file
echo "[3/5] Ricerca bundle principale..."
BUNDLE_FILE=$(find "$DIST_DIR/_expo/static/js/android" -name "*.js" ! -name "*.map" 2>/dev/null | head -1)
if [ -z "$BUNDLE_FILE" ]; then
  echo "   ERRORE: bundle JS non trovato in $DIST_DIR/_expo/static/js/android/"
  find "$DIST_DIR" -type f 2>/dev/null | head -20
  exit 1
fi
BUNDLE_SIZE=$(wc -c < "$BUNDLE_FILE")
BUNDLE_SIZE_HUMAN=$(node -e "const s=$BUNDLE_SIZE; process.stdout.write(s>1048576 ? (s/1048576).toFixed(1)+' MB' : Math.round(s/1024)+' KB')")
echo "   Bundle trovato: $(basename "$BUNDLE_FILE") ($BUNDLE_SIZE_HUMAN)"

# Step 4: Upload bundle
echo "[4/5] Upload bundle su object storage..."
UPLOAD_RESPONSE=$(curl -s -b "$COOKIE_JAR" -X POST \
  "${BACKEND_URL}/api/admin/ota/upload?version=${VERSION}" \
  -F "bundle=@${BUNDLE_FILE};type=application/javascript")
BUNDLE_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.url // empty' 2>/dev/null)
if [ -z "$BUNDLE_URL" ]; then
  echo "   ERRORE upload: $UPLOAD_RESPONSE"
  exit 1
fi
echo "   Bundle URL: $BUNDLE_URL"

# Step 5: Create and publish release
echo "[5/5] Creazione e pubblicazione release OTA..."
NOTES_JSON=$(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RELEASE_NOTES")
RELEASE_RESPONSE=$(curl -s -b "$COOKIE_JAR" -X POST "$BACKEND_URL/api/admin/ota" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"$VERSION\",\"bundlePath\":\"$BUNDLE_URL\",\"releaseNotes\":$NOTES_JSON,\"publishNow\":true}")
RELEASE_ID=$(echo "$RELEASE_RESPONSE" | jq -r '.id // empty' 2>/dev/null)
if [ -z "$RELEASE_ID" ]; then
  echo "   ERRORE creazione release: $RELEASE_RESPONSE"
  exit 1
fi
echo "   Release ID: $RELEASE_ID"

echo ""
echo "✅ Release OTA v${VERSION} pubblicata con successo!"
echo ""
echo "   Bundle URL : $BUNDLE_URL"
echo "   Release ID : $RELEASE_ID"
echo ""
echo "   Tutti gli utenti riceveranno l'aggiornamento al prossimo avvio."
echo ""
