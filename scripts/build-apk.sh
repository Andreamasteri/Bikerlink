#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — APK Build Guard
#  Unico punto di ingresso autorizzato per avviare build EAS su Android.
#
#  ISTRUZIONI PER L'USO (solo con permesso esplicito dell'utente):
#
#    1. Ottenere approvazione esplicita dall'utente ("sì, avvia la build APK")
#    2. Creare il file di autorizzazione monouso:
#         touch .local/apk-build-authorized
#    3. Eseguire questo script:
#         bash scripts/build-apk.sh                # default = release-apk (APK arm64 dimagrita ~50MB)
#         bash scripts/build-apk.sh release-apk    # equivalente esplicito
#         bash scripts/build-apk.sh production     # AAB Play Store (NON APK)
#
#  Il file .local/apk-build-authorized viene eliminato automaticamente dopo
#  l'uso — ogni build richiede una nuova autorizzazione esplicita.
#
#  ⚠️  Profilo "preview" RIMOSSO (Task #1017) — produceva APK universali ~135MB.
#  ⚠️  NON usare `npx eas-cli build` direttamente — usa SEMPRE questo script.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

AUTH_FILE=".local/apk-build-authorized"
LOG_FILE="logs/apk-build-history.log"
# Task #1017: default permanente = release-apk (arm64-v8a only + NewArch + ProGuard/R8)
# APK dimagrita (~50MB invece di 135MB). Per AAB Play Store usa esplicitamente "production".
PROFILE="${1:-release-apk}"

# ── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          BikerLink — APK Build Guard                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Controllo autorizzazione ─────────────────────────────────────────────
if [ ! -f "$AUTH_FILE" ]; then
  echo "  ✖  AUTORIZZAZIONE MANCANTE"
  echo ""
  echo "  Nessuna build APK può partire senza autorizzazione esplicita"
  echo "  dell'utente. Per procedere:"
  echo ""
  echo "    1. Ottenere approvazione esplicita dall'utente"
  echo "    2. Creare il file di autorizzazione:"
  echo "         touch .local/apk-build-authorized"
  echo "    3. Rieseguire: bash scripts/build-apk.sh [release-apk|production]"
  echo ""
  echo "  Questo blocco esiste per prevenire build non autorizzate."
  echo ""
  exit 1
fi

# ── 2. Autorizzazione trovata — consuma il token (uso singolo) ──────────────
echo "  ✔  Autorizzazione trovata — file eliminato (token monouso)"
rm -f "$AUTH_FILE"

# ── 2a-pre. Verifica EXPO_PUBLIC_DOMAIN ─────────────────────────────────────
if [ -z "${EXPO_PUBLIC_DOMAIN:-}" ]; then
  echo ""
  echo "  ✖  EXPO_PUBLIC_DOMAIN non è impostato nell'ambiente."
  echo ""
  echo "  Questa variabile è richiesta per il build. Impostarla nei segreti Replit"
  echo "  o esportarla prima di avviare lo script:"
  echo ""
  echo "    export EXPO_PUBLIC_DOMAIN=your-project.replit.app"
  echo ""
  exit 1
fi
echo "  ✔  EXPO_PUBLIC_DOMAIN=${EXPO_PUBLIC_DOMAIN}"

# ── 2a. Pre-build change detector ───────────────────────────────────────────
echo "  Avvio controllo variazioni dall'ultima build riuscita..."
if bash scripts/pre-build-check.sh; then
  echo "  ✔  Pre-build check completato"
else
  echo ""
  echo "  ✖  BUILD BLOCCATA — expo-doctor ha rilevato problemi critici."
  echo "  Esegui 'npx expo-doctor@latest' per i dettagli e correggi prima di buildare."
  exit 1
fi

# ── 2b. Guardia migrazioni DB (primo step post-auth) ────────────────────────
echo "  Avvio verifica schema DB vs migrazioni Phase 1..."
if bash scripts/db-migration-guard.sh; then
  echo "  ✔  Guardia migrazioni DB superata"
else
  echo ""
  echo "  ✖  BUILD BLOCCATA — problemi rilevati dalla guardia migrazioni DB."
  echo "  Correggere i problemi sopra prima di avviare la build."
  exit 1
fi

# ── 2b. Sync versionCode: app.json → android/app/build.gradle ───────────────
if ! command -v jq &>/dev/null; then
  echo "  ✖  jq non trovato — impossibile sincronizzare versionCode."
  echo "  Installare jq prima di eseguire build-apk.sh"
  exit 1
fi
if [ ! -f "app.json" ]; then
  echo "  ✖  app.json non trovato — impossibile leggere versionCode."
  exit 1
fi
if [ ! -f "android/app/build.gradle" ]; then
  echo "  ✖  android/app/build.gradle non trovato — eseguire prima 'git add -f android/'."
  exit 1
fi
VERSION_CODE=$(jq -r '.expo.android.versionCode' app.json)
if ! [[ "$VERSION_CODE" =~ ^[0-9]+$ ]]; then
  echo "  ✖  versionCode in app.json non è un numero valido: '$VERSION_CODE'"
  echo "  Verificare app.json → android.versionCode"
  exit 1
fi
sed -i "s/versionCode [0-9][0-9]*/versionCode $VERSION_CODE/" android/app/build.gradle
ACTUAL=$(grep 'versionCode ' android/app/build.gradle | grep -oP '\d+' | head -1)
if [ "$ACTUAL" != "$VERSION_CODE" ]; then
  echo "  ✖  Sync versionCode FALLITO: atteso $VERSION_CODE, trovato '$ACTUAL' in build.gradle"
  echo "  Il formato di build.gradle potrebbe essere cambiato — verificare la riga versionCode."
  exit 1
fi
echo "  ✔  versionCode sincronizzato e verificato: $VERSION_CODE (app.json → build.gradle)"

VERSION_NAME=$(jq -r '.expo.version' app.json)
if [ -z "$VERSION_NAME" ] || [ "$VERSION_NAME" = "null" ]; then
  echo "  ✖  version in app.json non trovata o nulla."
  exit 1
fi
sed -i "s/versionName \"[^\"]*\"/versionName \"$VERSION_NAME\"/" android/app/build.gradle
ACTUAL_NAME=$(grep 'versionName ' android/app/build.gradle | grep -oP '"[^"]+"' | tr -d '"' | head -1)
if [ "$ACTUAL_NAME" != "$VERSION_NAME" ]; then
  echo "  ✖  Sync versionName FALLITO: atteso $VERSION_NAME, trovato '$ACTUAL_NAME' in build.gradle"
  exit 1
fi
echo "  ✔  versionName sincronizzato e verificato: $VERSION_NAME (app.json → build.gradle)"

# ── 2c. Auto-commit file di versione prima di inviare a EAS ─────────────────
# EAS archivia il progetto dal filesystem ma usa i file git-tracciati come base.
# Se app.json e build.gradle non sono committati, EAS compila con i valori vecchi
# (problema riscontrato nella build v43: APK mostrava v41/3.1.0 invece di v43/3.2.0).
GIT_COMMITTED="no"
if git --no-optional-locks diff --quiet HEAD -- app.json android/app/build.gradle 2>/dev/null; then
  echo "  ℹ  Nessun commit necessario (app.json e build.gradle già allineati con git)"
else
  COMMIT_MSG="chore: bump version to $VERSION_NAME (versionCode $VERSION_CODE) [build-apk]"
  ADD_EXIT=0
  git add app.json android/app/build.gradle 2>/dev/null || ADD_EXIT=$?
  if [ $ADD_EXIT -ne 0 ]; then
    echo "  ⚠  git add fallito (exit=$ADD_EXIT) — build continua con file locali"
  else
    COMMIT_EXIT=0
    git commit -m "$COMMIT_MSG" 2>/dev/null || COMMIT_EXIT=$?
    if [ $COMMIT_EXIT -eq 0 ]; then
      echo "  ✔  Versioni committate: $COMMIT_MSG"
      GIT_COMMITTED="yes"
    else
      echo "  ⚠  Commit fallito (exit=$COMMIT_EXIT, git non configurato?) — build continua con file locali"
    fi
  fi
fi

# ── 3. Validazione profilo ──────────────────────────────────────────────────
# Task #1017: profili ammessi sono solo "release-apk" (default APK dimagrita) e
# "production" (AAB Play Store). Il vecchio "preview" è stato rimosso per evitare
# regressioni accidentali a APK universali (4 ABI = ~135MB invece di ~50MB).
if [[ "$PROFILE" == "preview" ]]; then
  echo "  ✖  Profilo 'preview' RIMOSSO (Task #1017)"
  echo ""
  echo "  Il profilo 'preview' produceva APK universali (4 ABI, ~135MB)."
  echo "  Da ora il default è 'release-apk' (arm64-v8a only + NewArch, ~50MB)."
  echo ""
  echo "  Usa: bash scripts/build-apk.sh             # default = release-apk (APK dimagrita)"
  echo "  Usa: bash scripts/build-apk.sh release-apk # esplicito"
  echo "  Usa: bash scripts/build-apk.sh production  # AAB Play Store"
  exit 1
fi
if [[ "$PROFILE" != "production" && "$PROFILE" != "release-apk" ]]; then
  echo "  ✖  Profilo non valido: '$PROFILE'"
  echo "  Usa: bash scripts/build-apk.sh [release-apk|production]"
  exit 1
fi

# ── 3a. Assertion config-based — Task #1017 ─────────────────────────────────
# Verifica che la config Android non sia stata accidentalmente regredita a
# multi-ABI (4 ABI universale = APK ~135MB invece di ~50MB).
# Questo controllo è indipendente dal nome del profilo: se qualcuno modifica
# release-apk in eas.json o riattiva multi-ABI in gradle.properties / build.gradle,
# la build viene bloccata con messaggio chiaro.
GP_LINE=$(grep -E "^reactNativeArchitectures=" android/gradle.properties || echo "")
if [[ "$GP_LINE" != "reactNativeArchitectures=arm64-v8a" ]]; then
  echo "  ✖  REGRESSIONE ABI rilevata in android/gradle.properties"
  echo "     Atteso: reactNativeArchitectures=arm64-v8a"
  echo "     Trovato: $GP_LINE"
  echo "     Task #1017 richiede arm64-v8a SOLO (default permanente)."
  exit 1
fi
BG_LINE=$(grep -oE 'abiFilters[[:space:]]+"[^"]*"(,[[:space:]]*"[^"]*")*' android/app/build.gradle 2>/dev/null | head -1 || true)
if [[ "$BG_LINE" != 'abiFilters "arm64-v8a"' ]]; then
  echo "  ✖  REGRESSIONE ABI rilevata in android/app/build.gradle"
  echo '     Atteso: abiFilters "arm64-v8a"'
  echo "     Trovato: $BG_LINE"
  echo "     Task #1017 richiede arm64-v8a SOLO (default permanente)."
  exit 1
fi
EBP=$(node -e "const c=require('./app.json'); const p=(c.expo.plugins||[]).find(x=>Array.isArray(x)&&x[0]==='expo-build-properties'); process.stdout.write(p?JSON.stringify(p[1]?.android?.buildArchs||[]):'MISSING')")
if [[ "$EBP" != '["arm64-v8a"]' ]]; then
  echo "  ✖  REGRESSIONE plugin expo-build-properties in app.json"
  echo '     Atteso: android.buildArchs = ["arm64-v8a"]'
  echo "     Trovato: $EBP"
  echo "     Task #1017 richiede arm64-v8a SOLO nel plugin (default permanente)."
  exit 1
fi
echo "  ✔  Config Android verificata: arm64-v8a only (gradle.properties + build.gradle + app.json)"

# New Architecture assertion
NA_LINE=$(grep -E "^newArchEnabled=" android/gradle.properties || echo "")
if [[ "$NA_LINE" != "newArchEnabled=true" ]]; then
  echo "  ✖  REGRESSIONE New Architecture rilevata in android/gradle.properties"
  echo "     Atteso: newArchEnabled=true"
  echo "     Trovato: $NA_LINE"
  echo "     RN 0.82+ richiede New Architecture (hardcoded). Il flag deve essere true."
  exit 1
fi
NA_EBP=$(node -e "const c=require('./app.json'); const p=(c.expo.plugins||[]).find(x=>Array.isArray(x)&&x[0]==='expo-build-properties'); process.stdout.write(p?String(p[1]?.android?.newArchEnabled??'MISSING'):'MISSING')")
if [[ "$NA_EBP" != "true" ]]; then
  echo "  ✖  REGRESSIONE New Architecture nel plugin expo-build-properties (app.json)"
  echo "     Atteso: android.newArchEnabled = true"
  echo "     Trovato: $NA_EBP"
  exit 1
fi
echo "  ✔  New Architecture verificata: newArchEnabled=true (gradle.properties + app.json)"

# ── 4. Log dell'evento ───────────────────────────────────────────────────────
mkdir -p logs
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT=$(git --no-optional-locks rev-parse --short HEAD 2>/dev/null || echo "unknown")
AUTHORIZED_BY=$(whoami 2>/dev/null || echo "unknown")
echo "$TIMESTAMP  APK BUILD AVVIATA — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY versionName=$VERSION_NAME versionCode=$VERSION_CODE committed=$GIT_COMMITTED" >> "$LOG_FILE"
echo "  ✔  Evento loggato in $LOG_FILE"

# ── 5. Riepilogo pre-build ───────────────────────────────────────────────────
echo ""
echo "  Profilo   : $PROFILE"
echo "  Commit    : $COMMIT"
echo "  Timestamp : $TIMESTAMP"
echo ""
echo "  Avvio build EAS in 5 secondi..."
echo "  (Ctrl+C per annullare)"
echo ""
sleep 5

# ── 6. Build EAS (set -e disabilitato attorno al comando per catturare exit code) ─
EAS_OUTPUT_TMP=$(mktemp)
set +e
CI=1 \
EAS_NO_VCS=1 \
EXPO_PUBLIC_DOMAIN="${EXPO_PUBLIC_DOMAIN}" \
bash scripts/eas.sh build \
  --platform android \
  --profile "$PROFILE" \
  --non-interactive \
  --no-wait \
  --clear-cache 2>&1 | tee "$EAS_OUTPUT_TMP"
BUILD_EXIT=${PIPESTATUS[0]}
set -e

# Estrai BUILD_ID dall'output EAS (URL del tipo .../builds/<UUID>)
BUILD_ID=$(grep -oP '(?<=/builds/)[0-9a-f-]{36}' "$EAS_OUTPUT_TMP" | head -1 || true)
rm -f "$EAS_OUTPUT_TMP"

# ── 7. Log risultato ─────────────────────────────────────────────────────────
if [ $BUILD_EXIT -eq 0 ]; then
  echo "$TIMESTAMP  APK BUILD INVIATA (--no-wait) — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY versionName=$VERSION_NAME versionCode=$VERSION_CODE committed=$GIT_COMMITTED buildId=${BUILD_ID:-sconosciuto}" >> "$LOG_FILE"
  echo ""
  echo "  ✅ Build inviata ai server EAS — controlla https://expo.dev per lo stato."
  echo ""
  if [ -n "$BUILD_ID" ]; then
    echo "  📋 BUILD_ID: $BUILD_ID"
    echo ""
  else
    echo "  ⚠  BUILD_ID non rilevato dall'output EAS."
    echo "  Recuperalo da: https://expo.dev → Projects → Builds"
    echo ""
  fi
  echo "  Salvataggio snapshot build (per pre-build-check prossima run)..."
  bash scripts/save-build-snapshot.sh "" "" 2>/dev/null || true
  echo ""
  echo "  ┌─────────────────────────────────────────────────────────────────┐"
  echo "  │  PROSSIMO PASSO — Monitoraggio automatico build EAS            │"
  echo "  │                                                                 │"
  if [ -n "$BUILD_ID" ]; then
    echo "  │  Esegui questo comando per monitorare la build e salvare        │"
    echo "  │  lo snapshot automaticamente al completamento:                  │"
    echo "  │                                                                 │"
    echo "  │    bash scripts/poll-eas-build.sh $BUILD_ID  │"
    echo "  │                                                                 │"
    echo "  │  Oppure, se preferisci farlo manualmente dopo il completamento: │"
    echo "  │    bash scripts/save-build-snapshot.sh $BUILD_ID               │"
  else
    echo "  │  Recupera il BUILD_ID da https://expo.dev → Projects → Builds  │"
    echo "  │  poi esegui:                                                    │"
    echo "  │                                                                 │"
    echo "  │    bash scripts/poll-eas-build.sh <BUILD_ID>                   │"
    echo "  │                                                                 │"
    echo "  │  Oppure manualmente dopo il completamento:                      │"
    echo "  │    bash scripts/save-build-snapshot.sh <BUILD_ID>              │"
  fi
  echo "  └─────────────────────────────────────────────────────────────────┘"

  # ── Step M: Aggiornamento PROVVISORIO skill bikerlink-versioning ────────────
  # ⚠  Questo aggiornamento è provvisorio: la build è stata *inviata* a EAS con
  #    --no-wait, ma non ancora confermata come riuscita. Se EAS la rifiuta subito
  #    (credenziali invalide, quota superata, ecc.) la skill resta aggiornata con
  #    dati sbagliati. Il dato confermato viene scritto da save-build-snapshot.sh
  #    quando viene chiamato con il BUILD_ID reale (dopo che EAS completa la build).
  echo ""
  echo "  Aggiornamento PROVVISORIO skill bikerlink-versioning (confermato da save-build-snapshot.sh)..."
  VERSIONING_SKILL=".agents/skills/bikerlink-versioning/SKILL.md"
  if [ -f "$VERSIONING_SKILL" ]; then
    BUILD_VERSION_CODE="$VERSION_CODE" \
    BUILD_VERSION_NAME="$VERSION_NAME" \
    BUILD_PROFILE="$PROFILE" \
    SKILL_PATH="$VERSIONING_SKILL" \
    node -e "
      const fs = require('fs');
      const path = process.env.SKILL_PATH;
      const versionCode = process.env.BUILD_VERSION_CODE;
      const versionName = process.env.BUILD_VERSION_NAME;

      // Leggi runtimeVersion da app.json
      let runtimeVersion = 'unknown';
      try {
        const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
        runtimeVersion = appJson.expo.runtimeVersion || 'unknown';
      } catch (e) {}

      // Estrai il numero di ciclo (es. '10.0.0' → '10')
      const cycleNum = runtimeVersion.split('.')[0] || '?';

      let content = fs.readFileSync(path, 'utf8');

      // 1. Aggiorna tabella 'Consistenza tra file'
      // expo.version
      content = content.replace(
        /(\| \`app\.json\` \| \`expo\.version\` \| \`)[^\`]*(\` \|)/,
        '\$1' + versionName + '\$2'
      );
      // expo.android.versionCode
      content = content.replace(
        /(\| \`app\.json\` \| \`expo\.android\.versionCode\` \| \`)[^\`]*(\` \|)/,
        '\$1' + versionCode + '\$2'
      );
      // expo.runtimeVersion
      content = content.replace(
        /(\| \`app\.json\` \| \`expo\.runtimeVersion\` \| \`)[^\`]*(\` \|)/,
        '\$1' + runtimeVersion + '\$2'
      );
      // build.gradle versionCode
      content = content.replace(
        /(\| \`android\/app\/build\.gradle\` \| \`versionCode\` \| \`)[^\`]*(\` \|)/,
        '\$1' + versionCode + '\$2'
      );
      // build.gradle versionName
      content = content.replace(
        /(\| \`android\/app\/build\.gradle\` \| \`versionName\` \| \`\")[^\`]*(\"\` \|)/,
        '\$1' + versionName + '\$2'
      );
      // strings.xml expo_runtime_version
      content = content.replace(
        /(\| \`android\/app\/src\/main\/res\/values\/strings\.xml\` \| \`expo_runtime_version\` \| \`)[^\`]*(\` \|)/,
        '\$1' + runtimeVersion + '\$2'
      );

      // 2. Aggiorna 'Tabella storica dei cicli':
      //    - Rimuovi '**Corrente**' dall'ultima riga che ce l'ha
      //    - Aggiungi una nuova riga come Corrente
      content = content.replace(/(\*\*Corrente\*\*[^\n]*)/, (match) => {
        return match.replace('**Corrente** — ', '');
      });

      // Inserisci la nuova riga dopo l'ultima riga della tabella (prima del '>')
      const newRow = '| v' + versionCode + ' | ' + versionCode + ' | ' + versionName + ' | ' + runtimeVersion + ' | ' + cycleNum + '.x | — | **Corrente** |';
      // Trova l'ultima riga della tabella (l'ultima '| v...' prima del blocco '>')
      const lastRowIdx = content.lastIndexOf('\n| v');
      if (lastRowIdx !== -1) {
        const endOfLastRow = content.indexOf('\n', lastRowIdx + 1);
        const insertPos = endOfLastRow !== -1 ? endOfLastRow : content.length;
        content = content.slice(0, insertPos) + '\n' + newRow + content.slice(insertPos);
      }

      fs.writeFileSync(path, content, 'utf8');
      process.stdout.write('OK');
    " 2>/dev/null && echo "  ✔  Skill bikerlink-versioning aggiornata (v$VERSION_CODE / $VERSION_NAME)" \
      || echo "  ⚠  Aggiornamento skill versioning fallito (non bloccante — build già avviata)"
  else
    echo "  ⚠  Skill file non trovato: $VERSIONING_SKILL (non bloccante)"
  fi
else
  echo "$TIMESTAMP  APK BUILD FALLITA (exit=$BUILD_EXIT) — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY" >> "$LOG_FILE"
  echo ""
  echo "  ✖  Build fallita (exit code $BUILD_EXIT). Controlla l'output sopra."
  exit $BUILD_EXIT
fi
