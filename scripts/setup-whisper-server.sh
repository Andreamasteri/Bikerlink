#!/usr/bin/env bash
# =============================================================================
# BikerLink — Setup Whisper (whisper.cpp) sul server di casa (ThinkCentre 910q)
#
# Cosa fa questo script (idempotente — puoi rieseguirlo senza danni):
#   1. Installa le dipendenze di sistema (git, cmake, make, g++, ffmpeg).
#   2. Clona e compila whisper.cpp con il server HTTP abilitato.
#   3. Scarica il modello ggml-medium (~1.5 GB, ottimale per i5-7500T su CPU).
#   4. Crea l'utente di servizio 'whisper', lo script wrapper e il servizio
#      systemd che ascolta su 127.0.0.1:8089.
#   5. Aggiunge a nginx una `location /whisper/` con auth token X-Whisper-Token
#      + reverse proxy a 8089 (stesso pattern di X-GH-Token / X-Ollama-Token).
#   6. Esegue un test audio di verifica con espeak-ng o festival.
#   7. Stampa i 2 secret da impostare su Replit (WHISPER_URL / WHISPER_TOKEN).
#
# Prerequisiti sul server:
#   - Ubuntu 26.04 LTS, nginx già installato e configurato con Tailscale Funnel.
#   - Permessi sudo (lo script richiede root per systemd e nginx).
#   - ~3 GB liberi su disco (build whisper.cpp + modello medium ~1.5 GB).
#
# Utilizzo:
#   bash setup-whisper-server.sh
#
# Override opzionali (variabili d'ambiente):
#   WHISPER_TOKEN=<token>  Riusa un token esistente invece di generarne uno nuovo.
#   PUBLIC_HOST=<host>     Forza l'hostname pubblico (es. bikerlink.tail5056aa.ts.net)
#                          se l'auto-detect via Tailscale non funziona.
#   NGINX_CONF=<path>      Forza il file nginx da modificare
#                          (default: auto-detect, fallback /etc/nginx/sites-enabled/default).
#   WHISPER_MODEL=<model>  Modello da scaricare (default: medium).
#                          Alternative: small (più veloce, meno preciso),
#                                       large-v3 (più preciso, molto lento su CPU).
#   WHISPER_LANG=<lang>    Lingua di default (default: it). Es: en, fr, de, es.
#   SKIP_BUILD=1           Salta la compilazione (solo se whisper.cpp è già compilato).
#   SKIP_MODEL=1           Salta il download del modello (solo se già presente).
# =============================================================================

set -euo pipefail

# ── Configurazione (override via env) ────────────────────────────────────────
WHISPER_INSTALL_DIR="/opt/whisper.cpp"
WHISPER_PORT="8089"
WHISPER_HOST_BIND="127.0.0.1:${WHISPER_PORT}"
WHISPER_MODEL="${WHISPER_MODEL:-medium}"
WHISPER_LANG="${WHISPER_LANG:-it}"
WHISPER_SERVICE_USER="whisper"
NGINX_SNIPPET="/etc/nginx/snippets/bikerlink-whisper.conf"

# ── Logging colorato ─────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[WHISPER]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[ OK  ]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN ]\033[0m $*"; }
err()  { echo -e "\033[1;31m[FAIL ]\033[0m $*" >&2; }
die()  { err "$*"; exit 1; }

# ── Privilegi: usa sudo se non root ──────────────────────────────────────────
if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Servono privilegi root (systemd/nginx) ma 'sudo' non è installato. Esegui come root."
  fi
fi

echo "============================================================"
echo "BikerLink — Setup Whisper/whisper.cpp (server di casa)"
echo "$(date)"
echo "============================================================"
echo ""

# =============================================================================
# STEP 1 — Prerequisiti e dipendenze di sistema
# =============================================================================
log "STEP 1/6 — Verifica e installazione dipendenze di sistema..."

MISSING_PKGS=()
for cmd_pkg in "git:git" "cmake:cmake" "make:make" "g++:g++" "ffmpeg:ffmpeg" "curl:curl" "openssl:openssl"; do
  cmd="${cmd_pkg%%:*}"
  pkg="${cmd_pkg##*:}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING_PKGS+=("$pkg")
  fi
done

# espeak-ng è facoltativo (usato solo per il test audio finale)
ESPEAK_AVAILABLE=0
if command -v espeak-ng >/dev/null 2>&1; then
  ESPEAK_AVAILABLE=1
elif command -v festival >/dev/null 2>&1; then
  ESPEAK_AVAILABLE=2
fi

if [[ "${#MISSING_PKGS[@]}" -gt 0 ]]; then
  log "Pacchetti mancanti: ${MISSING_PKGS[*]}. Installo via apt..."
  $SUDO apt-get update -qq
  $SUDO apt-get install -y "${MISSING_PKGS[@]}"
fi

# Installa espeak-ng se nessun TTS è presente (usato solo per il test)
if [[ "$ESPEAK_AVAILABLE" -eq 0 ]]; then
  log "Installo espeak-ng per il test audio (facoltativo)..."
  $SUDO apt-get install -y espeak-ng 2>/dev/null && ESPEAK_AVAILABLE=1 || warn "espeak-ng non installabile — il test audio sarà saltato."
fi

# libsdl2-dev NON è necessario: il server gira headless (niente SDL).
# libsdl2-dev serve solo per l'applicazione interattiva da console di whisper.cpp.

ok "Dipendenze di sistema OK."
echo ""

# =============================================================================
# STEP 2 — Build whisper.cpp (con server HTTP abilitato)
# =============================================================================
log "STEP 2/6 — Build whisper.cpp..."

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  warn "SKIP_BUILD=1: salto la compilazione."
  [[ -x "${WHISPER_INSTALL_DIR}/build/bin/whisper-server" ]] || \
    die "SKIP_BUILD=1 ma l'eseguibile non trovato in ${WHISPER_INSTALL_DIR}/build/bin/whisper-server"
else
  if [[ -d "${WHISPER_INSTALL_DIR}/.git" ]]; then
    log "Repository già presente — aggiorno all'ultima versione..."
    $SUDO git -C "${WHISPER_INSTALL_DIR}" pull --ff-only || \
      warn "git pull fallito (conflitti locali?). Procedo con la versione esistente."
  else
    log "Clono ggerganov/whisper.cpp in ${WHISPER_INSTALL_DIR}..."
    $SUDO git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "${WHISPER_INSTALL_DIR}"
  fi

  log "Compilazione con cmake (DWHISPER_BUILD_SERVER=ON, $(nproc) core)..."
  $SUDO mkdir -p "${WHISPER_INSTALL_DIR}/build"
  $SUDO cmake -S "${WHISPER_INSTALL_DIR}" \
              -B "${WHISPER_INSTALL_DIR}/build" \
              -DWHISPER_BUILD_SERVER=ON \
              -DCMAKE_BUILD_TYPE=Release \
              -DBUILD_SHARED_LIBS=OFF \
              >/dev/null 2>&1 || die "cmake configurazione fallita."

  $SUDO cmake --build "${WHISPER_INSTALL_DIR}/build" \
               --config Release \
               -j"$(nproc)" \
               >/dev/null 2>&1 || die "cmake build fallita."

  # Verifica che l'eseguibile esista
  SERVER_BIN="${WHISPER_INSTALL_DIR}/build/bin/whisper-server"
  if [[ ! -x "${SERVER_BIN}" ]]; then
    die "Build completata ma l'eseguibile ${SERVER_BIN} non trovato. Controlla il log di cmake."
  fi
fi

SERVER_BIN="${WHISPER_INSTALL_DIR}/build/bin/whisper-server"
ok "whisper.cpp compilato: ${SERVER_BIN}"

# ── Validazione flag supportati dal binario ───────────────────────────────────
# I flag del wrapper vengono verificati contro l'output di --help.
# Se un flag manca il binario è stato aggiornato e il wrapper va adeguato.
log "Verifico i flag supportati dal binario whisper-server..."
HELP_OUTPUT="$("${SERVER_BIN}" --help 2>&1 || true)"
for FLAG in --model --host --port --language --threads; do
  if echo "$HELP_OUTPUT" | grep -q -- "${FLAG}"; then
    :
  else
    warn "Flag '${FLAG}' non trovato nell'help di whisper-server — aggiorna il wrapper in setup-whisper-server.sh se il server non parte."
  fi
done
echo ""

# =============================================================================
# STEP 3 — Download del modello ggml-medium
# =============================================================================
MODEL_FILE="${WHISPER_INSTALL_DIR}/models/ggml-${WHISPER_MODEL}.bin"

if [[ "${SKIP_MODEL:-0}" == "1" ]]; then
  warn "STEP 3/6 — SKIP_MODEL=1: salto il download del modello."
  [[ -f "${MODEL_FILE}" ]] || die "SKIP_MODEL=1 ma il modello non trovato in ${MODEL_FILE}"
else
  log "STEP 3/6 — Download modello '${WHISPER_MODEL}' (~1.5 GB per medium)..."
  # NOTA SUI MODELLI:
  #   - medium (default): ~1.5 GB, bilanciamento ottimale qualità/velocità su
  #     CPU i5-7500T. File audio 10s → ~3s di trascrizione. Consigliato.
  #   - small: ~460 MB, più veloce (~1s), meno preciso su accenti regionali.
  #   - large-v3: ~2.9 GB, massima qualità ma ~8-12s su CPU — troppo lento.
  #   Verifica i modelli disponibili: https://huggingface.co/ggerganov/whisper.cpp

  if [[ -f "${MODEL_FILE}" ]]; then
    ok "Modello già presente: ${MODEL_FILE} — salto il download."
  else
    if [[ -f "${WHISPER_INSTALL_DIR}/models/download-ggml-model.sh" ]]; then
      log "Uso lo script ufficiale download-ggml-model.sh..."
      $SUDO bash "${WHISPER_INSTALL_DIR}/models/download-ggml-model.sh" "${WHISPER_MODEL}" || \
        die "Download modello '${WHISPER_MODEL}' fallito."
    else
      # Fallback: download diretto da Hugging Face
      log "Script download non trovato — scarico direttamente da Hugging Face..."
      $SUDO mkdir -p "${WHISPER_INSTALL_DIR}/models"
      HF_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin"
      $SUDO curl -L --progress-bar -o "${MODEL_FILE}" "${HF_URL}" || \
        die "Download modello da ${HF_URL} fallito."
    fi
    [[ -f "${MODEL_FILE}" ]] || die "Modello non trovato dopo il download: ${MODEL_FILE}"
  fi
fi

ok "Modello disponibile: ${MODEL_FILE} ($(du -sh "${MODEL_FILE}" 2>/dev/null | cut -f1 || echo "?"))"
echo ""

# =============================================================================
# STEP 4 — Utente di servizio, script wrapper e systemd
# =============================================================================
log "STEP 4/6 — Configurazione servizio systemd..."

# ── Crea utente di servizio dedicato 'whisper' ───────────────────────────────
if ! id "${WHISPER_SERVICE_USER}" >/dev/null 2>&1; then
  log "Creo utente di servizio '${WHISPER_SERVICE_USER}'..."
  $SUDO useradd -r -s /bin/false -M -d "${WHISPER_INSTALL_DIR}" "${WHISPER_SERVICE_USER}"
fi

# ── Aggiusta permessi sulla directory di installazione ───────────────────────
$SUDO chown -R "${WHISPER_SERVICE_USER}:${WHISPER_SERVICE_USER}" "${WHISPER_INSTALL_DIR}" 2>/dev/null || true

# ── Script wrapper run-server.sh ─────────────────────────────────────────────
# Il wrapper avvia il server con le opzioni ottimali per CPU headless.
# Override della lingua: passa WHISPER_LANG come variabile d'ambiente al servizio.
WRAPPER_SCRIPT="${WHISPER_INSTALL_DIR}/run-server.sh"
$SUDO tee "${WRAPPER_SCRIPT}" > /dev/null << WRAPPER_EOF
#!/usr/bin/env bash
# BikerLink — Whisper server wrapper
# Generato da scripts/setup-whisper-server.sh — non modificare a mano.
set -euo pipefail

INSTALL_DIR="${WHISPER_INSTALL_DIR}"
SERVER_BIN="\${INSTALL_DIR}/build/bin/whisper-server"
MODEL="\${INSTALL_DIR}/models/ggml-${WHISPER_MODEL}.bin"
LANG="\${WHISPER_LANG:-${WHISPER_LANG}}"

exec "\${SERVER_BIN}" \
  --model "\${MODEL}" \
  --host 127.0.0.1 \
  --port ${WHISPER_PORT} \
  --language "\${LANG}" \
  --threads \$(nproc)
WRAPPER_EOF
$SUDO chmod +x "${WRAPPER_SCRIPT}"
ok "Script wrapper scritto: ${WRAPPER_SCRIPT}"

# ── Unit file systemd ─────────────────────────────────────────────────────────
$SUDO tee /etc/systemd/system/whisper.service > /dev/null << UNIT_EOF
[Unit]
Description=Whisper.cpp Speech-to-Text Server — BikerLink
Documentation=https://github.com/ggerganov/whisper.cpp
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${WHISPER_INSTALL_DIR}/run-server.sh
User=${WHISPER_SERVICE_USER}
Group=${WHISPER_SERVICE_USER}
WorkingDirectory=${WHISPER_INSTALL_DIR}
Restart=on-failure
RestartSec=5
# Bind solo localhost: l'esposizione pubblica passa esclusivamente da nginx+token.
# La lingua di default è '${WHISPER_LANG}' — override via WHISPER_LANG nel wrapper.
Environment="WHISPER_LANG=${WHISPER_LANG}"

# Limiti di sicurezza (server headless senza GPU)
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=${WHISPER_INSTALL_DIR}

[Install]
WantedBy=multi-user.target
UNIT_EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable whisper >/dev/null 2>&1 || true
$SUDO systemctl restart whisper

# Attende che il server risponda (il primo avvio carica il modello in RAM: fino a 30s)
log "Attendo che il server Whisper sia pronto su ${WHISPER_HOST_BIND} (caricamento modello)..."
READY=0
for i in $(seq 1 60); do
  if curl -fsS "http://${WHISPER_HOST_BIND}/inference" \
       -F "file=@/dev/null" \
       -o /dev/null 2>/dev/null; then
    READY=1; break
  fi
  # Il server risponde 400 (richiesta vuota) quando è pronto
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "http://${WHISPER_HOST_BIND}/inference" 2>/dev/null || echo 000)"
  if [[ "$HTTP_CODE" == "400" || "$HTTP_CODE" == "200" ]]; then
    READY=1; break
  fi
  sleep 1
done

if [[ "$READY" -eq 1 ]]; then
  SYSCTL_STATUS="$($SUDO systemctl is-active whisper 2>/dev/null || echo unknown)"
  ok "whisper.service attivo: ${SYSCTL_STATUS}"
else
  $SUDO systemctl status whisper --no-pager -l | tail -20 || true
  die "Il server Whisper non risponde su ${WHISPER_HOST_BIND} dopo 60s. Controlla 'journalctl -u whisper'."
fi
echo ""

# =============================================================================
# STEP 5 — Token + configurazione nginx (location /whisper/ con X-Whisper-Token)
# =============================================================================
log "STEP 5/6 — Configurazione nginx..."

# ── Token: riusa quello esistente o generane uno nuovo ───────────────────────
# Se esiste già un token nello snippet nginx, viene riusato di default così le
# riesecuzioni NON invalidano i secret già impostati su Replit (token rotation).
EXISTING_TOKEN=""
if [[ -f "$NGINX_SNIPPET" ]]; then
  EXISTING_TOKEN="$($SUDO grep -oE '\$http_x_whisper_token != "[^"]+"' "$NGINX_SNIPPET" 2>/dev/null \
    | sed -E 's/.*"([^"]+)".*/\1/' | head -1 || true)"
fi

if [[ -n "${WHISPER_TOKEN:-}" ]]; then
  TOKEN="${WHISPER_TOKEN}"
  if [[ ! "$TOKEN" =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then
    die "WHISPER_TOKEN non valido: usa 16-128 caratteri tra A-Z a-z 0-9 _ - (niente quote/spazi)."
  fi
  ok "Riuso il token fornito via WHISPER_TOKEN."
elif [[ -n "$EXISTING_TOKEN" ]]; then
  TOKEN="$EXISTING_TOKEN"
  ok "Riuso il token già presente nello snippet nginx (nessuna rotazione)."
  warn "Per forzare un nuovo token: rimuovi ${NGINX_SNIPPET} oppure passa WHISPER_TOKEN=<nuovo>."
else
  TOKEN="$(openssl rand -hex 32)"
  ok "Generato un NUOVO token (openssl rand -hex 32)."
  warn "Token generato: aggiorna il secret WHISPER_TOKEN su Replit con il valore stampato a fine script."
fi

# ── Snippet nginx con la location /whisper/ ──────────────────────────────────
# Pattern identico a GraphHopper/Ollama: verifica header token con `if`, 403 se
# errato, `rewrite` per rimuovere il prefisso /whisper, proxy_pass a 127.0.0.1:8089.
# client_max_body_size 25m: necessario per file audio (default nginx è 1 MB).
# proxy_read_timeout 120s: trascrizione su CPU può richiedere diversi secondi.
$SUDO mkdir -p "$(dirname "$NGINX_SNIPPET")"
$SUDO tee "$NGINX_SNIPPET" > /dev/null << EOF
# BikerLink — Reverse proxy Whisper.cpp con auth token (X-Whisper-Token).
# Generato da scripts/setup-whisper-server.sh — non modificare a mano.
# Incluso dentro il server{} principale (Tailscale Funnel).
location /whisper/ {
    # Verifica token: stesso meccanismo di X-GH-Token (GraphHopper) e X-Ollama-Token.
    if (\$http_x_whisper_token != "${TOKEN}") {
        return 403;
    }

    # Accetta file audio fino a 25 MB (circa 25 minuti di audio MP3 a 128 kbps).
    client_max_body_size 25m;

    # Rimuove il prefisso /whisper prima di inoltrare al server locale.
    rewrite ^/whisper/(.*)\$ /\$1 break;

    proxy_pass http://127.0.0.1:${WHISPER_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # Timeout generosi: la trascrizione su CPU i5-7500T richiede ~3s per 10s audio.
    # Un file da 2 minuti può richiedere fino a 40s.
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    proxy_connect_timeout 10s;

    # Disabilita il buffering per risposta rapida appena disponibile.
    proxy_buffering off;
}
EOF
ok "Snippet nginx scritto: ${NGINX_SNIPPET}"

# ── Individua il file nginx con il server{} pubblico da modificare ───────────
detect_nginx_conf() {
  if [[ -n "${NGINX_CONF:-}" ]]; then
    echo "${NGINX_CONF}"; return
  fi
  local hit
  hit="$(grep -rlE 'server_name[^;]*\.ts\.net' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)"
  if [[ -n "$hit" ]]; then echo "$hit"; return; fi
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    echo "/etc/nginx/sites-enabled/default"; return
  fi
  echo ""
}

NGINX_TARGET="$(detect_nginx_conf)"
INCLUDE_LINE="    include ${NGINX_SNIPPET};"

inject_include() {
  local target="$1"
  if grep -qF "$NGINX_SNIPPET" "$target" 2>/dev/null; then
    ok "include già presente in ${target} — nessuna modifica."
    return 0
  fi

  local backup="${target}.bak-$(date +%Y%m%d%H%M%S)"
  $SUDO cp "$target" "$backup"
  log "Backup creato: ${backup}"

  $SUDO awk -v inc="$INCLUDE_LINE" '
    BEGIN { done = 0 }
    {
      print
      if (!done && $0 ~ /server[[:space:]]*\{[[:space:]]*$/) {
        print inc
        done = 1
      }
    }
  ' "$target" | $SUDO tee "${target}.tmp" > /dev/null
  $SUDO mv "${target}.tmp" "$target"

  if ! grep -qF "$NGINX_SNIPPET" "$target"; then
    $SUDO cp "$backup" "$target"
    return 1
  fi
  ok "include aggiunto in ${target} (dentro il primo server{})."
  return 0
}

NGINX_OK=0
if [[ -n "$NGINX_TARGET" && -f "$NGINX_TARGET" ]]; then
  log "File nginx individuato: ${NGINX_TARGET}"
  if inject_include "$NGINX_TARGET"; then
    if $SUDO nginx -t 2>/dev/null; then
      $SUDO systemctl reload nginx
      ok "nginx validato e ricaricato."
      NGINX_OK=1
    else
      err "nginx -t FALLITO dopo l'inserimento dell'include. Eseguo rollback."
      BK="$(ls -t "${NGINX_TARGET}".bak-* 2>/dev/null | head -1 || true)"
      if [[ -n "$BK" ]]; then
        $SUDO cp "$BK" "$NGINX_TARGET"
        $SUDO nginx -t >/dev/null 2>&1 && $SUDO systemctl reload nginx || true
        warn "Config nginx ripristinata dal backup: ${BK}"
      fi
    fi
  else
    warn "Non sono riuscito a inserire automaticamente l'include nel server{}."
  fi
else
  warn "Nessun file nginx con server{} individuato automaticamente."
fi

if [[ "$NGINX_OK" -ne 1 ]]; then
  echo ""
  warn "AZIONE MANUALE RICHIESTA — aggiungi questa riga DENTRO il blocco server{}"
  warn "del tuo vhost nginx (quello servito da Tailscale Funnel):"
  echo ""
  echo "    ${INCLUDE_LINE}"
  echo ""
  warn "Poi esegui:  ${SUDO:-sudo} nginx -t && ${SUDO:-sudo} systemctl reload nginx"
fi
echo ""

# =============================================================================
# STEP 6 — Test (locale + nginx) e output finale
# =============================================================================
log "STEP 6/6 — Test di verifica e output finale..."

# ── Hostname pubblico (Tailscale) ─────────────────────────────────────────────
detect_public_host() {
  if [[ -n "${PUBLIC_HOST:-}" ]]; then echo "${PUBLIC_HOST}"; return; fi
  if command -v tailscale >/dev/null 2>&1; then
    local dns
    dns="$(tailscale status --json 2>/dev/null \
      | grep -oE '"DNSName"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 \
      | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/' | sed 's/\.$//' || true)"
    if [[ -n "$dns" ]]; then echo "$dns"; return; fi
  fi
  echo ""
}
PUBLIC_HOSTNAME="$(detect_public_host)"

# ── Test 1: verifica che il servizio risponda localmente ──────────────────────
log "  1) Test servizio locale (http://${WHISPER_HOST_BIND}/inference)..."
HTTP_LOCAL="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST "http://${WHISPER_HOST_BIND}/inference" 2>/dev/null || echo 000)"
# whisper-server risponde 400 a una POST vuota (manca il campo 'file') — è corretto.
if [[ "$HTTP_LOCAL" == "400" || "$HTTP_LOCAL" == "200" ]]; then
  ok "  Servizio locale risponde (HTTP ${HTTP_LOCAL} — atteso 400 per POST vuota)."
else
  warn "  Servizio locale ha risposto HTTP ${HTTP_LOCAL} (atteso 400 o 200)."
fi

# ── Test 2/3: verifica auth nginx ────────────────────────────────────────────
if [[ "$NGINX_OK" -eq 1 ]]; then
  log "  2) Test nginx senza token (deve dare 403)..."
  CODE_NOAUTH="$(curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1/whisper/inference" 2>/dev/null || echo 000)"
  if [[ "$CODE_NOAUTH" == "403" ]]; then
    ok "  Senza token → 403 (auth attiva)."
  else
    warn "  Senza token ho ricevuto HTTP ${CODE_NOAUTH} (atteso 403). Verifica il vhost."
  fi

  log "  3) Test nginx con token valido (deve dare 400 — POST vuota)..."
  CODE_AUTH="$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "X-Whisper-Token: ${TOKEN}" \
    "http://127.0.0.1/whisper/inference" 2>/dev/null || echo 000)"
  if [[ "$CODE_AUTH" == "400" || "$CODE_AUTH" == "200" ]]; then
    ok "  Con token → ${CODE_AUTH} (proxy + rewrite OK)."
  else
    warn "  Con token ho ricevuto HTTP ${CODE_AUTH} (atteso 400 o 200)."
    warn "  Nota: il test usa http://127.0.0.1 e potrebbe non matchare server_name. Verifica via URL pubblico."
  fi
fi

# ── Test 4: trascrizione audio reale con espeak-ng ───────────────────────────
TEST_AUDIO="/tmp/bikerlink-whisper-test.wav"
TRANSCRIPT_OK=0

if [[ "$ESPEAK_AVAILABLE" -ge 1 ]]; then
  log "  4) Test trascrizione audio reale (espeak-ng)..."
  TEST_PHRASE="Inizia navigazione verso Milano"

  if [[ "$ESPEAK_AVAILABLE" -eq 1 ]]; then
    espeak-ng -v it -w "${TEST_AUDIO}" "${TEST_PHRASE}" 2>/dev/null && true
  else
    echo "${TEST_PHRASE}" | festival --tts 2>/dev/null && \
      festival --tts "${TEST_PHRASE}" --save "${TEST_AUDIO}" 2>/dev/null && true
  fi

  if [[ -f "${TEST_AUDIO}" && -s "${TEST_AUDIO}" ]]; then
    RESPONSE="$(curl -s -X POST \
      -H "X-Whisper-Token: ${TOKEN}" \
      -F "file=@${TEST_AUDIO}" \
      -F "language=${WHISPER_LANG}" \
      -F "response_format=json" \
      "http://127.0.0.1/whisper/inference" 2>/dev/null || echo '{}')"
    if echo "$RESPONSE" | grep -qi "milano\|navigaz"; then
      ok "  Trascrizione audio → risposta JSON con testo atteso."
      TRANSCRIPT_OK=1
    else
      warn "  Trascrizione completata ma testo non verificato. Risposta: ${RESPONSE:0:200}"
    fi
    rm -f "${TEST_AUDIO}"
  else
    warn "  Generazione audio di test fallita — salto verifica trascrizione."
  fi
else
  warn "  4) nessun TTS disponibile (espeak-ng/festival) — salto il test audio."
fi
echo ""

# =============================================================================
# Output finale: secret da impostare su Replit
# =============================================================================
if [[ -n "$PUBLIC_HOSTNAME" ]]; then
  WHISPER_URL_VALUE="https://${PUBLIC_HOSTNAME}/whisper"
else
  WHISPER_URL_VALUE="https://<IL-TUO-HOST>.ts.net/whisper"
fi

echo "============================================================"
echo -e "\033[1;32m✓ SETUP WHISPER COMPLETATO\033[0m"
echo "============================================================"
echo ""
echo "Imposta questi 2 secret nel progetto BikerLink su Replit"
echo "(Tools → Secrets), poi riavvia il backend:"
echo ""
echo -e "  \033[1mWHISPER_URL\033[0m   = ${WHISPER_URL_VALUE}"
echo -e "  \033[1mWHISPER_TOKEN\033[0m = ${TOKEN}"
echo ""
if [[ -z "$PUBLIC_HOSTNAME" ]]; then
  warn "Non sono riuscito a rilevare l'hostname Tailscale automaticamente."
  warn "Sostituisci <IL-TUO-HOST>.ts.net con il dominio del tuo nodo:"
  warn "  tailscale status   # colonna hostname, oppure il dominio del Funnel"
fi
echo "Modello attivo: ggml-${WHISPER_MODEL} — lingua default: ${WHISPER_LANG}"
echo ""
echo "Verifica dall'esterno (da un altro PC):"
echo "  curl -s -X POST \\"
echo "    -H \"X-Whisper-Token: ${TOKEN}\" \\"
echo "    -F \"file=@/percorso/audio.wav\" \\"
echo "    -F \"language=it\" \\"
echo "    -F \"response_format=json\" \\"
echo "    ${WHISPER_URL_VALUE}/inference"
echo ""
echo "Esempio con file MP3 (ffmpeg converte automaticamente):"
echo "  curl -s -X POST \\"
echo "    -H \"X-Whisper-Token: ${TOKEN}\" \\"
echo "    -F \"file=@/percorso/audio.mp3\" \\"
echo "    -F \"language=it\" \\"
echo "    -F \"response_format=json\" \\"
echo "    ${WHISPER_URL_VALUE}/inference"
echo ""
if [[ "$TRANSCRIPT_OK" -eq 0 ]]; then
  echo "Esempio risposta JSON attesa:"
  echo '  { "text": " Inizia navigazione verso Milano." }'
  echo ""
fi
echo "Per cambiare la lingua di trascrizione in futuro:"
echo "  WHISPER_LANG=en bash setup-whisper-server.sh   # ricrea wrapper + riavvia"
echo ""
echo "Se run-server.sh esiste già e il servizio non parte (flag obsoleti):"
echo "  SKIP_BUILD=1 SKIP_MODEL=1 bash setup-whisper-server.sh  # rigenera solo il wrapper"
echo ""
echo "Verifica rapida stato servizio:"
echo "  systemctl status whisper --no-pager -l | grep -E 'active|failed'"
echo "============================================================"
