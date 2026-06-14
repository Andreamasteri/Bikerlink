#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Pre-Build Change Detector
#
#  Confronta lo stato attuale del progetto contro l'ultima snapshot di build
#  riuscita (.local/build-snapshot.json) e segnala ogni differenza che
#  potrebbe causare errori di compilazione.
#
#  Uso:
#    bash scripts/pre-build-check.sh            # solo report, non blocca
#    bash scripts/pre-build-check.sh --strict   # blocca se ci sono warning
#
#  Integrato in build-apk.sh come step automatico pre-build.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

STRICT=false
[[ "${1:-}" == "--strict" ]] && STRICT=true

SNAPSHOT_FILE=".local/build-snapshot.json"
CURRENT_FILE=".local/build-snapshot-current.json"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

WARNINGS=0
ERRORS=0

warn()  { echo -e "  ${YELLOW}⚠${RESET}  $1"; ((WARNINGS++)); true; }
error() { echo -e "  ${RED}✖${RESET}  $1"; ((ERRORS++)); true; }
ok()    { echo -e "  ${GREEN}✔${RESET}  $1"; }
info()  { echo -e "  ${CYAN}ℹ${RESET}  $1"; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       BikerLink — Pre-Build Change Detector                 ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Genera snapshot corrente ─────────────────────────────────────────────
mkdir -p .local

PKG_VERSION() {
  node -e "try{process.stdout.write(require('./node_modules/$1/package.json').version)}catch(e){process.stdout.write('NOT_INSTALLED')}" 2>/dev/null || echo "NOT_INSTALLED"
}

# Pacchetti critici da monitorare
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

# Costruisce JSON snapshot corrente
VERSIONS_JSON="{"
for pkg in "${PACKAGES[@]}"; do
  ver=$(PKG_VERSION "$pkg")
  VERSIONS_JSON+="\"$pkg\":\"$ver\","
done
VERSIONS_JSON="${VERSIONS_JSON%,}}"

# Patches presenti
PATCHES_LIST=$(ls patches/ 2>/dev/null | tr '\n' ',' | sed 's/,$//' || echo "")

# Expo doctor — output formato: "18/18 checks passed."
DOCTOR_RESULT=$(npx expo-doctor@latest 2>/dev/null | grep -E 'checks passed|checks failed|check failed' | tail -1 || echo "FAILED")
DOCTOR_PASS=$(echo "$DOCTOR_RESULT" | grep -oP '^\d+(?=/\d+)' || echo "?")
DOCTOR_TOTAL=$(echo "$DOCTOR_RESULT" | grep -oP '(?<=\d/)\d+' | head -1 || echo "?")

# RN / Expo SDK versions da app.json
SDK_VERSION=$(node -e "try{process.stdout.write(require('./node_modules/expo/package.json').version)}catch(e){process.stdout.write('?')}" 2>/dev/null || echo "?")
RUNTIME_VERSION=$(node -e "process.stdout.write(require('./app.json').expo.runtimeVersion||'?')" 2>/dev/null || echo "?")
VERSION_CODE=$(node -e "process.stdout.write(String(require('./app.json').expo.android?.versionCode||'?'))" 2>/dev/null || echo "?")
EAS_CLI_VERSION=$(bash scripts/eas.sh --version 2>/dev/null | head -1 | grep -oP '[\d.]+' | head -1 || echo "?")
NODE_VERSION=$(node --version 2>/dev/null || echo "?")

CURRENT_JSON=$(cat <<EOF
{
  "capturedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "sdkVersion": "$SDK_VERSION",
  "runtimeVersion": "$RUNTIME_VERSION",
  "versionCode": "$VERSION_CODE",
  "easCliVersion": "$EAS_CLI_VERSION",
  "nodeVersion": "$NODE_VERSION",
  "doctorPassed": "$DOCTOR_PASS",
  "doctorTotal": "$DOCTOR_TOTAL",
  "patches": "$PATCHES_LIST",
  "packages": $VERSIONS_JSON
}
EOF
)

echo "$CURRENT_JSON" > "$CURRENT_FILE"

# ── 2. Se non c'è snapshot precedente, segnala e esci ───────────────────────
if [ ! -f "$SNAPSHOT_FILE" ]; then
  info "Nessuna snapshot di build precedente trovata in $SNAPSHOT_FILE"
  info "Snapshot corrente salvata in $CURRENT_FILE"
  info "Esegui 'bash scripts/save-build-snapshot.sh' dopo la prima build riuscita."
  echo ""
  echo -e "  ${CYAN}Prima build — nessun confronto disponibile.${RESET}"
  echo ""
  exit 0
fi

# ── 3. Confronto con snapshot precedente ────────────────────────────────────
PREV=$(cat "$SNAPSHOT_FILE")

echo -e "  Confronto con snapshot del $(echo "$PREV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('capturedAt','?'))")"
echo ""

GET_PREV() { echo "$PREV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1','?'))" 2>/dev/null || echo "?"; }
GET_CURR() { echo "$CURRENT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1','?'))" 2>/dev/null || echo "?"; }
GET_PKG_PREV() { echo "$PREV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('packages',{}).get('$1','?'))" 2>/dev/null || echo "?"; }
GET_PKG_CURR() { echo "$CURRENT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('packages',{}).get('$1','?'))" 2>/dev/null || echo "?"; }

CHANGED=false

# -- 3a. Runtime / SDK
echo -e "  ${BOLD}─── SDK & Runtime ──────────────────────────────────────────${RESET}"
PREV_SDK=$(GET_PREV sdkVersion); CURR_SDK=$(GET_CURR sdkVersion)
PREV_RV=$(GET_PREV runtimeVersion); CURR_RV=$(GET_CURR runtimeVersion)
PREV_VC=$(GET_PREV versionCode); CURR_VC=$(GET_CURR versionCode)
PREV_EAS=$(GET_PREV easCliVersion); CURR_EAS=$(GET_CURR easCliVersion)
PREV_NODE=$(GET_PREV nodeVersion); CURR_NODE=$(GET_CURR nodeVersion)

[ "$PREV_SDK" != "$CURR_SDK" ] && warn "Expo SDK: $PREV_SDK → $CURR_SDK" && CHANGED=true || ok "Expo SDK: $CURR_SDK"
[ "$PREV_RV" != "$CURR_RV" ] && warn "runtimeVersion: $PREV_RV → $CURR_RV" && CHANGED=true || ok "runtimeVersion: $CURR_RV"
[ "$PREV_VC" != "$CURR_VC" ] && info "versionCode: $PREV_VC → $CURR_VC (OK se nuovo ciclo APK)" || ok "versionCode: $CURR_VC"
[ "$PREV_EAS" != "$CURR_EAS" ] && warn "EAS CLI: $PREV_EAS → $CURR_EAS" && CHANGED=true || ok "EAS CLI: $CURR_EAS"
[ "$PREV_NODE" != "$CURR_NODE" ] && warn "Node.js: $PREV_NODE → $CURR_NODE" && CHANGED=true || ok "Node.js: $CURR_NODE"

echo ""
echo -e "  ${BOLD}─── Pacchetti critici ──────────────────────────────────────${RESET}"

for pkg in "${PACKAGES[@]}"; do
  prev_ver=$(GET_PKG_PREV "$pkg")
  curr_ver=$(GET_PKG_CURR "$pkg")
  if [ "$prev_ver" == "NOT_INSTALLED" ] && [ "$curr_ver" == "NOT_INSTALLED" ]; then
    continue  # non installato in nessuno dei due → skip
  fi
  if [ "$prev_ver" != "$curr_ver" ]; then
    if [ "$curr_ver" == "NOT_INSTALLED" ] && [ "$prev_ver" != "NOT_INSTALLED" ]; then
      warn "RIMOSSO: $pkg ($prev_ver → non installato)" && CHANGED=true
    elif [ "$prev_ver" == "NOT_INSTALLED" ] && [ "$curr_ver" != "NOT_INSTALLED" ]; then
      info "AGGIUNTO: $pkg ($curr_ver)"
    else
      warn "AGGIORNATO: $pkg ($prev_ver → $curr_ver)" && CHANGED=true
    fi
  else
    ok "$pkg: $curr_ver"
  fi
done

echo ""
echo -e "  ${BOLD}─── Patch files ────────────────────────────────────────────${RESET}"
PREV_PATCHES=$(GET_PREV patches)
CURR_PATCHES=$(GET_CURR patches)
if [ "$PREV_PATCHES" != "$CURR_PATCHES" ]; then
  warn "patches/ MODIFICATO:" && CHANGED=true
  [ -n "$PREV_PATCHES" ] && warn "  Prima: $PREV_PATCHES" || info "  Prima: (nessuna)"
  [ -n "$CURR_PATCHES" ] && warn "  Ora:   $CURR_PATCHES" || info "  Ora:   (nessuna)"
else
  if [ -z "$CURR_PATCHES" ]; then
    ok "patches/: vuota (nessuna patch attiva)"
  else
    ok "patches/: $CURR_PATCHES"
  fi
fi

echo ""
echo -e "  ${BOLD}─── Expo Doctor ────────────────────────────────────────────${RESET}"
PREV_DP=$(GET_PREV doctorPassed); PREV_DT=$(GET_PREV doctorTotal)
if [ "$DOCTOR_PASS" == "$DOCTOR_TOTAL" ] && [ "$DOCTOR_TOTAL" != "?" ]; then
  ok "expo-doctor: $DOCTOR_PASS/$DOCTOR_TOTAL checks passed"
  if [ "$PREV_DP" != "$PREV_DT" ]; then
    info "Nota: nella build precedente aveva $PREV_DP/$PREV_DT — ora tutto verde ✅"
  fi
else
  error "expo-doctor: $DOCTOR_PASS/$DOCTOR_TOTAL checks passed — CI SONO PROBLEMI!" && CHANGED=true
  warn "Esegui 'npx expo-doctor@latest' per vedere i dettagli"
fi

# ── 4. Runtime Health Check (Sistema B) ─────────────────────────────────────
echo ""
echo -e "  ${BOLD}─── Runtime Health (Sistema B) ─────────────────────────────${RESET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if bash "$SCRIPT_DIR/check-runtime-health.sh" --quiet 2>/dev/null; then
  ok "Runtime health: backend sano (VERDE)"
else
  error "Runtime health: backend NON sano (ROSSO) — verificare i processi live"
fi

# ── 5. Riepilogo finale ─────────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}────────────────────────────────────────────────────────────${RESET}"
if [ "$CHANGED" = true ] || [ $WARNINGS -gt 0 ] || [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "  ${YELLOW}${BOLD}⚠  Rilevate $WARNINGS variazioni e $ERRORS errori rispetto all'ultima build.${RESET}"
  echo ""
  echo -e "  ${BOLD}Controlla ogni voce gialla sopra prima di procedere.${RESET}"
  echo -e "  Variazioni di pacchetto possono introdurre peer dependency nuove"
  echo -e "  o rompere la compatibilità R8/ProGuard."
  echo ""
  if [ $ERRORS -gt 0 ] || [ "$STRICT" = true ]; then
    echo -e "  ${RED}BUILD BLOCCATA — risolvere i problemi e riprovare.${RESET}"
    echo ""
    exit 1
  fi
  echo -e "  Continua la build con consapevolezza delle variazioni."
else
  echo ""
  ok "Nessuna variazione rilevata — ambiente identico all'ultima build riuscita."
fi

echo ""
