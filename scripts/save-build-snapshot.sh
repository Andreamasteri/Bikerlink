#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Save Build Snapshot
#
#  Salva uno snapshot dello stato corrente del progetto come riferimento
#  per la prossima build. Da eseguire DOPO una build EAS riuscita.
#
#  Uso:
#    bash scripts/save-build-snapshot.sh [BUILD_ID] [APK_URL]
#    bash scripts/save-build-snapshot.sh e03f51d8-... https://expo.dev/...
#
#  Il file .local/build-snapshot.json viene usato da pre-build-check.sh
#  per confrontare lo stato corrente con l'ultima build nota come buona.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

BUILD_ID="${1:-}"
APK_URL="${2:-}"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       BikerLink — Salvataggio Snapshot Build                ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

mkdir -p .local

PKG_VERSION() {
  node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){process.stdout.write('NOT_INSTALLED')}" 2>/dev/null || echo "NOT_INSTALLED"
}

PACKAGES=(
  "expo"
  "react-native"
  "expo-modules-core"
  "expo-audio"
  "expo-asset"
  "expo-av"
  "expo-build-properties"
  "expo-updates"
  "expo-router"
  "react-native-reanimated"
  "@expo/metro-config"
  "metro"
)

VERSIONS_JSON="{"
for pkg in "${PACKAGES[@]}"; do
  ver=$(PKG_VERSION "$pkg")
  VERSIONS_JSON+="\"$pkg\":\"$ver\","
done
VERSIONS_JSON="${VERSIONS_JSON%,}}"

PATCHES_LIST=$(ls patches/ 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo "")

echo -e "  ${CYAN}ℹ${RESET}  Raccolta versioni pacchetti..."
DOCTOR_RESULT=$(npx expo-doctor@latest 2>/dev/null | grep -E 'checks passed|checks failed|check failed' | tail -1 || echo "FAILED")
DOCTOR_PASS=$(echo "$DOCTOR_RESULT" | grep -oP '^\d+(?=/\d+)' || echo "?")
DOCTOR_TOTAL=$(echo "$DOCTOR_RESULT" | grep -oP '(?<=\d/)\d+' | head -1 || echo "?")

SDK_VERSION=$(node -e "try{process.stdout.write(require('./node_modules/expo/package.json').version)}catch(e){process.stdout.write('?')}" 2>/dev/null || echo "?")
RUNTIME_VERSION=$(node -e "process.stdout.write(require('./app.json').expo.runtimeVersion||'?')" 2>/dev/null || echo "?")
VERSION_CODE=$(node -e "process.stdout.write(String(require('./app.json').expo.android?.versionCode||'?'))" 2>/dev/null || echo "?")
EAS_CLI_VERSION=$(npx eas-cli@18 --version 2>/dev/null | head -1 | grep -oP '[\d.]+' | head -1 || echo "?")
NODE_VERSION=$(node --version 2>/dev/null || echo "?")
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
GRADLE_PROPS=$(grep -E "^(reactNativeArchitectures|newArchEnabled|android\.enableR8\.fullMode|android\.enableMinify)" android/gradle.properties 2>/dev/null | tr '\n' '|' | sed 's/|$//' || echo "")

SNAPSHOT=$(cat <<EOF
{
  "capturedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "commit": "$COMMIT",
  "buildId": "$BUILD_ID",
  "apkUrl": "$APK_URL",
  "sdkVersion": "$SDK_VERSION",
  "runtimeVersion": "$RUNTIME_VERSION",
  "versionCode": "$VERSION_CODE",
  "easCliVersion": "$EAS_CLI_VERSION",
  "nodeVersion": "$NODE_VERSION",
  "doctorPassed": "$DOCTOR_PASS",
  "doctorTotal": "$DOCTOR_TOTAL",
  "patches": "$PATCHES_LIST",
  "gradleProperties": "$GRADLE_PROPS",
  "packages": $VERSIONS_JSON
}
EOF
)

SNAPSHOT_FILE=".local/build-snapshot.json"

# Archivia la snapshot precedente se esiste
if [ -f "$SNAPSHOT_FILE" ]; then
  ARCHIVE_DIR=".local/build-snapshots-archive"
  mkdir -p "$ARCHIVE_DIR"
  PREV_DATE=$(python3 -c "import json; d=json.load(open('$SNAPSHOT_FILE')); print(d.get('capturedAt','unknown').replace(':','-'))" 2>/dev/null || echo "prev")
  cp "$SNAPSHOT_FILE" "$ARCHIVE_DIR/snapshot-$PREV_DATE.json"
  echo -e "  ${CYAN}ℹ${RESET}  Snapshot precedente archiviata in $ARCHIVE_DIR/"
fi

echo "$SNAPSHOT" > "$SNAPSHOT_FILE"

echo ""
echo -e "  ${GREEN}✔${RESET}  Snapshot salvata in $SNAPSHOT_FILE"
echo ""
echo "  Dati registrati:"
echo "  • Timestamp  : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "  • Commit     : ${COMMIT:0:12}..."
echo "  • versionCode: $VERSION_CODE"
echo "  • SDK        : $SDK_VERSION"
echo "  • runtimeV.  : $RUNTIME_VERSION"
echo "  • EAS CLI    : $EAS_CLI_VERSION"
echo "  • Node.js    : $NODE_VERSION"
echo "  • expo-doctor: $DOCTOR_PASS/$DOCTOR_TOTAL"
echo "  • Patches    : ${PATCHES_LIST:-nessuna}"
echo ""
echo -e "  La prossima build confronterà automaticamente con questo stato."
echo ""
