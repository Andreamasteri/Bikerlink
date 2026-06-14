#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — EAS Build Poller
#
#  Monitora una build EAS in corso e, al completamento, chiama
#  save-build-snapshot.sh automaticamente con il BUILD_ID reale.
#
#  Uso:
#    bash scripts/poll-eas-build.sh <BUILD_ID>
#
#  Esempio:
#    bash scripts/poll-eas-build.sh e03f51d8-1234-5678-abcd-ef0123456789
#
#  Il BUILD_ID viene stampato da build-apk.sh subito dopo l'invio a EAS.
#  Lo script esegue polling ogni 60 secondi fino a:
#    - FINISHED  → chiama save-build-snapshot.sh e termina con exit 0
#    - ERRORED   → stampa avviso e termina con exit 1
#    - CANCELLED → stampa avviso e termina con exit 2
#  Timeout configurabile tramite variabile POLL_TIMEOUT_MINUTES (default: 60)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

BUILD_ID="${1:-}"
POLL_INTERVAL="${POLL_INTERVAL_SECONDS:-60}"
POLL_TIMEOUT_MINUTES="${POLL_TIMEOUT_MINUTES:-60}"
LOG_FILE="logs/apk-build-history.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║          BikerLink — EAS Build Poller                       ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Validazione BUILD_ID ─────────────────────────────────────────────────────
if [ -z "$BUILD_ID" ]; then
  echo -e "  ${RED}✖${RESET}  BUILD_ID mancante."
  echo ""
  echo "  Uso: bash scripts/poll-eas-build.sh <BUILD_ID>"
  echo ""
  echo "  Il BUILD_ID viene stampato da build-apk.sh subito dopo l'invio a EAS."
  echo "  Puoi trovarlo anche su https://expo.dev → Projects → Builds"
  exit 1
fi

# ── Verifica eas-cli disponibile ─────────────────────────────────────────────
if ! bash scripts/eas.sh --version &>/dev/null 2>&1; then
  echo -e "  ${RED}✖${RESET}  eas-cli non disponibile. Installare con: npm install -g eas-cli"
  exit 1
fi

mkdir -p logs

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "$TIMESTAMP  POLL AVVIATO — buildId=$BUILD_ID interval=${POLL_INTERVAL}s timeout=${POLL_TIMEOUT_MINUTES}min" >> "$LOG_FILE"

echo -e "  ${CYAN}ℹ${RESET}  BUILD_ID  : $BUILD_ID"
echo -e "  ${CYAN}ℹ${RESET}  Interval  : ${POLL_INTERVAL}s"
echo -e "  ${CYAN}ℹ${RESET}  Timeout   : ${POLL_TIMEOUT_MINUTES} minuti"
echo ""

MAX_ITERATIONS=$(( POLL_TIMEOUT_MINUTES * 60 / POLL_INTERVAL ))
ITERATION=0

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$(( ITERATION + 1 ))
  NOW=$(date -u +"%H:%M:%S")

  # Interroga EAS per lo stato della build
  EAS_OUTPUT=$(CI=1 bash scripts/eas.sh build:view "$BUILD_ID" --json 2>/dev/null || echo '{"status":"ERROR_FETCHING"}')

  BUILD_STATUS=$(echo "$EAS_OUTPUT" | node -e "
    let d='';
    process.stdin.on('data', c => d+=c);
    process.stdin.on('end', () => {
      try {
        const o = JSON.parse(d);
        process.stdout.write(o.status || o.buildStatus || 'UNKNOWN');
      } catch(e) {
        process.stdout.write('PARSE_ERROR');
      }
    });
  " 2>/dev/null || echo "UNKNOWN")

  # Normalizza a maiuscolo
  BUILD_STATUS=$(echo "$BUILD_STATUS" | tr '[:lower:]' '[:upper:]')

  echo -e "  [${NOW}]  Stato: ${BOLD}${BUILD_STATUS}${RESET}  (tentativo $ITERATION/$MAX_ITERATIONS)"

  case "$BUILD_STATUS" in

    FINISHED)
      echo ""
      echo -e "  ${GREEN}✅ Build completata con successo!${RESET}"
      echo ""
      FINISH_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      echo "$FINISH_TIMESTAMP  POLL SUCCESSO — buildId=$BUILD_ID status=FINISHED" >> "$LOG_FILE"

      echo "  Avvio salvataggio snapshot confermato..."
      echo ""
      if bash scripts/save-build-snapshot.sh "$BUILD_ID" ""; then
        echo ""
        echo -e "  ${GREEN}✔${RESET}  Snapshot salvata con BUILD_ID confermato."
      else
        echo ""
        echo -e "  ${YELLOW}⚠${RESET}  save-build-snapshot.sh ha restituito un errore (non bloccante)."
        echo "  Puoi rieseguire manualmente:"
        echo "    bash scripts/save-build-snapshot.sh $BUILD_ID"
      fi
      exit 0
      ;;

    ERRORED|FAILED)
      echo ""
      echo -e "  ${RED}✖  Build FALLITA (status=$BUILD_STATUS)${RESET}"
      echo ""
      echo "  Dettagli errore disponibili su:"
      echo "    https://expo.dev/accounts/bikerlink/projects/bikerlink/builds/$BUILD_ID"
      echo ""
      FAIL_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      echo "$FAIL_TIMESTAMP  POLL FALLITO — buildId=$BUILD_ID status=$BUILD_STATUS" >> "$LOG_FILE"
      exit 1
      ;;

    CANCELLED|CANCELED)
      echo ""
      echo -e "  ${YELLOW}⚠  Build ANNULLATA (status=$BUILD_STATUS)${RESET}"
      echo ""
      CANCEL_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      echo "$CANCEL_TIMESTAMP  POLL ANNULLATO — buildId=$BUILD_ID status=$BUILD_STATUS" >> "$LOG_FILE"
      exit 2
      ;;

    IN_QUEUE|PENDING|QUEUED)
      echo -e "        ${CYAN}→${RESET}  Build in coda — prossimo controllo tra ${POLL_INTERVAL}s..."
      ;;

    IN_PROGRESS|RUNNING|BUILDING)
      echo -e "        ${CYAN}→${RESET}  Build in corso — prossimo controllo tra ${POLL_INTERVAL}s..."
      ;;

    ERROR_FETCHING|PARSE_ERROR|UNKNOWN)
      echo -e "        ${YELLOW}⚠${RESET}  Impossibile leggere lo stato EAS — prossimo tentativo tra ${POLL_INTERVAL}s..."
      ;;

    *)
      echo -e "        ${CYAN}→${RESET}  Stato sconosciuto '$BUILD_STATUS' — prossimo controllo tra ${POLL_INTERVAL}s..."
      ;;
  esac

  sleep "$POLL_INTERVAL"
done

# ── Timeout raggiunto ────────────────────────────────────────────────────────
echo ""
echo -e "  ${YELLOW}⚠  Timeout raggiunto dopo ${POLL_TIMEOUT_MINUTES} minuti.${RESET}"
echo ""
echo "  La build potrebbe essere ancora in corso. Controlla manualmente:"
echo "    https://expo.dev/accounts/bikerlink/projects/bikerlink/builds/$BUILD_ID"
echo ""
echo "  Quando la build è completata, salva lo snapshot manualmente:"
echo "    bash scripts/save-build-snapshot.sh $BUILD_ID"
echo ""
TIMEOUT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "$TIMEOUT_TIMESTAMP  POLL TIMEOUT — buildId=$BUILD_ID dopo ${POLL_TIMEOUT_MINUTES}min" >> "$LOG_FILE"
exit 3
