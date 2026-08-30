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
# la ricevono. Gli account admin devono premere "Prova OTA" per applicarla
# manualmente — le OTA pending NON vengono auto-applicate al cold start.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()    { echo -e "${BLUE}[OTA]${NC} $*"; }
log_ok()      { echo -e "${GREEN}[OTA ✓]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[OTA !]${NC} $*"; }
log_error()   { echo -e "${RED}[OTA ✗]${NC} $*" >&2; }

cd /home/runner/workspace

T_TOTAL_START=$(date +%s)
T_EXPORT=0; T_UPLOAD=0; T_PUBLISH=0; T_DB=0; T_GIT=0
DIST_DIR="dist-ota"

# ── 1. Leggi messaggio da .ota-message (con fallback DB per restart Replit) ─
MSG_FILE=".ota-message"

# Crea il file se non esiste (env restart può averlo eliminato)
if [[ ! -f "$MSG_FILE" ]]; then
  touch "$MSG_FILE"
fi

MESSAGE=$(grep -v '^\s*#' "$MSG_FILE" | tr -d '\r' | sed '/^[[:space:]]*$/d' | head -1)

# Fallback DB: se .ota-message è vuoto, controlla app_settings (resiliente ai restart Replit)
if [[ -z "$MESSAGE" ]] && [[ -n "${DATABASE_URL:-}" ]]; then
  DB_MSG=$(psql "$DATABASE_URL" -tAc \
    "SELECT value FROM app_settings WHERE key='pending_ota_message' LIMIT 1" \
    2>/dev/null | tr -d '\r\n' | xargs)
  if [[ -n "$DB_MSG" ]]; then
    MESSAGE="$DB_MSG"
    echo "$MESSAGE" > "$MSG_FILE"
    log_info "Messaggio recuperato dal DB (fallback — .ota-message era vuoto per restart env)"
  fi
fi

if [[ -z "$MESSAGE" ]]; then
  echo "[OTA] Nessun messaggio in .ota-message — pubblicazione saltata."
  echo "[OTA] Per pubblicare: scrivi una riga in .ota-message e riavvia il workflow."
  exit 0
fi

log_info "Messaggio: ${MESSAGE}"

# ── 2. Verifica token ────────────────────────────────────────────────────────
# Supporta sia EAS_TOKEN che EXPO_TOKEN (alias storico nell'environment)
if [[ -z "${EAS_TOKEN:-}" && -n "${EXPO_TOKEN:-}" ]]; then
  EAS_TOKEN="${EXPO_TOKEN}"
fi
if [[ -z "${EAS_TOKEN:-}" ]]; then
  log_error "EAS_TOKEN non impostato nell'ambiente."
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  log_error "DATABASE_URL non impostato nell'ambiente."
  exit 1
fi

log_info "EAS_TOKEN: ${#EAS_TOKEN} chars — OK"

# ── 3. Calcola numero OTA da ultima ota_version in DB ───────────────────────
# Query unificata: un solo round-trip che restituisce "version|number" su una riga.
# Il filtro WHERE esclude righe con ota_version vuota o non canoniche (N.N.N)
# per evitare che un CAST fallisca silenziosamente e resetti NEXT_OTA a 1.
OTA_ROW=$(psql "$DATABASE_URL" -tAc "
  SELECT ota_version || '|' || CAST(SPLIT_PART(ota_version, '.', 3) AS INTEGER)
  FROM ota_releases
  WHERE ota_version ~ '^[0-9]+\.[0-9]+\.[0-9]+\$'
  ORDER BY published_at DESC, id DESC
  LIMIT 1
" 2>/dev/null | tr -d '[:space:]' || echo "")

if [[ -z "$OTA_ROW" ]]; then
  LAST_OTA_VERSION=""
  LAST_OTA_NUMBER=0
else
  LAST_OTA_VERSION="${OTA_ROW%%|*}"
  LAST_OTA_NUMBER="${OTA_ROW##*|}"
fi

# Fallback se la query restituisce un numero non valido
if ! [[ "$LAST_OTA_NUMBER" =~ ^[0-9]+$ ]]; then
  LAST_OTA_NUMBER=0
fi

if [[ "$LAST_OTA_NUMBER" -eq 0 && -z "$LAST_OTA_VERSION" ]]; then
  log_info "DB vuoto (o nessuna riga con formato N.N.N) → NEXT=1"
elif [[ "$LAST_OTA_NUMBER" -eq 0 ]]; then
  log_info "Ultima OTA in DB: '${LAST_OTA_VERSION}' → numero estratto non valido (parse fallito) → NEXT=1"
else
  log_info "Ultima OTA in DB: '${LAST_OTA_VERSION}' → numero estratto: ${LAST_OTA_NUMBER} → NEXT=$(( LAST_OTA_NUMBER + 1 ))"
fi
# ── 3d. Floor guard: NEXT_OTA non può regredire sotto buildInfo.ts + 1 ──────────
# Allineato a publish-ota.sh (fix anti-regressione #4841):
# Se il DB ha un numero inferiore a quello già baked in buildInfo.ts
# (es. DB non sincronizzato, restore parziale), si usa buildInfo come base.
BUILD_INFO_CURRENT=$(node -e "
  try {
    const fs = require('fs');
    const src = fs.readFileSync('constants/buildInfo.ts', 'utf8');
    const m = src.match(/APPLIED_OTA_NUMBER[^=]*=\s*(\d+)/);
    console.log(m ? m[1] : '0');
  } catch { console.log('0'); }
" 2>/dev/null || echo "0")
log_info "APPLIED_OTA_NUMBER corrente in buildInfo.ts: ${BUILD_INFO_CURRENT}"

# ── Leggi high-water mark (terza sorgente: non resettabile automaticamente) ──
HWM_FILE="logs/ota-hwm.txt"
HWM_CURRENT=0
if [[ -f "$HWM_FILE" ]]; then
  HWM_VAL=$(cat "$HWM_FILE" 2>/dev/null | tr -d '[:space:]' || echo "0")
  if [[ "$HWM_VAL" =~ ^[0-9]+$ ]]; then
    HWM_CURRENT="$HWM_VAL"
  fi
fi
log_info "OTA high-water mark da ${HWM_FILE}: ${HWM_CURRENT}"

if [[ "$BUILD_INFO_CURRENT" =~ ^[0-9]+$ ]] && [[ "$LAST_OTA_NUMBER" -lt "$BUILD_INFO_CURRENT" ]]; then
  log_warn "⚠️  DB ha OTA ${LAST_OTA_NUMBER} < buildInfo.ts ${BUILD_INFO_CURRENT} — possibile DB non sincronizzato."
  log_warn "   Uso buildInfo.ts come base per evitare regressione del numero OTA."
  LAST_OTA_NUMBER="$BUILD_INFO_CURRENT"
fi

# Applica high-water mark come terzo floor (protegge se DB e buildInfo sono
# entrambi azzerati contemporaneamente, es. durante un restore d'ambiente).
if [[ "$HWM_CURRENT" -gt "$LAST_OTA_NUMBER" ]]; then
  log_warn "⚠️  HWM ${HWM_CURRENT} > sorgenti correnti (${LAST_OTA_NUMBER}) — uso HWM come base."
  LAST_OTA_NUMBER="$HWM_CURRENT"
fi

NEXT_OTA=$(( LAST_OTA_NUMBER + 1 ))

# Salvaguardia finale: NEXT_OTA non deve mai scendere sotto BUILD_INFO_CURRENT + 1.
MIN_NEXT_OTA=$(( BUILD_INFO_CURRENT + 1 ))
if [[ "$NEXT_OTA" -lt "$MIN_NEXT_OTA" ]]; then
  log_warn "⚠️  NEXT_OTA calcolato (${NEXT_OTA}) < floor minimo (${MIN_NEXT_OTA}) — forzato a ${MIN_NEXT_OTA}."
  NEXT_OTA="$MIN_NEXT_OTA"
fi

BUILD_NUM=$(node -e "const a=require('./app.json'); console.log(a.expo.android.versionCode || 53)" 2>/dev/null || echo "53")
RUNTIME_FULL=$(node -e "const a=require('./app.json'); console.log(a.expo.runtimeVersion||'10.0.0')" 2>/dev/null || echo "10.0.0")
RUNTIME_VER=$(echo "$RUNTIME_FULL" | cut -d. -f1)
# Formato versione OTA canonico: V<build>.<runtime>.<otaNumber> — es. V54.10.36
VERSION="${BUILD_NUM}.${RUNTIME_VER}.${NEXT_OTA}"

log_info "Build: ${BUILD_NUM} | NEXT_OTA: ${NEXT_OTA} | Versione: ${VERSION}"

# ── 3c. Guard pre-EAS: blocca se VERSION esiste già in ota_releases ──────────
EXISTING_VERSION=$(psql "$DATABASE_URL" -tAc "
  SELECT ota_version FROM ota_releases WHERE ota_version = '${VERSION}' LIMIT 1
" 2>/dev/null | tr -d '[:space:]' || true)

if [[ -n "$EXISTING_VERSION" ]]; then
  log_error "DUPLICATO RILEVATO: ota_version '${VERSION}' esiste già in ota_releases — pubblicazione annullata."
  log_error "Verifica il DB (SELECT ota_version, published_at FROM ota_releases ORDER BY id DESC LIMIT 5) e correggi prima di ripubblicare."
  exit 1
fi
log_info "Guard versione OK: '${VERSION}' non presente in DB — procedo."

# Prefisso OTA nel messaggio EAS — consente al server prod di estrarre la versione via sync
EAS_MESSAGE="[OTA:${VERSION}] ${MESSAGE}"
log_info "Messaggio EAS: ${EAS_MESSAGE}"

# ── 3b. Aggiorna APPLIED_OTA_NUMBER PRIMA del bundle (così è incluso nel bundle) ──
BUILD_INFO="constants/buildInfo.ts"

# Un bundle OTA deve usare le stesse versioni JS dei moduli nativi presenti
# nell'APK. Non permettere che npm abbia risolto versioni semver più nuove.
npm run check:native-abi
OLD_OTA_NUMBER=$(grep -oP 'APPLIED_OTA_NUMBER: number \| null = \K[0-9]+' "$BUILD_INFO" 2>/dev/null || echo "null")
sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${NEXT_OTA};/" "$BUILD_INFO"
log_ok "APPLIED_OTA_NUMBER pre-impostato → ${NEXT_OTA} (sarà incluso nel bundle; rollback a ${OLD_OTA_NUMBER} se EAS fallisce)"

# ── 4a. Pre-export: ferma Watchdog + start-expo.sh + libera 8081 ─────────────
# Problema noto: Watchdog lancia start-expo.sh in background; anche dopo che il
# Watchdog viene fermato, start-expo.sh sopravvive come processo orfano. Al suo
# interno esegue `lsof -ti:8081 | xargs kill -9` che colpisce il Metro avviato
# da `expo export` mid-bundle → export muore senza EXIT né rollback.
# Fix: kill Watchdog + start-expo.sh + libera 8081 PRIMA di avviare l'export.
log_info "Pre-export: libero porta 8081 da Watchdog/start-expo.sh..."
# 1. Ferma watchdog.sh (se in esecuzione)
pkill -TERM -f "watchdog.sh" 2>/dev/null || true
sleep 1
pkill -9 -f "watchdog.sh" 2>/dev/null || true
# 2. Ferma start-expo.sh (anche orfano, anche se avviato dal Watchdog)
pkill -TERM -f "start-expo.sh" 2>/dev/null || true
sleep 1
pkill -9 -f "start-expo.sh" 2>/dev/null || true
# 3. Libera porta 8081: SIGTERM poi SIGKILL su qualsiasi processo Metro/Expo dev
_PIDS_8081=$(lsof -ti:8081 2>/dev/null || true)
if [[ -n "$_PIDS_8081" ]]; then
  log_info "Processo(i) su 8081: ${_PIDS_8081} — SIGTERM..."
  echo "$_PIDS_8081" | xargs kill -TERM 2>/dev/null || true
  sleep 2
  _PIDS_8081=$(lsof -ti:8081 2>/dev/null || true)
  if [[ -n "$_PIDS_8081" ]]; then
    log_info "Ancora su 8081: ${_PIDS_8081} — SIGKILL..."
    echo "$_PIDS_8081" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi
log_ok "Pre-export: porta 8081 libera — Metro esclusivo per l'export"

# ── 4b. Metro export (atomico: se fallisce, ripristina buildInfo) ────────────
# Auto-detection cache corrotta: se expo export fallisce con pattern noti di
# corruzione cache (ENOENT, Cannot resolve module, ecc.), pulisce automaticamente
# /tmp/metro-file-map-* e .metro-cache/ e riprova una volta sola. Zero flag manuali.
log_info "Fase 1/3 — Metro export (bundle Android)..."

rm -rf "$DIST_DIR"
_EXPORT_LOG=$(mktemp /tmp/expo-export-XXXXXX.log)

_run_expo_export() {
  set +e
  EXPO_TOKEN="${EAS_TOKEN}" npx expo export \
    --platform android \
    --source-maps \
    --output-dir "$DIST_DIR" \
    2>&1 | tee "$_EXPORT_LOG"
  _EXPO_RC=${PIPESTATUS[0]}
  set -e
  return $_EXPO_RC
}

_T0=$(date +%s)
if ! _run_expo_export; then
  # Controlla se il fallimento è riconducibile a cache Metro corrotta
  # Solo segnali specifici di corruzione cache/file-map Metro. Pattern generici
  # (ENOTFOUND=rete, Cannot find module=dipendenza mancante, bundling failed=sintassi)
  # esclusi: causerebbero retry inutili su fallimenti non legati alla cache.
  _CACHE_ERRORS="ENOENT|Cannot resolve module|Metro has encountered an error|file-map|metro-file-map|haste"
  if grep -qiE "$_CACHE_ERRORS" "$_EXPORT_LOG" 2>/dev/null; then
    log_warn "Cache Metro corrotta rilevata — pulizia automatica e retry (1 tentativo)..."
    rm -rf /tmp/metro-file-map-* 2>/dev/null || true
    rm -rf .metro-cache/ 2>/dev/null || true
    rm -rf "$DIST_DIR"
    if ! _run_expo_export; then
      rm -f "$_EXPORT_LOG"
      sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${OLD_OTA_NUMBER};/" "$BUILD_INFO"
      log_error "expo export fallito anche dopo pulizia cache — buildInfo ripristinato a ${OLD_OTA_NUMBER}"
      exit 1
    fi
    log_ok "Export riuscito dopo pulizia automatica cache"
  else
    rm -f "$_EXPORT_LOG"
    sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${OLD_OTA_NUMBER};/" "$BUILD_INFO"
    log_error "expo export fallito — buildInfo ripristinato a ${OLD_OTA_NUMBER}, git NON aggiornato"
    exit 1
  fi
fi
rm -f "$_EXPORT_LOG"
T_EXPORT=$(( $(date +%s) - _T0 ))
log_ok "⏱ Metro export completato in ${T_EXPORT}s"

# ── 4b-bis. Source map: upload su Object Storage + rimozione dal bundle ───────
# Con --source-maps, expo export produce file *.map (js.map o hbc.map) nella
# directory di output. Li carichiamo su Object Storage (chiave
# source-maps/ota-{N}.map) e li rimuoviamo da dist-ota PRIMA dell'upload EAS,
# così non raggiungono i client. Il server li scarica on-demand per simbolicare
# gli stack trace nei report di errore (POST /api/admin/client-error).
_MAP_FILE=$(find "$DIST_DIR" -name "*.map" 2>/dev/null | sort | head -1)
if [[ -n "$_MAP_FILE" ]]; then
  _MAP_KEY="source-maps/ota-${NEXT_OTA}.map"
  log_info "Source map: $(basename "$_MAP_FILE") → ${_MAP_KEY}"
  _T0_MAP=$(date +%s)
  set +e
  node -e "
    const { Client } = require('@replit/object-storage');
    const { readFileSync } = require('fs');
    try {
      const client = new Client();
      const buf = readFileSync('${_MAP_FILE}');
      client.uploadFromBytes('${_MAP_KEY}', buf, { contentType: 'application/json' })
        .then(r => {
          if (!r.ok) {
            process.stderr.write('[map-upload] err: ' + (r.error ? r.error.message : 'unknown') + '\n');
            process.exit(1);
          }
          process.stdout.write('[map-upload] ok\n');
        })
        .catch(e => { process.stderr.write('[map-upload] ' + e.message + '\n'); process.exit(1); });
    } catch(e) { process.stderr.write('[map-upload] ' + e.message + '\n'); process.exit(1); }
  " 2>&1
  _MAP_RC=$?
  set -e
  _T_MAP=$(( $(date +%s) - _T0_MAP ))
  if [[ "$_MAP_RC" -eq 0 ]]; then
    log_ok "⏱ Source map caricata: ${_MAP_KEY} (${_T_MAP}s)"
  else
    log_warn "Upload source map fallito in ${_T_MAP}s — il publish continua senza simbolicazione (non bloccante)"
  fi
  # Rimuovi le .map dal dist-ota: non devono essere distribuite ai client via EAS
  find "$DIST_DIR" -name "*.map" -delete 2>/dev/null || true
  log_info "Source map rimosse da ${DIST_DIR} (non distribuite ai client)"
else
  log_warn "Nessuna source map trovata in ${DIST_DIR} (expo export --source-maps non ha prodotto output?)"
fi

# ── 4b. EAS upload bundle su CDN — usa il bundle pre-compilato ───────────────
# T_UPLOAD misura il trasferimento CDN (dominante); T_PUBLISH misura la creazione
# del record update su EAS (API call finale — non separabile dal CLI, valore 0s).
log_info "Fase 2/3 — EAS upload bundle su CDN (attendi 1-2 minuti)..."

_T0=$(date +%s)
EAS_OUTPUT=$(EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="${EAS_TOKEN}" \
  bash scripts/eas.sh update \
    --channel production \
    --environment production \
    --message "${EAS_MESSAGE}" \
    --input-dir "$DIST_DIR" \
    --skip-bundler \
    --non-interactive 2>&1) || {
  sed -i "s/^export const APPLIED_OTA_NUMBER:.*$/export const APPLIED_OTA_NUMBER: number | null = ${OLD_OTA_NUMBER};/" "$BUILD_INFO"
  log_error "eas update fallito — buildInfo ripristinato a ${OLD_OTA_NUMBER}, git NON aggiornato:"
  echo "$EAS_OUTPUT"
  exit 1
}
T_UPLOAD=$(( $(date +%s) - _T0 ))
# EAS CLI non separa upload CDN da creazione record: T_PUBLISH = 0s (incluso in T_UPLOAD)
T_PUBLISH=0
log_ok "⏱ EAS upload CDN completato in ${T_UPLOAD}s (record EAS: ${T_PUBLISH}s, incluso)"

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
_T0=$(date +%s)
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
" -q 2>&1 && {
  T_DB=$(( $(date +%s) - _T0 ))
  log_ok "DB: release inserita come PENDING (${UPDATE_ID}) — admin la testerà premendo 'Prova OTA'"
  log_ok "⏱ DB insert completato in ${T_DB}s"
} || {
  log_error "DB insert fallito — buildInfo NON modificato"
  exit 1
}

# ── Aggiorna high-water mark atomicamente dopo pubblicazione riuscita ────────
mkdir -p logs
echo "${NEXT_OTA}" > "${HWM_FILE}.tmp" && mv "${HWM_FILE}.tmp" "$HWM_FILE"
log_ok "OTA HWM aggiornato a ${NEXT_OTA} in ${HWM_FILE}"

# ── 6. Svuota .ota-message e chiave DB dopo pubblicazione riuscita ──────────
echo "" > "$MSG_FILE"
psql "$DATABASE_URL" -c \
  "DELETE FROM app_settings WHERE key='pending_ota_message'" \
  2>/dev/null || true
log_ok ".ota-message e DB svuotati (pronto per il prossimo OTA)"

# ── 8. Push su GitHub ─────────────────────────────────────────────────────────
GH_TOKEN="${GITHUB_TOKEN:-${GITHUB_PAT:-}}"
if [[ -n "$GH_TOKEN" ]]; then
  log_info "Push su GitHub..."
  _T0=$(date +%s)
  git push "https://${GH_TOKEN}:x-oauth-basic@github.com/Andreamasteri/Bikerlink.git" \
    "HEAD:main" 2>&1 && {
    T_GIT=$(( $(date +%s) - _T0 ))
    log_ok "GitHub aggiornato"
    log_ok "⏱ Git push completato in ${T_GIT}s"
  } || {
    T_GIT=$(( $(date +%s) - _T0 ))
    log_warn "Push GitHub fallito — esegui manualmente (${T_GIT}s)"
  }
else
  log_warn "GITHUB_TOKEN non impostato — push GitHub saltato"
fi

# ── Riepilogo timing + scrittura ota-timing.log ───────────────────────────────
T_TOTAL=$(( $(date +%s) - T_TOTAL_START ))
log_ok "⏱ Timing riepilogo: export=${T_EXPORT}s | upload=${T_UPLOAD}s | publish=${T_PUBLISH}s | db=${T_DB}s | git=${T_GIT}s | TOTALE=${T_TOTAL}s"

mkdir -p logs
TIMING_LOG="logs/ota-timing.log"
TIMING_LINE="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] OTA v${VERSION} | export: ${T_EXPORT}s | upload: ${T_UPLOAD}s | publish: ${T_PUBLISH}s | db: ${T_DB}s | git: ${T_GIT}s | TOTALE: ${T_TOTAL}s"
echo "$TIMING_LINE" >> "$TIMING_LOG"
log_ok "Timing appeso a ${TIMING_LOG}"

# ── Riepilogo finale ──────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_ok "OTA pubblicata come PENDING!"
echo -e "  ${BLUE}Versione OTA${NC}  : ${VERSION}"
echo -e "  ${BLUE}Update ID${NC}     : ${UPDATE_ID}"
echo -e "  ${BLUE}Messaggio${NC}     : ${MESSAGE}"
echo -e "  ${BLUE}Stato DB${NC}      : pending → NON auto-applicata; admin usa 'Prova OTA' per testarla manualmente"
echo -e "  ${YELLOW}Prossimo step${NC} : admin testa la OTA, poi click 'Approva' su /admin/ota per distribuirla a tutti"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
