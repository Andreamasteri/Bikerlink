#!/usr/bin/env bash
# scripts/publish-ota-full.sh — BikerLink OTA publish completo
#
# COME USARLO:
#   1. Scrivi il messaggio in .ota-message (nella root del progetto)
#   2. Riavvia il workflow "OTA Publish" dal pannello Replit
#   3. Monitora i log — tutto automatico
#
# Cosa fa questo script:
#   - Legge il messaggio da .ota-message
#   - Pubblica l'OTA su EAS (canale staging, bundle Metro)
#   - Approva automaticamente la release nel DB (status='approved')
#   - Aggiorna APPLIED_OTA_NUMBER in constants/buildInfo.ts
#   - Fa il push su GitHub

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

# Ignora righe vuote e commenti (# ...)
MESSAGE=$(grep -v '^\s*#' "$MSG_FILE" | tr -d '\r' | sed '/^[[:space:]]*$/d' | head -1)

# Uscita silenziosa se nessun messaggio reale — protegge dall'auto-start di Replit
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

# ── 3. Calcola NEXT_OTA dal DB ───────────────────────────────────────────────
CURRENT_MAX=$(psql "$DATABASE_URL" -tAc "
  SELECT COALESCE(MAX(
    CASE WHEN eas_update_id ~ '^[0-9a-f-]{36}$' THEN 0
         ELSE 0
    END
  ), 0)
  FROM ota_releases
  WHERE status IN ('approved','pending')
" 2>/dev/null || echo "0")

# Conta le release approvate per derivare il prossimo numero OTA
APPROVED_COUNT=$(psql "$DATABASE_URL" -tAc "
  SELECT COUNT(*) FROM ota_releases WHERE status = 'approved'
" 2>/dev/null || echo "0")

NEXT_OTA=$(( APPROVED_COUNT + 1 ))
BUILD_NUM=$(node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode || 53)" 2>/dev/null || echo "53")
RUNTIME_VER=$(node -e "const a=require('./app.json'); const rv=a.expo.runtimeVersion||'10.0.0'; console.log(rv.split('.')[0])" 2>/dev/null || echo "10")
VERSION="${BUILD_NUM}.${NEXT_OTA}.${RUNTIME_VER}"

log_info "Build: ${BUILD_NUM} | NEXT_OTA: ${NEXT_OTA} | Versione: ${VERSION}"

# ── 4. Aggiorna APPLIED_OTA_NUMBER in buildInfo.ts ──────────────────────────
BUILD_INFO="constants/buildInfo.ts"
sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${NEXT_OTA};/" "$BUILD_INFO"
log_ok "APPLIED_OTA_NUMBER aggiornato → ${NEXT_OTA}"

# ── 5. Pubblica su EAS production ────────────────────────────────────────────
log_info "Pubblicazione bundle su EAS production (Metro in corso — attendi 5-8 minuti)..."

EAS_OUTPUT=$(EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" \
  eas update \
    --channel production \
    --message "${MESSAGE}" \
    --non-interactive 2>&1) || {
  log_error "eas update fallito:"
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

# ── 6. Approva nel DB (status='approved') ────────────────────────────────────
if [[ -n "$UPDATE_ID" && -n "$GROUP_ID" ]]; then
  RUNTIME_FULL=$(node -e "const a=require('./app.json'); console.log(a.expo.runtimeVersion||'10.0.0')" 2>/dev/null || echo "10.0.0")

  psql "$DATABASE_URL" -c "
    INSERT INTO ota_releases (
      id, eas_update_id, eas_group_id, channel, runtime_version,
      message, ota_version, status, published_at, approved_at
    ) VALUES (
      gen_random_uuid(),
      '${UPDATE_ID}',
      '${GROUP_ID}',
      'production',
      '${RUNTIME_FULL}',
      \$\$${MESSAGE}\$\$,
      '${VERSION}',
      'approved',
      NOW(),
      NOW()
    )
    ON CONFLICT (eas_update_id) DO UPDATE SET
      status       = 'approved',
      approved_at  = NOW(),
      channel      = 'production',
      eas_group_id = EXCLUDED.eas_group_id,
      ota_version  = EXCLUDED.ota_version;
  " -q 2>&1 && log_ok "DB: release approvata (${UPDATE_ID})" || log_warn "DB insert fallito — approva manualmente dal pannello admin"
else
  log_warn "IDs non estratti — approva manualmente dal pannello admin /admin/ota"
fi

# ── 7. Approva in produzione tramite webhook ────────────────────────────────
if [[ -n "${OTA_PUBLISH_SECRET:-}" ]]; then
  PROD_URL="${BIKERLINK_BACKEND_URL:-https://biker-link.replit.app}"
  log_info "Chiamata webhook production ${PROD_URL}..."

  WEBHOOK_RESP=$(curl -s -X POST "${PROD_URL}/api/ota/force-approve" \
    -H "Authorization: Bearer ${OTA_PUBLISH_SECRET}" \
    -H "Content-Type: application/json" \
    -d "{\"easGroupId\":\"${GROUP_ID:-}\"}" \
    --max-time 30 2>&1) || WEBHOOK_RESP="timeout/connessione fallita"

  if echo "$WEBHOOK_RESP" | grep -q '"success":true'; then
    log_ok "Production: OTA approvata e distribuita"
  else
    log_warn "Production webhook: ${WEBHOOK_RESP:-no response}"
    log_warn "Approva manualmente da https://biker-link.replit.app (admin → OTA)"
  fi
else
  log_warn "OTA_PUBLISH_SECRET non impostato — production non aggiornata"
fi

# ── 8. Svuota .ota-message dopo pubblicazione riuscita ───────────────────────
echo "" > "$MSG_FILE"
log_ok ".ota-message svuotato (pronto per il prossimo OTA)"

# ── 9. Push su GitHub ─────────────────────────────────────────────────────────
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
log_ok "OTA pubblicata con successo!"
echo -e "  ${BLUE}Versione OTA${NC}  : ${VERSION}"
echo -e "  ${BLUE}Update ID${NC}     : ${UPDATE_ID:-'vedi sopra'}"
echo -e "  ${BLUE}Messaggio${NC}     : ${MESSAGE}"
echo -e "  ${BLUE}Stato DB${NC}      : approved → distribuito a tutti gli utenti Android"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
