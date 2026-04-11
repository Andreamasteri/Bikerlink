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

# ── 3. Validazione profilo ──────────────────────────────────────────────────
if [[ "$PROFILE" != "preview" && "$PROFILE" != "production" ]]; then
  echo "  ✖  Profilo non valido: '$PROFILE'"
  echo "  Usa: bash scripts/build-apk.sh [preview|production]"
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
EAS_SKIP_AUTO_FINGERPRINT=1 \
EXPO_PUBLIC_DOMAIN=biker-link.replit.app \
npx eas-cli@latest build \
  --platform android \
  --profile "$PROFILE" \
  --non-interactive
BUILD_EXIT=$?
set -e

# ── 7. Log risultato ─────────────────────────────────────────────────────────
if [ $BUILD_EXIT -eq 0 ]; then
  echo "$TIMESTAMP  APK BUILD COMPLETATA — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY" >> "$LOG_FILE"
  echo ""
  echo "  ✅ Build completata con successo."
else
  echo "$TIMESTAMP  APK BUILD FALLITA (exit=$BUILD_EXIT) — profilo=$PROFILE commit=$COMMIT utente=$AUTHORIZED_BY" >> "$LOG_FILE"
  echo ""
  echo "  ✖  Build fallita (exit code $BUILD_EXIT). Controlla l'output sopra."
  exit $BUILD_EXIT
fi
