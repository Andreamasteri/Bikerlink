#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Bowie Terminal expo-doctor check
#
#  Esegue `npx expo-doctor` con cwd=bowie-terminal/ e verifica exit 0.
#  Se un check regredisce, stampa chiaramente quale check ha fallito.
#
#  Uso:
#    bash scripts/check-bowie-expo-doctor.sh
#
#  Note:
#  - Il "duplicate dependencies" false-positive (react/react-native presenti
#    anche nella root) è soppresso via expo.install.exclude e
#    expo.autolinking.exclude in bowie-terminal/package.json.
#  - Se questo check regredisce dopo un bump di bowie-terminal o della root,
#    leggere .agents/memory/bowie-terminal-nested-app-doctor.md.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

BOWIE_DIR="bowie-terminal"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     BikerLink — Bowie Terminal expo-doctor check            ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

if [ ! -d "$BOWIE_DIR" ]; then
  echo -e "  ${RED}✖${RESET}  Directory '$BOWIE_DIR' non trovata — eseguire dal root del repo."
  exit 1
fi

if [ ! -f "$BOWIE_DIR/package.json" ]; then
  echo -e "  ${RED}✖${RESET}  $BOWIE_DIR/package.json non trovato."
  exit 1
fi

if [ ! -d "$BOWIE_DIR/node_modules" ]; then
  echo -e "  ${YELLOW}⚠${RESET}  $BOWIE_DIR/node_modules assente — eseguo npm install prima di expo-doctor."
  echo ""
  (cd "$BOWIE_DIR" && npm install --prefer-offline --no-audit --no-fund 2>&1)
  echo ""
fi

echo -e "  Eseguo: npx expo-doctor (cwd=$BOWIE_DIR/)"
echo ""

# Cattura output e exit code; stampa tutto in tempo reale
DOCTOR_OUTPUT_FILE=$(mktemp)
trap 'rm -f "$DOCTOR_OUTPUT_FILE"' EXIT

set +e
(cd "$BOWIE_DIR" && npx expo-doctor 2>&1) | tee "$DOCTOR_OUTPUT_FILE"
DOCTOR_EXIT=${PIPESTATUS[0]}
set -e

echo ""

if [ "$DOCTOR_EXIT" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}✔  expo-doctor: tutti i check superati (exit 0)${RESET}"
  echo ""
  exit 0
fi

# Evidenzia le righe dei check falliti per agevolare il debug
echo -e "  ${RED}${BOLD}✖  expo-doctor ha rilevato uno o più check falliti (exit $DOCTOR_EXIT)${RESET}"
echo ""
echo -e "  ${BOLD}Check falliti:${RESET}"
grep -E '(✖|✗|FAIL|failed|error|Error)' "$DOCTOR_OUTPUT_FILE" | \
  sed 's/^/    /' || true
echo ""
echo -e "  Per dettagli: cd $BOWIE_DIR && npx expo-doctor"
echo -e "  Se il fallimento riguarda 'duplicate dependencies' di react/react-native,"
echo -e "  verificare expo.install.exclude e expo.autolinking.exclude in"
echo -e "  $BOWIE_DIR/package.json e il file .agents/memory/bowie-terminal-nested-app-doctor.md"
echo ""
exit 1
