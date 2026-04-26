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
#         bash scripts/build-apk.sh [preview|production]
#
#  Il file .local/apk-build-authorized viene eliminato automaticamente dopo
#  l'uso — ogni build richiede una nuova autorizzazione esplicita.
#
#  ⚠️  NON usare `npx eas-cli build` direttamente — usa SEMPRE questo script.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

AUTH_FILE=".local/apk-build-authorized"
LOG_FILE="logs/apk-build-history.log"
PROFILE="${1:-preview}"

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
  echo "    3. Rieseguire: bash scripts/build-apk.sh [$PROFILE]"
  echo ""
  echo "  Questo blocco esiste per prevenire build non autorizzate."
  echo ""
  exit 1
fi

# ── 2. Autorizzazione trovata — consuma il token (uso singolo) ──────────────
echo "  ✔  Autorizzazione trovata — file eliminato (token monouso)"
rm -f "$AUTH_FILE"

# ── 2a. Guardia migrazioni DB (primo step post-auth) ────────────────────────
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

# ── 3. Validazione profilo ──────────────────────────────────────────────────
if [[ "$PROFILE" != "preview" && "$PROFILE" != "production" && "$PROFILE" != "release-apk" ]]; then
  echo "  ✖  Profilo non valido: '$PROFILE'"
  echo "  Usa: bash scripts/build-apk.sh [preview|production|release-apk]"
  exit 1
fi

# ── 4. Log dell'evento ───────────────────────────────────────────────────────
mkdir -p logs
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
AUTHORIZED_BY=$(whoami 2>/dev/null || echo "unknown")
echo "$TIMESTAMP  APK BUILD AVVIATA — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY" >> "$LOG_FILE"
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
set +e
CI=1 \
EAS_NO_VCS=1 \
EAS_SKIP_AUTO_FINGERPRINT=1 \
EXPO_PUBLIC_DOMAIN=biker-link.replit.app \
npx eas-cli@18 build \
  --platform android \
  --profile "$PROFILE" \
  --clear-cache \
  --non-interactive \
  --no-wait
BUILD_EXIT=$?
set -e

# ── 7. Log risultato ─────────────────────────────────────────────────────────
if [ $BUILD_EXIT -eq 0 ]; then
  echo "$TIMESTAMP  APK BUILD INVIATA (--no-wait) — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY" >> "$LOG_FILE"
  echo ""
  echo "  ✅ Build inviata ai server EAS — controlla https://expo.dev per lo stato."
else
  echo "$TIMESTAMP  APK BUILD FALLITA (exit=$BUILD_EXIT) — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY" >> "$LOG_FILE"
  echo ""
  echo "  ✖  Build fallita (exit code $BUILD_EXIT). Controlla l'output sopra."
  exit $BUILD_EXIT
fi
