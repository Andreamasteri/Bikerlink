#!/usr/bin/env bash
# scripts/publish-ota-full.sh — BikerLink OTA publish atomico (Task #2503)
#
# Ordine atomico:
#   1. Pubblica su EAS production (può fallire → exit senza toccare buildInfo né git)
#   2. Estrae UPDATE_ID + GROUP_ID dall'output EAS
#   3. Inserisce riga in ota_releases con status='pending' (sempre, senza condizioni)
#   4. SOLO ORA aggiorna constants/buildInfo.ts + push GitHub
#
# Flusso post-publish: la release resta `pending` finché un admin non clicca
# "Approva" dal pannello /admin/ota. Solo dopo l'approvazione gli utenti normali
# la ricevono. Gli account admin la ricevono già dal cold start successivo per testarla.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[OTA]${NC} $*"; }
log_ok()      { echo -e "${GREEN}[OTA ✓]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[OTA !]${NC} $*"; }
log_error()   { echo -e "${RED}[OTA ✗]${NC} $*" >&2; }

cd /home/runner/workspace

# ── 1. Leggi messaggio da .ota-message ──────────────────────────────────────
MSG_FILE=".ota-message"
if [[ ! -f "$MSG_FILE" ]]; then
  log_error "File .ota-message non trovato. Crea il file con il messaggio dell'aggiornamento."
  exit 1
fi

MESSAGE=$(grep -v '^\s*#' "$MSG_FILE" | tr -d '\r' | sed '/^[[:space:]]*$/d' | head -1)

if [[ -z "$MESSAGE" ]]; then
  echo "[OTA] Nessun messaggio in .ota-message — pubblicazione saltata."
  echo "[OTA] Per pubblicare: scrivi una riga in .ota-message e riavvia il workflow."
  exit 0
fi

log_info "Messaggio: ${MESSAGE}"

# ── 2. Verifica token ────────────────────────────────────────────────────────
if [[ -z "${EAS_TOKEN:-}" ]]; then
  log_error "EAS_TOKEN non impostato nell'ambiente."
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  log_error "DATABASE_URL non impostato nell'ambiente."
  exit 1
fi

log_info "EAS_TOKEN: ${#EAS_TOKEN} chars — OK"

# ── 3. Calcola numero OTA (informativo) ─────────────────────────────────────
PENDING_PLUS_APPROVED_COUNT=$(psql "$DATABASE_URL" -tAc "
  SELECT COUNT(*) FROM ota_releases WHERE status IN ('approved','pending')
" 2>/dev/null || echo "0")
NEXT_OTA=$(( PENDING_PLUS_APPROVED_COUNT + 1 ))
BUILD_NUM=$(node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode || 53)" 2>/dev/null || echo "53")
RUNTIME_FULL=$(node -e "const a=require('./app.json'); console.log(a.expo.runtimeVersion||'10.0.0')" 2>/dev/null || echo "10.0.0")
RUNTIME_VER=$(echo "$RUNTIME_FULL" | cut -d. -f1)
VERSION="${BUILD_NUM}.${RUNTIME_VER}.${NEXT_OTA}"

log_info "Build: ${BUILD_NUM} | NEXT_OTA: ${NEXT_OTA} | Versione: ${VERSION}"

# Prefisso OTA nel messaggio EAS — consente al server prod di estrarre la versione via sync
EAS_MESSAGE="[OTA:${VERSION}] ${MESSAGE}"
log_info "Messaggio EAS: ${EAS_MESSAGE}"

# ── 4. EAS publish FIRST (atomico: se fallisce, niente buildInfo/git) ───────
log_info "Pubblicazione bundle su EAS production (Metro in corso — attendi 5-8 minuti)..."

EAS_OUTPUT=$(EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" \
  eas update \
    --channel production \
    --environment production \
    --message "${EAS_MESSAGE}" \
    --non-interactive 2>&1) || {
  log_error "eas update fallito — buildInfo NON modificato, git NON aggiornato:"
  echo "$EAS_OUTPUT"
  exit 1
}

echo "$EAS_OUTPUT"

# Estrai IDs
UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE 'Android update ID\s+[a-f0-9-]{36}' | grep -oE '[a-f0-9-]{36}' || true)
GROUP_ID=$(echo  "$EAS_OUTPUT" | grep -oE 'Update group ID\s+[a-f0-9-]{36}' | grep -oE '[a-f0-9-]{36}' || true)

if [[ -z "$UPDATE_ID" ]]; then
  UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -2 | head -1 || true)
fi
if [[ -z "$GROUP_ID" ]]; then
  GROUP_ID=$(echo  "$EAS_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1 || true)
fi

log_ok "Android Update ID : ${UPDATE_ID:-'(vedi output sopra)'}"
log_ok "Group ID          : ${GROUP_ID:-'(vedi output sopra)'}"

if [[ -z "$UPDATE_ID" || -z "$GROUP_ID" ]]; then
  log_error "Impossibile estrarre UPDATE_ID o GROUP_ID dall'output EAS — buildInfo NON modificato"
  exit 1
fi

# ── 5. Insert in DB come PENDING (Task #2503: sempre pending, nessuna scorciatoia) ───
psql "$DATABASE_URL" -c "
  INSERT INTO ota_releases (
    id, eas_update_id, eas_group_id, channel, runtime_version,
    message, ota_version, status, published_at
  ) VALUES (
    gen_random_uuid(),
    '${UPDATE_ID}',
    '${GROUP_ID}',
    'production',
    '${RUNTIME_FULL}',
    \$\$${MESSAGE}\$\$,
    '${VERSION}',
    'pending',
    NOW()
  )
  ON CONFLICT (eas_update_id) DO UPDATE SET
    status       = 'pending',
    channel      = 'production',
    eas_group_id = EXCLUDED.eas_group_id,
    ota_version  = EXCLUDED.ota_version;
" -q 2>&1 && log_ok "DB: release inserita come PENDING (${UPDATE_ID}) — admin la testerà al cold-start" || {
  log_error "DB insert fallito — buildInfo NON modificato"
  exit 1
}

# ── 6. Aggiorna APPLIED_OTA_NUMBER in buildInfo.ts (SOLO dopo successo EAS + DB) ──
BUILD_INFO="constants/buildInfo.ts"
sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${NEXT_OTA};/" "$BUILD_INFO"
log_ok "APPLIED_OTA_NUMBER aggiornato → ${NEXT_OTA}"

# ── 7. Svuota .ota-message dopo pubblicazione riuscita ───────────────────────
echo "" > "$MSG_FILE"
log_ok ".ota-message svuotato (pronto per il prossimo OTA)"

# ── 8. Push su GitHub ─────────────────────────────────────────────────────────
if [[ -n "${GITHUB_PAT:-}" ]]; then
  log_info "Push su GitHub..."
  git -c "credential.helper=!f() { echo username=x; echo password=${GITHUB_PAT}; }; f" \
    push "https://github.com/Andreamasteri/Bikerlink.git" "HEAD:main" 2>&1 && \
    log_ok "GitHub aggiornato" || \
    log_warn "Push GitHub fallito — esegui manualmente"
else
  log_warn "GITHUB_PAT non impostato — push GitHub saltato"
fi

# ── Riepilogo finale ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_ok "OTA pubblicata come PENDING!"
echo -e "  ${BLUE}Versione OTA${NC}  : ${VERSION}"
echo -e "  ${BLUE}Update ID${NC}     : ${UPDATE_ID}"
echo -e "  ${BLUE}Messaggio${NC}     : ${MESSAGE}"
echo -e "  ${BLUE}Stato DB${NC}      : pending → ricevuta SOLO dagli account admin al prossimo cold start"
echo -e "  ${YELLOW}Prossimo step${NC} : admin testa la OTA, poi click 'Approva' su /admin/ota per distribuirla a tutti"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
