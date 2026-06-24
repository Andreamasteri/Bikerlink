#!/usr/bin/env bash
# scripts/publish-ota.sh — BikerLink OTA publish script
# Usage: ./scripts/publish-ota.sh --message "Descrizione aggiornamento"
#
# Requisiti:
#   - EAS_TOKEN nell'ambiente (unico secret necessario)
#   - eas-cli ^20 in node_modules (npm install) — NON il globale
#   - Eseguito dalla root del progetto Expo
#
# Formula versione OTA: <build>.<NEXT_OTA>.<ciclo>
# Vedi .agents/skills/bikerlink-versioning/SKILL.md per dettagli

set -euo pipefail

# ── Timing (allineato a publish-ota-full.sh per logs/ota-timing.log uniforme) ──
T_TOTAL_START=$(date +%s)
T_EXPORT=0; T_UPLOAD=0; T_PUBLISH=0; T_DB=0; T_GIT=0
DIST_DIR="dist-ota"

# ── Colori output ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[OTA]${NC} $*"; }
log_success() { echo -e "${GREEN}[OTA]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[OTA]${NC} $*"; }
log_error()   { echo -e "${RED}[OTA ERROR]${NC} $*" >&2; }

# ── Parsing argomenti ──
MESSAGE=""
# Canale OTA di default: staging (flusso produzione/staging esistente).
# Con --diagnostic si pubblica sul canale isolato "diagnostic", riservato alle
# build diagnostic-apk, così gli OTA diagnostici non raggiungono gli utenti prod.
OTA_CHANNEL="staging"
BUILD_PROFILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message|-m)
      MESSAGE="$2"
      shift 2
      ;;
    --diagnostic)
      OTA_CHANNEL="diagnostic"
      BUILD_PROFILE="diagnostic"
      shift
      ;;
    *)
      log_error "Argomento sconosciuto: $1"
      echo "Uso: $0 --message \"Descrizione aggiornamento\" [--diagnostic]" >&2
      exit 1
      ;;
  esac
done

# ── Validazione ──
if [[ -z "$MESSAGE" ]]; then
  log_error "--message è obbligatorio"
  echo "Uso: $0 --message \"Descrizione aggiornamento\"" >&2
  exit 1
fi

if [[ -z "${EAS_TOKEN:-}" ]]; then
  log_error "EAS_TOKEN non è impostato nell'ambiente"
  echo "Imposta EAS_TOKEN prima di eseguire questo script." >&2
  echo "NON usare la password admin — EAS_TOKEN è l'unico secret necessario." >&2
  exit 1
fi

# ── Verifica EAS CLI (locale o npx fallback via eas.sh) ──
if [ ! -f "node_modules/.bin/eas" ] && ! command -v npx &>/dev/null; then
  log_error "eas CLI non trovato e npx non disponibile. Esegui: npm install"
  exit 1
fi

# ── Leggi versione corrente da app.json ──
BUILD_NUM=$(node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode || 49)" 2>/dev/null || echo "49")
RUNTIME_VER=$(node -e "const a=require('./app.json'); const rv=a.expo.runtimeVersion||'10.0.0'; console.log(rv.split('.')[0])" 2>/dev/null || echo "10")

log_info "Build corrente: ${BUILD_NUM}, Ciclo runtime: ${RUNTIME_VER}"

# ── Determina NEXT_OTA via EAS GraphQL API ──
PROJECT_ID=$(node -e "const a=require('./app.json'); console.log(a.expo.extra?.eas?.projectId || '')" 2>/dev/null || echo "")

CURRENT_MAX_OTA=0

# ── Leggi APPLIED_OTA_NUMBER corrente da buildInfo.ts come base di fallback ──
BUILD_INFO_CURRENT=$(node -e "
  try {
    const fs = require('fs');
    const src = fs.readFileSync('constants/buildInfo.ts', 'utf8');
    const m = src.match(/APPLIED_OTA_NUMBER[^=]*=\s*(\d+)/);
    console.log(m ? m[1] : '0');
  } catch { console.log('0'); }
" 2>/dev/null || echo "0")
log_info "APPLIED_OTA_NUMBER corrente in buildInfo.ts: ${BUILD_INFO_CURRENT}"

EAS_UNREACHABLE=false

if [[ -n "$PROJECT_ID" ]]; then
  log_info "Interrogo EAS GraphQL per il numero OTA più alto (projectId: ${PROJECT_ID})..."

  GRAPHQL_RESPONSE=$(curl -s --fail \
    -H "Authorization: Bearer ${EAS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"{ app { byId(appId: \\\"${PROJECT_ID}\\\") { updateBranches(offset: 0, limit: 2) { updates(offset: 0, limit: 10) { updateGroup message } } } } }\"}" \
    "https://api.expo.dev/graphql" 2>/dev/null) || {
    log_warn "EAS GraphQL non raggiungibile — fallback a buildInfo.ts (APPLIED_OTA_NUMBER=${BUILD_INFO_CURRENT})"
    GRAPHQL_RESPONSE=""
    EAS_UNREACHABLE=true
  }

  if [[ -n "$GRAPHQL_RESPONSE" ]]; then
    CURRENT_MAX_OTA=$(echo "$GRAPHQL_RESPONSE" | node -e "
      let data='';
      process.stdin.on('data', d => data+=d);
      process.stdin.on('end', () => {
        try {
          const res = JSON.parse(data);
          const branches = res?.data?.app?.byId?.updateBranches || [];
          let max = 0;
          for (const branch of branches) {
            for (const upd of (branch.updates || [])) {
              const g = upd.updateGroup || '';
              const n = parseInt(g.split('.')[1] || '0', 10);
              if (!isNaN(n) && n > max) max = n;
            }
          }
          console.log(max);
        } catch { console.log(0); }
      });
    " 2>/dev/null || echo "0")
  fi
fi

# Se EAS non era raggiungibile o ha restituito 0, usa buildInfo.ts come base.
# Scegliamo il massimo tra il valore EAS e quello baked in buildInfo.ts per
# garantire che non si regredisca mai sotto il numero già pubblicato.
if [[ "$EAS_UNREACHABLE" == "true" ]] || [[ "$CURRENT_MAX_OTA" -eq 0 ]]; then
  if [[ "$BUILD_INFO_CURRENT" -gt "$CURRENT_MAX_OTA" ]]; then
    log_warn "EAS GraphQL non disponibile o ha restituito 0 — uso buildInfo.ts come base (${BUILD_INFO_CURRENT})"
    CURRENT_MAX_OTA="$BUILD_INFO_CURRENT"
  fi
fi

NEXT_OTA=$((CURRENT_MAX_OTA + 1))
VERSION="${BUILD_NUM}.${NEXT_OTA}.${RUNTIME_VER}"

log_info "NEXT_OTA: ${NEXT_OTA}, Versione OTA: ${VERSION}"
log_info "Messaggio: ${MESSAGE}"

# ── Aggiorna APPLIED_OTA_NUMBER in constants/buildInfo.ts ──
# Il bundle OTA pubblicato conterrà il numero baked-in:
# al primo avvio dopo l'apply, ProfileVersionSection lo salva in AsyncStorage
BUILD_INFO="constants/buildInfo.ts"
if [[ -f "$BUILD_INFO" ]]; then
  sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${NEXT_OTA};/" "$BUILD_INFO"
  log_info "APPLIED_OTA_NUMBER aggiornato a ${NEXT_OTA} in ${BUILD_INFO}"
else
  log_warn "${BUILD_INFO} non trovato — APPLIED_OTA_NUMBER non aggiornato"
fi

# ── Metro export (bundle Android) — separato per misurare il tempo reale ──
log_info "Fase 1/2 — Metro export (bundle Android, attendi 2-5 minuti)..."
rm -rf "$DIST_DIR"
_T0=$(date +%s)
EXPO_TOKEN="${EAS_TOKEN}" EXPO_PUBLIC_BUILD_PROFILE="${BUILD_PROFILE}" npx expo export \
  --platform android \
  --output-dir "$DIST_DIR" \
  2>&1 || {
  log_error "expo export fallito"
  exit 1
}
T_EXPORT=$(( $(date +%s) - _T0 ))
log_success "⏱ Metro export completato in ${T_EXPORT}s"

# ── Pubblica su staging (usa il bundle pre-compilato) ──
# T_UPLOAD misura il trasferimento CDN; il record EAS è incluso (T_PUBLISH=0).
log_info "Fase 2/2 — EAS upload bundle su CDN (canale ${OTA_CHANNEL})..."
_T0=$(date +%s)
EAS_OUTPUT=$(EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" bash scripts/eas.sh update \
  --channel "${OTA_CHANNEL}" \
  --message "${MESSAGE}" \
  --environment production \
  --input-dir "$DIST_DIR" \
  --skip-bundler \
  --non-interactive \
  2>&1) || {
  log_error "eas update fallito:"
  echo "$EAS_OUTPUT" >&2
  exit 1
}
T_UPLOAD=$(( $(date +%s) - _T0 ))
T_PUBLISH=0
log_success "⏱ EAS upload CDN completato in ${T_UPLOAD}s (record EAS: ${T_PUBLISH}s, incluso)"

UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE 'Update ID: [a-zA-Z0-9_-]+' | head -1 | sed 's/Update ID: //' || echo "")
if [[ -z "$UPDATE_ID" ]]; then
  UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
fi

# ── Riepilogo timing + scrittura ota-timing.log (formato identico a publish-ota-full.sh) ──
T_TOTAL=$(( $(date +%s) - T_TOTAL_START ))
log_success "⏱ Timing riepilogo: export=${T_EXPORT}s | upload=${T_UPLOAD}s | publish=${T_PUBLISH}s | db=${T_DB}s | git=${T_GIT}s | TOTALE=${T_TOTAL}s"

mkdir -p logs
TIMING_LOG="logs/ota-timing.log"
TIMING_LINE="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] OTA v${VERSION} | export: ${T_EXPORT}s | upload: ${T_UPLOAD}s | publish: ${T_PUBLISH}s | db: ${T_DB}s | git: ${T_GIT}s | TOTALE: ${T_TOTAL}s"
echo "$TIMING_LINE" >> "$TIMING_LOG"
log_success "Timing appeso a ${TIMING_LOG}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "OTA pubblicata con successo!"
echo -e "  ${BLUE}Versione OTA${NC}: ${VERSION}"
echo -e "  ${BLUE}Update ID${NC}:    ${UPDATE_ID:-"(vedi output eas sopra)"}"
echo -e "  ${BLUE}Canale${NC}:       ${OTA_CHANNEL}"
echo -e "  ${BLUE}Messaggio${NC}:    ${MESSAGE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prossimi passi:"
echo "  1. Apri il pannello admin nell'app o su /admin/settings"
echo "  2. Clicca 'Prova OTA' per testare sull'app admin"
echo "  3. Clicca 'Approva e Distribuisci' per promuovere a production"
echo ""
