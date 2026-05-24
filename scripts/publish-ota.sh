#!/usr/bin/env bash
# scripts/publish-ota.sh — BikerLink OTA publish script
# Usage: ./scripts/publish-ota.sh --message "Descrizione aggiornamento"
#
# Requisiti:
#   - EAS_TOKEN nell'ambiente (unico secret necessario)
#   - eas CLI installato (npm install -g eas-cli)
#   - Eseguito dalla root del progetto Expo
#
# Formula versione OTA: <build>.<NEXT_OTA>.<ciclo>
# Vedi .agents/skills/bikerlink-versioning/SKILL.md per dettagli

set -euo pipefail

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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message|-m)
      MESSAGE="$2"
      shift 2
      ;;
    *)
      log_error "Argomento sconosciuto: $1"
      echo "Uso: $0 --message \"Descrizione aggiornamento\"" >&2
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

# ── Verifica EAS CLI ──
if ! command -v eas &> /dev/null; then
  log_error "eas CLI non trovato. Installa con: npm install -g eas-cli"
  exit 1
fi

# ── Leggi versione corrente da app.json ──
BUILD_NUM=$(node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode || 49)" 2>/dev/null || echo "49")
RUNTIME_VER=$(node -e "const a=require('./app.json'); const rv=a.expo.runtimeVersion||'10.0.0'; console.log(rv.split('.')[0])" 2>/dev/null || echo "10")

log_info "Build corrente: ${BUILD_NUM}, Ciclo runtime: ${RUNTIME_VER}"

# ── Determina NEXT_OTA via EAS GraphQL API ──
PROJECT_ID=$(node -e "const a=require('./app.json'); console.log(a.expo.extra?.eas?.projectId || '')" 2>/dev/null || echo "")

CURRENT_MAX_OTA=0

if [[ -n "$PROJECT_ID" ]]; then
  log_info "Interrogo EAS GraphQL per il numero OTA più alto (projectId: ${PROJECT_ID})..."

  GRAPHQL_RESPONSE=$(curl -s --fail \
    -H "Authorization: Bearer ${EAS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"{ app { byId(appId: \\\"${PROJECT_ID}\\\") { updateBranches(offset: 0, limit: 2) { updates(offset: 0, limit: 10) { updateGroup message } } } } }\"}" \
    "https://api.expo.dev/graphql" 2>/dev/null) || {
    log_warn "EAS GraphQL non raggiungibile — uso NEXT_OTA=1 come fallback"
    GRAPHQL_RESPONSE=""
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

NEXT_OTA=$((CURRENT_MAX_OTA + 1))
VERSION="${BUILD_NUM}.${NEXT_OTA}.${RUNTIME_VER}"

log_info "NEXT_OTA: ${NEXT_OTA}, Versione OTA: ${VERSION}"
log_info "Messaggio: ${MESSAGE}"
log_info "Pubblicazione su canale staging..."

# ── Pubblica su staging ──
EAS_OUTPUT=$(EXPO_TOKEN="${EAS_TOKEN}" eas update \
  --channel staging \
  --message "${MESSAGE}" \
  --non-interactive \
  2>&1) || {
  log_error "eas update fallito:"
  echo "$EAS_OUTPUT" >&2
  exit 1
}

UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE 'Update ID: [a-zA-Z0-9_-]+' | head -1 | sed 's/Update ID: //' || echo "")
if [[ -z "$UPDATE_ID" ]]; then
  UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || echo "")
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "OTA pubblicata con successo!"
echo -e "  ${BLUE}Versione OTA${NC}: ${VERSION}"
echo -e "  ${BLUE}Update ID${NC}:    ${UPDATE_ID:-"(vedi output eas sopra)"}"
echo -e "  ${BLUE}Canale${NC}:       staging"
echo -e "  ${BLUE}Messaggio${NC}:    ${MESSAGE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Prossimi passi:"
echo "  1. Apri il pannello admin nell'app o su /admin/settings"
echo "  2. Clicca 'Prova OTA' per testare sull'app admin"
echo "  3. Clicca 'Approva e Distribuisci' per promuovere a production"
echo ""
