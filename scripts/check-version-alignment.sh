#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Sistema A: Version Alignment Check
#
#  Verifica che le versioni siano allineate tra:
#    - app.json          (expo.version, expo.android.versionCode, expo.runtimeVersion)
#    - build.gradle      (versionCode, versionName)
#    - strings.xml       (expo_runtime_version)
#
#  Fa parte del protocollo "controllo-incrociato" — Sistema A (analisi statica).
#  Produce output strutturato compatibile con la firma di completamento.
#
#  Exit code:
#    0 — tutti i check verdi (VERDE)
#    1 — almeno un check BLOCCANTE
#
#  Uso:
#    bash scripts/check-version-alignment.sh
#    bash scripts/check-version-alignment.sh --quiet   # solo summary finale
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

BLOCKING=0
WARNINGS=0
FINDINGS=()

blocker() {
  local msg="$1"
  FINDINGS+=("[BLOCCANTE] $msg")
  ((BLOCKING++)) || true
  $QUIET || echo -e "  ${RED}✖ BLOCCANTE${RESET}  $msg"
}

warning() {
  local msg="$1"
  FINDINGS+=("[WARNING] $msg")
  ((WARNINGS++)) || true
  $QUIET || echo -e "  ${YELLOW}⚠ WARNING${RESET}   $msg"
}

ok() {
  local msg="$1"
  $QUIET || echo -e "  ${GREEN}✔${RESET}  $msg"
}

info() {
  local msg="$1"
  $QUIET || echo -e "  ${CYAN}ℹ${RESET}  $msg"
}

$QUIET || echo ""
$QUIET || echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
$QUIET || echo -e "${BOLD}║   BikerLink — Sistema A: Version Alignment Check            ║${RESET}"
$QUIET || echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
$QUIET || echo ""

# ── 1. Leggi app.json ────────────────────────────────────────────────────────
APP_JSON="app.json"
if [ ! -f "$APP_JSON" ]; then
  blocker "app.json non trovato in $(pwd)"
  echo ""
  echo "ESITO FINALE: ROSSO"
  exit 1
fi

APP_VERSION=$(node -e "process.stdout.write(require('./$APP_JSON').expo.version||'')" 2>/dev/null || echo "")
APP_VERSION_CODE=$(node -e "process.stdout.write(String(require('./$APP_JSON').expo.android?.versionCode||''))" 2>/dev/null || echo "")
APP_RUNTIME=$(node -e "process.stdout.write(require('./$APP_JSON').expo.runtimeVersion||'')" 2>/dev/null || echo "")

$QUIET || echo -e "  ${BOLD}─── app.json ────────────────────────────────────────────────${RESET}"
if [ -z "$APP_VERSION" ]; then
  blocker "app.json: expo.version è vuoto o mancante"
else
  ok "app.json  expo.version         = $APP_VERSION"
fi
if [ -z "$APP_VERSION_CODE" ]; then
  blocker "app.json: expo.android.versionCode è vuoto o mancante"
else
  ok "app.json  expo.android.versionCode = $APP_VERSION_CODE"
fi
if [ -z "$APP_RUNTIME" ]; then
  blocker "app.json: expo.runtimeVersion è vuoto o mancante"
else
  ok "app.json  expo.runtimeVersion  = $APP_RUNTIME"
fi

# ── 2. Leggi build.gradle ────────────────────────────────────────────────────
GRADLE="android/app/build.gradle"
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}─── android/app/build.gradle ────────────────────────────────${RESET}"

if [ ! -f "$GRADLE" ]; then
  warning "$GRADLE non trovato — skip controllo build.gradle"
else
  GRADLE_VERSION_CODE=$(grep -oP '(?<=versionCode )\d+' "$GRADLE" | head -1 || echo "")
  GRADLE_VERSION_NAME=$(grep -oP '(?<=versionName ")[\d.]+' "$GRADLE" | head -1 || echo "")

  if [ -z "$GRADLE_VERSION_CODE" ]; then
    blocker "$GRADLE: versionCode non trovato"
  else
    ok "build.gradle  versionCode  = $GRADLE_VERSION_CODE"
    if [ -n "$APP_VERSION_CODE" ] && [ "$GRADLE_VERSION_CODE" != "$APP_VERSION_CODE" ]; then
      blocker "versionCode disallineato: app.json=$APP_VERSION_CODE  build.gradle=$GRADLE_VERSION_CODE"
    elif [ -n "$APP_VERSION_CODE" ]; then
      ok "versionCode allineato ($APP_VERSION_CODE)"
    fi
  fi

  if [ -z "$GRADLE_VERSION_NAME" ]; then
    blocker "$GRADLE: versionName non trovato"
  else
    ok "build.gradle  versionName  = $GRADLE_VERSION_NAME"
    if [ -n "$APP_VERSION" ] && [ "$GRADLE_VERSION_NAME" != "$APP_VERSION" ]; then
      blocker "versionName disallineato: app.json=$APP_VERSION  build.gradle=$GRADLE_VERSION_NAME"
    elif [ -n "$APP_VERSION" ]; then
      ok "versionName allineato ($APP_VERSION)"
    fi
  fi
fi

# ── 3. Leggi strings.xml ─────────────────────────────────────────────────────
STRINGS="android/app/src/main/res/values/strings.xml"
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}─── strings.xml ─────────────────────────────────────────────${RESET}"

if [ ! -f "$STRINGS" ]; then
  warning "$STRINGS non trovato — skip controllo strings.xml"
else
  STRINGS_RUNTIME=$(grep -oP '(?<=expo_runtime_version">)[^<]+' "$STRINGS" | head -1 || echo "")

  if [ -z "$STRINGS_RUNTIME" ]; then
    blocker "$STRINGS: expo_runtime_version non trovato"
  else
    ok "strings.xml  expo_runtime_version = $STRINGS_RUNTIME"
    if [ -n "$APP_RUNTIME" ] && [ "$STRINGS_RUNTIME" != "$APP_RUNTIME" ]; then
      blocker "runtimeVersion disallineato: app.json=$APP_RUNTIME  strings.xml=$STRINGS_RUNTIME"
    elif [ -n "$APP_RUNTIME" ]; then
      ok "runtimeVersion allineato ($APP_RUNTIME)"
    fi
  fi
fi


# ── 5. Riepilogo e firma di completamento ─────────────────────────────────────
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}──────────────────────────────────────────────────────────────${RESET}"
$QUIET || echo ""

if [ ${#FINDINGS[@]} -eq 0 ]; then
  FINDINGS_TEXT="nessun finding"
else
  FINDINGS_TEXT=$(printf '%s\n' "${FINDINGS[@]}")
fi

if [ "$BLOCKING" -gt 0 ]; then
  ESITO="ROSSO"
  ESITO_LABEL="${RED}ROSSO${RESET}"
else
  ESITO="VERDE"
  ESITO_LABEL="${GREEN}VERDE${RESET}"
fi

echo ""
echo "=== CONTROLLO INCROCIATO — Version Alignment ==="
echo ""
echo "SISTEMA A — Findings statici (versioning):"
if [ ${#FINDINGS[@]} -eq 0 ]; then
  echo "- nessun finding"
else
  printf '- %s\n' "${FINDINGS[@]}"
fi
echo ""
echo "ESITO FINALE: $ESITO ($BLOCKING bloccanti, $WARNINGS warning)"
echo "=================================================="

if [ "$BLOCKING" -gt 0 ]; then
  echo ""
  echo -e "  ${RED}${BOLD}✖  $BLOCKING check BLOCCANTI — allineare i file prima di procedere.${RESET}"
  echo ""
  echo "  Consulta la skill bikerlink-versioning per le regole di allineamento."
  echo ""
  exit 1
fi

echo ""
echo -e "  ${GREEN}${BOLD}✔  Tutti i file di versioning sono allineati — VERDE.${RESET}"
echo ""
exit 0
