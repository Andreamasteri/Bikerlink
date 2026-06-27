#!/usr/bin/env bash
# scripts/publish-ota-emcy.sh — BikerLink OTA Canale Emergenza (EMCY) — Task #5087
#
# Pipeline OTA PARALLELA che builda da un COMMIT SPECIFICO (base di recupero,
# default OTA-131 = 408f82d1, runtimeVersion 10.0.0) invece che da HEAD, e
# pubblica come `EMCY-N` sul canale EAS `emergency`. Serve quando la production
# corrente è rotta e bisogna riportare TUTTI i device a una base sana senza
# dover ricostruire un APK.
#
# Differenze chiave rispetto a publish-ota-full.sh (production da HEAD):
#   • Builda da un git worktree DETACHED sul commit base (HEAD/branch NON toccati).
#   • Canale EAS = emergency (non production).
#   • Versione = EMCY-N (numerazione propria, separata dalla N.N.N production).
#   • Inserisce la riga ota_releases con channel='emergency', status='pending'.
#   • NON tocca constants/buildInfo.ts, NON aggiorna la HWM production, NON pusha git.
#
# 4 GUARD ANTI-FALLIMENTO (richiesti dalla spec):
#   G1. runtimeVersion guard — ABORT se il runtime del commit base ≠ atteso (10.0.0).
#   G2. npm ci dal lockfile del commit base + fix proxy Replit sul package-lock.
#   G3. admin-first pending — la release entra `pending`, mai auto-distribuita.
#   G4. smoke test pre-upload — il bundle Hermes/JS deve esistere ed essere > 0 byte.
#
# Uso:
#   bash scripts/publish-ota-emcy.sh --message "testo" [opzioni]
#
# Opzioni:
#   --message "<testo>"   Messaggio della release (o file .emcy-message / env EMCY_MESSAGE).
#   --base <commit>       Commit base da cui buildare   (default: env EMCY_BASE o 408f82d1).
#   --runtime <X.Y.Z>     runtimeVersion atteso          (default: env EMCY_RUNTIME o 10.0.0).
#   --name EMCY-N         Forza il nome release          (default: auto = max(EMCY-N)+1).
#   --channel <ch>        Canale EAS                     (default: emergency).
#   --patch <file>        Patch opzionale da applicare sul worktree prima del bundle.
#   --dry-run             Esegue tutto TRANNE eas update / DB insert / cleanup distruttivo.
#
# NOTA OPERATORE: eseguire dall'ambiente MAIN (non da un task-agent isolato).
# Richiede EAS_TOKEN e DATABASE_URL nell'ambiente.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()  { echo -e "${BLUE}[EMCY]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[EMCY ✓]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[EMCY !]${NC} $*"; }
log_error() { echo -e "${RED}[EMCY ✗]${NC} $*" >&2; }

cd /home/runner/workspace

# ── 0. Parsing argomenti ─────────────────────────────────────────────────────
MESSAGE=""
BASE_COMMIT="${EMCY_BASE:-408f82d1}"
EXPECTED_RUNTIME="${EMCY_RUNTIME:-10.0.0}"
FORCE_NAME=""
CHANNEL="emergency"
PATCH_FILE=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --message)  MESSAGE="${2:-}"; shift 2 ;;
    --base)     BASE_COMMIT="${2:-}"; shift 2 ;;
    --runtime)  EXPECTED_RUNTIME="${2:-}"; shift 2 ;;
    --name)     FORCE_NAME="${2:-}"; shift 2 ;;
    --channel)  CHANNEL="${2:-}"; shift 2 ;;
    --patch)    PATCH_FILE="${2:-}"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    *) log_error "Argomento sconosciuto: $1"; exit 2 ;;
  esac
done

# Messaggio: arg > file .emcy-message > env EMCY_MESSAGE
if [[ -z "$MESSAGE" ]] && [[ -f ".emcy-message" ]]; then
  MESSAGE=$(grep -v '^\s*#' ".emcy-message" | tr -d '\r' | sed '/^[[:space:]]*$/d' | head -1 || true)
fi
if [[ -z "$MESSAGE" ]]; then
  MESSAGE="${EMCY_MESSAGE:-}"
fi
if [[ -z "$MESSAGE" ]]; then
  log_error "Nessun messaggio. Usa --message \"...\" oppure scrivi una riga in .emcy-message."
  exit 1
fi

log_info "Base commit     : ${BASE_COMMIT}"
log_info "Runtime atteso  : ${EXPECTED_RUNTIME}"
log_info "Canale EAS      : ${CHANNEL}"
log_info "Messaggio       : ${MESSAGE}"
[[ "$DRY_RUN" -eq 1 ]] && log_warn "MODALITÀ DRY-RUN: nessuna pubblicazione EAS, nessun DB insert."

# ── 1. Verifica prerequisiti ambiente ────────────────────────────────────────
if [[ "$DRY_RUN" -eq 0 ]]; then
  if [[ -z "${EAS_TOKEN:-}" ]]; then log_error "EAS_TOKEN non impostato."; exit 1; fi
  if [[ -z "${DATABASE_URL:-}" ]]; then log_error "DATABASE_URL non impostato."; exit 1; fi
  log_info "EAS_TOKEN: ${#EAS_TOKEN} chars — OK"
fi

# ── 2. Calcolo numero EMCY-N (numerazione separata dalla production) ──────────
if [[ -n "$FORCE_NAME" ]]; then
  VERSION="$FORCE_NAME"
  log_info "Nome release forzato via --name: ${VERSION}"
elif [[ -n "${DATABASE_URL:-}" ]]; then
  LAST_EMCY=$(psql "$DATABASE_URL" -tAc "
    SELECT CAST(SPLIT_PART(ota_version, '-', 2) AS INTEGER)
    FROM ota_releases
    WHERE ota_version ~ '^EMCY-[0-9]+\$'
    ORDER BY published_at DESC, id DESC
    LIMIT 1
  " 2>/dev/null | tr -d '[:space:]' || echo "")
  if ! [[ "$LAST_EMCY" =~ ^[0-9]+$ ]]; then LAST_EMCY=0; fi
  VERSION="EMCY-$(( LAST_EMCY + 1 ))"
  log_info "Ultima EMCY in DB: ${LAST_EMCY} → nuova: ${VERSION}"
else
  VERSION="EMCY-1"
  log_warn "DATABASE_URL assente (dry-run) — uso ${VERSION} provvisorio."
fi

# Guard duplicato (salta in dry-run senza DB)
if [[ "$DRY_RUN" -eq 0 ]]; then
  EXISTING=$(psql "$DATABASE_URL" -tAc "SELECT ota_version FROM ota_releases WHERE ota_version='${VERSION}' LIMIT 1" 2>/dev/null | tr -d '[:space:]' || true)
  if [[ -n "$EXISTING" ]]; then
    log_error "DUPLICATO: ota_version '${VERSION}' esiste già. Usa --name per forzare un altro numero."
    exit 1
  fi
fi

# ── 3. Crea worktree DETACHED sul commit base (non tocca HEAD/branch) ────────
WORKTREE_DIR="/tmp/emcy-worktree-$$"
DIST_DIR="${WORKTREE_DIR}/dist-ota-emcy"

cleanup() {
  if [[ -d "$WORKTREE_DIR" ]]; then
    log_info "Cleanup worktree ${WORKTREE_DIR}..."
    git worktree remove --force "$WORKTREE_DIR" 2>/dev/null \
      || rm -rf "$WORKTREE_DIR" 2>/dev/null || true
    git worktree prune 2>/dev/null || true
  fi
}
trap cleanup EXIT

log_info "Creo worktree detached su ${BASE_COMMIT}..."
if ! git worktree add --detach "$WORKTREE_DIR" "$BASE_COMMIT" 2>&1; then
  log_error "git worktree add fallito — commit base '${BASE_COMMIT}' non valido?"
  exit 1
fi
log_ok "Worktree pronto: ${WORKTREE_DIR}"

# Patch opzionale sopra la base
if [[ -n "$PATCH_FILE" ]]; then
  if [[ ! -f "$PATCH_FILE" ]]; then log_error "Patch non trovata: ${PATCH_FILE}"; exit 1; fi
  log_info "Applico patch ${PATCH_FILE} sul worktree..."
  if ! git -C "$WORKTREE_DIR" apply "$(realpath "$PATCH_FILE")" 2>&1; then
    log_error "git apply fallito — la patch non si applica sul commit base."
    exit 1
  fi
  log_ok "Patch applicata."
fi

# ── GUARD G1: runtimeVersion deve combaciare con l'atteso ────────────────────
WT_RUNTIME=$(node -e "const a=require('${WORKTREE_DIR}/app.json'); console.log(a.expo.runtimeVersion||'')" 2>/dev/null || echo "")
log_info "runtimeVersion del commit base: '${WT_RUNTIME}'"
if [[ "$WT_RUNTIME" != "$EXPECTED_RUNTIME" ]]; then
  log_error "GUARD G1 FALLITA: runtime base '${WT_RUNTIME}' ≠ atteso '${EXPECTED_RUNTIME}'."
  log_error "I device sul runtime ${EXPECTED_RUNTIME} NON riceverebbero questa OTA. Abort."
  exit 1
fi
log_ok "GUARD G1 OK: runtime ${WT_RUNTIME} combacia."

RUNTIME_FULL="$WT_RUNTIME"

# ── GUARD G2: fix proxy Replit sul lockfile + npm ci dal lockfile della base ─
if [[ ! -f "${WORKTREE_DIR}/package-lock.json" ]]; then
  log_error "GUARD G2 FALLITA: package-lock.json assente nel commit base — npm ci impossibile."
  exit 1
fi
log_info "GUARD G2: fix URL proxy Replit nel package-lock.json del worktree..."
sed -i 's|http://package-firewall\.replit\.local/npm/|https://registry.npmjs.org/|g' "${WORKTREE_DIR}/package-lock.json"
log_info "GUARD G2: npm ci nel worktree (deps esatte del commit base)..."
if ! ( cd "$WORKTREE_DIR" && npm ci --no-audit --no-fund 2>&1 ); then
  log_error "GUARD G2 FALLITA: npm ci nel worktree fallito."
  exit 1
fi
log_ok "GUARD G2 OK: dipendenze del commit base installate."

# ── 4. Metro export nel worktree ─────────────────────────────────────────────
# Libera la porta 8081 (watchdog/start-expo possono tenerla occupata).
log_info "Pre-export: libero porta 8081..."
pkill -TERM -f "watchdog.sh" 2>/dev/null || true
pkill -TERM -f "start-expo.sh" 2>/dev/null || true
sleep 1
pkill -9 -f "watchdog.sh" 2>/dev/null || true
pkill -9 -f "start-expo.sh" 2>/dev/null || true
_PIDS=$(lsof -ti:8081 2>/dev/null || true)
if [[ -n "$_PIDS" ]]; then echo "$_PIDS" | xargs kill -9 2>/dev/null || true; sleep 1; fi

log_info "Fase 1/3 — Metro export (bundle Android) dal worktree..."
rm -rf "$DIST_DIR"
if ! ( cd "$WORKTREE_DIR" && EXPO_TOKEN="${EAS_TOKEN:-}" npx expo export \
        --platform android \
        --output-dir "dist-ota-emcy" 2>&1 ); then
  log_error "expo export fallito nel worktree."
  exit 1
fi
log_ok "Export completato."

# ── GUARD G4: smoke test — il bundle deve esistere ed essere > 0 byte ────────
BUNDLE_FILE=$(find "$DIST_DIR" \( -name "*.hbc" -o -path "*android*.js" \) -type f 2>/dev/null | sort | head -1)
if [[ -z "$BUNDLE_FILE" ]]; then
  BUNDLE_FILE=$(find "$DIST_DIR" -name "*.js" -type f 2>/dev/null | sort | head -1)
fi
if [[ -z "$BUNDLE_FILE" ]] || [[ ! -s "$BUNDLE_FILE" ]]; then
  log_error "GUARD G4 FALLITA: nessun bundle Android > 0 byte in ${DIST_DIR}."
  exit 1
fi
BUNDLE_SIZE=$(stat -c%s "$BUNDLE_FILE" 2>/dev/null || echo 0)
if [[ "$BUNDLE_SIZE" -lt 1000 ]]; then
  log_error "GUARD G4 FALLITA: bundle sospettosamente piccolo (${BUNDLE_SIZE} byte): ${BUNDLE_FILE}."
  exit 1
fi
log_ok "GUARD G4 OK: bundle $(basename "$BUNDLE_FILE") = ${BUNDLE_SIZE} byte."

# Rimuovi eventuali source map dal dist (non distribuire ai client)
find "$DIST_DIR" -name "*.map" -delete 2>/dev/null || true

# Messaggio EAS con prefisso versione (coerente con la pipeline production)
EAS_MESSAGE="[OTA:${VERSION}] ${MESSAGE}"

# ── DRY-RUN: fermati qui ─────────────────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  log_ok "DRY-RUN completato — nessuna pubblicazione effettuata."
  echo -e "  ${BLUE}Avrebbe pubblicato${NC} : ${VERSION} sul canale '${CHANNEL}'"
  echo -e "  ${BLUE}Runtime${NC}            : ${RUNTIME_FULL}"
  echo -e "  ${BLUE}Messaggio EAS${NC}      : ${EAS_MESSAGE}"
  echo -e "  ${BLUE}Bundle${NC}             : ${BUNDLE_FILE} (${BUNDLE_SIZE} byte)"
  exit 0
fi

# ── 5. EAS update sul canale emergency ───────────────────────────────────────
log_info "Fase 2/3 — EAS update --channel ${CHANNEL} (attendi 1-2 minuti)..."
EAS_OUTPUT=$( cd "$WORKTREE_DIR" && EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" \
  bash scripts/eas.sh update \
    --channel "${CHANNEL}" \
    --message "${EAS_MESSAGE}" \
    --input-dir "dist-ota-emcy" \
    --skip-bundler \
    --non-interactive 2>&1 ) || {
  log_error "eas update fallito:"
  echo "$EAS_OUTPUT"
  exit 1
}
echo "$EAS_OUTPUT"

UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE 'Android update ID\s+[a-f0-9-]{36}' | grep -oE '[a-f0-9-]{36}' || true)
GROUP_ID=$(echo  "$EAS_OUTPUT" | grep -oE 'Update group ID\s+[a-f0-9-]{36}' | grep -oE '[a-f0-9-]{36}' || true)
if [[ -z "$UPDATE_ID" ]]; then
  UPDATE_ID=$(echo "$EAS_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -2 | head -1 || true)
fi
if [[ -z "$GROUP_ID" ]]; then
  GROUP_ID=$(echo  "$EAS_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | tail -1 || true)
fi
if [[ -z "$UPDATE_ID" || -z "$GROUP_ID" ]]; then
  log_error "Impossibile estrarre UPDATE_ID/GROUP_ID dall'output EAS — DB NON aggiornato."
  exit 1
fi
log_ok "Update ID: ${UPDATE_ID} | Group ID: ${GROUP_ID}"

# ── 6. Insert DB come PENDING sul canale emergency (GUARD G3: admin-first) ────
log_info "Fase 3/3 — insert ota_releases (channel='${CHANNEL}', status='pending')..."
psql "$DATABASE_URL" -c "
  INSERT INTO ota_releases (
    id, eas_update_id, eas_group_id, channel, runtime_version,
    message, ota_version, status, published_at
  ) VALUES (
    gen_random_uuid(), '${UPDATE_ID}', '${GROUP_ID}', '${CHANNEL}', '${RUNTIME_FULL}',
    \$\$${MESSAGE}\$\$, '${VERSION}', 'pending', NOW()
  )
  ON CONFLICT (eas_update_id) DO UPDATE SET
    status       = 'pending',
    channel      = '${CHANNEL}',
    eas_group_id = EXCLUDED.eas_group_id,
    ota_version  = EXCLUDED.ota_version;
" -q 2>&1 || { log_error "DB insert fallito."; exit 1; }
log_ok "DB: ${VERSION} inserita PENDING sul canale '${CHANNEL}'."

# Svuota .emcy-message dopo pubblicazione riuscita
[[ -f ".emcy-message" ]] && echo "" > ".emcy-message"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_ok "EMCY pubblicata come PENDING!"
echo -e "  ${BLUE}Versione${NC}      : ${VERSION}"
echo -e "  ${BLUE}Canale${NC}        : ${CHANNEL}"
echo -e "  ${BLUE}Runtime${NC}       : ${RUNTIME_FULL}"
echo -e "  ${BLUE}Update ID${NC}     : ${UPDATE_ID}"
echo -e "  ${YELLOW}Prossimi step${NC} : 1) /admin/ota → sezione EMCY → Approva la release"
echo -e "                  2) attiva il redirect EMCY per distribuirla a TUTTI i device"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
