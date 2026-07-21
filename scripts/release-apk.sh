#!/usr/bin/env bash
# ============================================================
# BikerLink — Release APK nativo
# Uso: bash scripts/release-apk.sh [ota_inglobata]
#
# Esempio: bash scripts/release-apk.sh       → v53.0.10
#          bash scripts/release-apk.sh 3      → v53.3.10
# ============================================================
set -e

# ── Parametri ──────────────────────────────────────────────
OTA_BUNDLED="${1:-0}"
CYCLE="11"   # ciclo runtimeVersion (cambia solo con breaking native change)

# ── Legge versionCode attuale da app.json ──────────────────
CURRENT_CODE=$(node -p "require('./app.json').expo.android.versionCode")
NEW_CODE=$((CURRENT_CODE + 1))
NEW_NAME="${NEW_CODE}.${OTA_BUNDLED}.${CYCLE}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   BikerLink — Release APK nativo         ║"
echo "╚══════════════════════════════════════════╝"
echo "  Versione corrente : ${CURRENT_CODE} ($(node -p "require('./app.json').expo.version"))"
echo "  Nuova versione    : versionCode=${NEW_CODE}  versionName=${NEW_NAME}"
echo ""
read -p "Confermi? [Y/n] " CONFIRM
CONFIRM="${CONFIRM:-y}"
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Annullato."; exit 0; }

# ── 1. Aggiorna app.json ───────────────────────────────────
echo ""
echo "[1/5] Aggiornamento app.json..."
node - << JSEOF
const fs = require('fs');
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
app.expo.version = '${NEW_NAME}';
app.expo.android.versionCode = ${NEW_CODE};
fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
console.log('      app.json OK');
JSEOF

# ── 2. Aggiorna build.gradle + strings.xml ─────────────────
echo "[2/5] Aggiornamento android/app/build.gradle e strings.xml..."
sed -i.bak \
  -e "s/versionCode [0-9]*/versionCode ${NEW_CODE}/" \
  -e "s/versionName \"[^\"]*\"/versionName \"${NEW_NAME}\"/" \
  android/app/build.gradle
rm -f android/app/build.gradle.bak
echo "      build.gradle OK"

# Legge runtimeVersion da app.json (aggiornato al passo 1) e allinea strings.xml
RUNTIME_VERSION=$(node -p "require('./app.json').expo.runtimeVersion")
STRINGS_XML="android/app/src/main/res/values/strings.xml"
sed -i.bak \
  -e "s|<string name=\"expo_runtime_version\">[^<]*</string>|<string name=\"expo_runtime_version\">${RUNTIME_VERSION}</string>|" \
  "${STRINGS_XML}"
rm -f "${STRINGS_XML}.bak"
echo "      strings.xml  expo_runtime_version = ${RUNTIME_VERSION}"

# ── 3. Aggiorna constants/buildInfo.ts ────────────────────
# RELEASE_NUMBER e RUNTIME_VERSION sono derivati a runtime da app.json — non serve aggiornarli.
# Aggiorniamo solo APPLIED_OTA_NUMBER.
echo "[3/5] Aggiornamento constants/buildInfo.ts..."
sed -i.bak \
  -e "s/export const APPLIED_OTA_NUMBER.*$/export const APPLIED_OTA_NUMBER: number | null = null;/" \
  constants/buildInfo.ts
rm -f constants/buildInfo.ts.bak
echo "      buildInfo.ts OK"

# ── 4. Git commit + push ───────────────────────────────────
echo "[4/5] Commit e push su GitHub..."
git add app.json android/app/build.gradle constants/buildInfo.ts android/app/src/main/res/values/strings.xml
git commit -m "build: bump versione nativa v${NEW_NAME} (versionCode ${NEW_CODE})"
git push
echo "      Push OK"

# ── 5. EAS Build ──────────────────────────────────────────
echo "[5/5] Invio build a EAS..."
echo ""
bash scripts/eas.sh build --platform android --profile release-apk --non-interactive

echo ""
echo "✅ Build v${NEW_NAME} inviata a EAS."
echo "   Monitora su: https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds"
