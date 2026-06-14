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
VERSION_NAME=$(node -e "process.stdout.write(require('./app.json').expo.version||'?')" 2>/dev/null || echo "?")
EAS_CLI_VERSION=$(bash scripts/eas.sh --version 2>/dev/null | head -1 | grep -oP '[\d.]+' | head -1 || echo "?")
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

# ── Step M-confirmed: Aggiornamento CONFERMATO skill bikerlink-versioning ────
# Viene eseguito SOLO quando BUILD_ID è non vuoto, cioè quando questa funzione
# viene chiamata con un BUILD_ID reale restituito da EAS dopo che la build è
# effettivamente riuscita. Sovrascrive l'aggiornamento provvisorio fatto da
# build-apk.sh al momento dell'invio (--no-wait).
if [ -n "$BUILD_ID" ]; then
  VERSIONING_SKILL=".agents/skills/bikerlink-versioning/SKILL.md"
  echo ""
  echo "  BUILD_ID fornito — aggiornamento CONFERMATO skill bikerlink-versioning..."
  if [ -f "$VERSIONING_SKILL" ]; then
    BUILD_VERSION_CODE="$VERSION_CODE" \
    BUILD_VERSION_NAME="$VERSION_NAME" \
    BUILD_RUNTIME_VERSION="$RUNTIME_VERSION" \
    SKILL_PATH="$VERSIONING_SKILL" \
    node -e "
      const fs = require('fs');
      const path = process.env.SKILL_PATH;
      const versionCode = process.env.BUILD_VERSION_CODE;
      const versionName = process.env.BUILD_VERSION_NAME;
      const runtimeVersion = process.env.BUILD_RUNTIME_VERSION || 'unknown';

      // Estrai il numero di ciclo (es. '10.0.0' → '10')
      const cycleNum = runtimeVersion.split('.')[0] || '?';

      let content = fs.readFileSync(path, 'utf8');

      // 1. Aggiorna tabella 'Consistenza tra file'
      content = content.replace(
        /(\| \`app\.json\` \| \`expo\.version\` \| \`)[^\`]*(\` \|)/,
        '\$1' + versionName + '\$2'
      );
      content = content.replace(
        /(\| \`app\.json\` \| \`expo\.android\.versionCode\` \| \`)[^\`]*(\` \|)/,
        '\$1' + versionCode + '\$2'
      );
      content = content.replace(
        /(\| \`app\.json\` \| \`expo\.runtimeVersion\` \| \`)[^\`]*(\` \|)/,
        '\$1' + runtimeVersion + '\$2'
      );
      content = content.replace(
        /(\| \`android\/app\/build\.gradle\` \| \`versionCode\` \| \`)[^\`]*(\` \|)/,
        '\$1' + versionCode + '\$2'
      );
      content = content.replace(
        /(\| \`android\/app\/build\.gradle\` \| \`versionName\` \| \`\")[^\`]*(\"\` \|)/,
        '\$1' + versionName + '\$2'
      );
      content = content.replace(
        /(\| \`android\/app\/src\/main\/res\/values\/strings\.xml\` \| \`expo_runtime_version\` \| \`)[^\`]*(\` \|)/,
        '\$1' + runtimeVersion + '\$2'
      );

      // 2. Aggiorna 'Tabella storica dei cicli':
      //    - Rimuovi '**Corrente**' dall'ultima riga che ce l'ha
      //    - Aggiungi una nuova riga come Corrente (solo se non esiste già per questo versionCode)
      const existingRow = new RegExp('\\| v' + versionCode + ' \\|');
      if (!existingRow.test(content)) {
        content = content.replace(/(\*\*Corrente\*\*[^\n]*)/, (match) => {
          return match.replace('**Corrente** — ', '');
        });
        const newRow = '| v' + versionCode + ' | ' + versionCode + ' | ' + versionName + ' | ' + runtimeVersion + ' | ' + cycleNum + '.x | — | **Corrente** |';
        const lastRowIdx = content.lastIndexOf('\n| v');
        if (lastRowIdx !== -1) {
          const endOfLastRow = content.indexOf('\n', lastRowIdx + 1);
          const insertPos = endOfLastRow !== -1 ? endOfLastRow : content.length;
          content = content.slice(0, insertPos) + '\n' + newRow + content.slice(insertPos);
        }
      } else {
        // La riga esiste già (aggiornamento provvisorio da build-apk.sh) — non duplicare
        process.stderr.write('Riga v' + versionCode + ' già presente — skip inserimento\n');
      }

      fs.writeFileSync(path, content, 'utf8');
      process.stdout.write('OK');
    " 2>/dev/null \
      && echo "  ✔  Skill bikerlink-versioning aggiornata con BUILD_ID confermato (v$VERSION_CODE / $VERSION_NAME)" \
      || echo "  ⚠  Aggiornamento skill versioning fallito (non bloccante)"
  else
    echo "  ⚠  Skill file non trovato: $VERSIONING_SKILL (non bloccante)"
  fi
else
  echo "  ℹ  BUILD_ID vuoto — skip aggiornamento skill versioning (aggiornamento provvisorio già fatto da build-apk.sh)"
fi
