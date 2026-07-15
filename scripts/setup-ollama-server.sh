#!/usr/bin/env bash
# =============================================================================
# BikerLink — Setup Ollama sul server di casa (ThinkCentre 910q)
#
# Cosa fa questo script (idempotente — puoi rieseguirlo senza danni):
#   1. Installa Ollama nell'ultima versione stabile (metodo ufficiale).
#   2. Scarica i modelli consigliati (chat/parsing + multilingue per traduzioni).
#   3. Verifica/abilita il servizio systemd `ollama.service` (bind 127.0.0.1).
#   4. Aggiunge a nginx una `location /ollama/` con auth token X-Ollama-Token
#      (stesso pattern di X-GH-Token usato da GraphHopper) + reverse proxy a 11434.
#   5. Esegue test locale e attraverso nginx.
#   6. Stampa i 3 secret da impostare su Replit (BOWIE_OLLAMA_URL/TOKEN/MODEL).
#
# Prerequisiti sul server:
#   - Ubuntu 26.04 LTS, nginx già installato e configurato con Tailscale Funnel.
#   - Permessi sudo (lo script richiede root per systemd e nginx).
#
# Utilizzo:
#   bash setup-ollama-server.sh
#
# Override opzionali (variabili d'ambiente):
#   OLLAMA_TOKEN=<token>   Riusa un token esistente invece di generarne uno nuovo.
#   PUBLIC_HOST=<host>     Forza l'hostname pubblico (es. bikerlink.tail5056aa.ts.net)
#                          se l'auto-detect via Tailscale non funziona.
#   NGINX_CONF=<path>      Forza il file nginx da modificare
#                          (default: auto-detect, fallback /etc/nginx/sites-enabled/default).
#   CHAT_MODEL=<modello>   Modello base scaricato (default: qwen3:1.7b).
#   SKIP_MODELS=1          Salta il download dei modelli (solo install + nginx).
# =============================================================================

set -euo pipefail

# ── Configurazione (override via env) ────────────────────────────────────────
# NOTA SUI MODELLI:
#   - CHAT_MODEL è il modello base scaricato. Default: qwen3:1.7b (~1.4GB).
#     Modello piccolo e veloce, entra comodamente negli 8GB VRAM della GTX 1070.
#     Lineup assistenti BikerLink: Horus = qwen3:4b, Bowie = qwen3:1.7b.
#     Per cambiarlo in futuro: esporta CHAT_MODEL=<nuovo>, riesegui lo script,
#     aggiorna il secret BOWIE_OLLAMA_MODEL su Replit.
#   - Il modello custom "bikerlink" (Bowie, assistente in-app) viene creato su base
#     qwen3:1.7b con system prompt BikerLink baked-in (BikerLink-Bowie.Modelfile).
#     BOWIE_OLLAMA_MODEL deve puntare a "bikerlink" (fallback hardcoded: qwen3:1.7b).
#   Verifica i modelli su: https://ollama.com/library
#
# AGGIORNAMENTI (idempotente): rieseguendo questo script lo step di install
# (curl ... install.sh | sh) aggiorna SEMPRE il runtime Ollama all'ultima
# versione stabile, e i pull aggiornano i modelli se la tag :latest è cambiata.
CHAT_MODEL="${CHAT_MODEL:-qwen3:1.7b}"
# Valore di default per l'output finale: sovrascritto a "bikerlink" se la
# creazione del modello custom riesce, o a CHAT_MODEL se fallisce/SKIP_MODELS=1.
BIKERLINK_CUSTOM_MODEL="bikerlink"
OLLAMA_PORT="11434"
OLLAMA_HOST_BIND="127.0.0.1:${OLLAMA_PORT}"
NGINX_SNIPPET="/etc/nginx/snippets/bikerlink-ollama.conf"

# ── Logging colorato ─────────────────────────────────────────────────────────
log()  { echo -e "\033[1;34m[OLLAMA]\033[0m $*"; }
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
echo "BikerLink — Setup Ollama (server di casa)"
echo "$(date)"
echo "============================================================"
echo ""

# =============================================================================
# STEP 1 — Installazione Ollama (ultima versione stabile, metodo ufficiale)
# =============================================================================
log "STEP 1/6 — Installazione Ollama..."

if command -v ollama >/dev/null 2>&1; then
  ok "Ollama già installato: $(ollama --version 2>/dev/null | head -1)"
  log "Provo comunque a aggiornare all'ultima versione..."
fi

# Lo script ufficiale installa SEMPRE l'ultima versione stabile e crea il
# servizio systemd `ollama.service`. È idempotente: aggiorna se già presente.
curl -fsSL https://ollama.com/install.sh | sh

# Verifica che ollama sia nel PATH prima di procedere
if ! command -v ollama >/dev/null 2>&1; then
  # Lo script ufficiale installa in /usr/local/bin o /usr/bin
  export PATH="/usr/local/bin:/usr/bin:${PATH}"
fi
command -v ollama >/dev/null 2>&1 || die "ollama non trovato nel PATH dopo l'installazione."

ok "Ollama installato: $(ollama --version 2>/dev/null | head -1)"
echo ""

# =============================================================================
# STEP 3 (anticipato) — Servizio systemd: deve essere attivo per i pull
# =============================================================================
log "STEP 2/6 — Verifica servizio systemd ollama.service..."

ensure_minimal_service() {
  warn "ollama.service non trovato — creo un unit file minimo."
  # Crea/garantisce l'utente di servizio 'ollama'
  if ! id ollama >/dev/null 2>&1; then
    $SUDO useradd -r -s /bin/false -m -d /usr/share/ollama ollama || true
  fi
  $SUDO tee /etc/systemd/system/ollama.service > /dev/null << EOF
[Unit]
Description=Ollama Service — BikerLink
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$(command -v ollama) serve
User=ollama
Group=ollama
Restart=always
RestartSec=3
# Bind solo localhost: l'esposizione pubblica passa esclusivamente da nginx+token
Environment="OLLAMA_HOST=${OLLAMA_HOST_BIND}"
# Performance: Flash Attention riduce la KV-cache RAM (+10–20% token/s su GPU).
# NUM_PARALLEL=2 evita saturazione con richieste concorrenti (GTX 1070, 8GB VRAM).
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_NUM_PARALLEL=2"

[Install]
WantedBy=multi-user.target
EOF
  $SUDO systemctl daemon-reload
}

if ! $SUDO systemctl list-unit-files 2>/dev/null | grep -q '^ollama\.service'; then
  ensure_minimal_service
else
  # Garantisce il bind su localhost anche per il service ufficiale, via drop-in
  # (non sovrascrive l'unit ufficiale, ma forza OLLAMA_HOST sicuro).
  $SUDO mkdir -p /etc/systemd/system/ollama.service.d
  $SUDO tee /etc/systemd/system/ollama.service.d/10-bikerlink-host.conf > /dev/null << EOF
[Service]
Environment="OLLAMA_HOST=${OLLAMA_HOST_BIND}"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_NUM_PARALLEL=2"
EOF
  $SUDO systemctl daemon-reload
fi

$SUDO systemctl enable ollama >/dev/null 2>&1 || true
$SUDO systemctl restart ollama

# Attende che l'API risponda (fino a 30s)
log "Attendo che l'API Ollama sia pronta su ${OLLAMA_HOST_BIND}..."
READY=0
for _ in $(seq 1 30); do
  if curl -fsS "http://${OLLAMA_HOST_BIND}/api/tags" >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 1
done

if [[ "$READY" -eq 1 ]]; then
  ok "ollama.service attivo: $($SUDO systemctl is-active ollama)"
else
  $SUDO systemctl status ollama --no-pager -l | tail -20 || true
  die "L'API Ollama non risponde su ${OLLAMA_HOST_BIND}. Controlla 'journalctl -u ollama'."
fi
echo ""

# =============================================================================
# STEP 2 — Pull dei modelli consigliati
# =============================================================================
if [[ "${SKIP_MODELS:-0}" == "1" ]]; then
  warn "STEP 3/6 — SKIP_MODELS=1: salto il download dei modelli."
  BIKERLINK_CUSTOM_MODEL="${CHAT_MODEL}"
else
  log "STEP 3/6 — Download modello (può richiedere alcuni minuti)..."

  log "  → Modello base: ${CHAT_MODEL}"
  ollama pull "${CHAT_MODEL}" || die "Pull fallito per ${CHAT_MODEL}"
  ok "  Modello scaricato: ${CHAT_MODEL}"

  echo ""
  log "Modelli installati:"
  ollama list || true

  # ── Crea il modello custom "bikerlink" dal Modelfile ─────────────────────
  # bikerlink = qwen3:1.7b + system prompt BikerLink baked-in.
  # Il base model è hardcoded nel Modelfile (FROM qwen3:1.7b), non
  # dipende da CHAT_MODEL. BOWIE_OLLAMA_MODEL su Replit deve valere "bikerlink";
  # "qwen3:1.7b" è il fallback hardcoded in ollama-client.ts.
  MODELFILE_DIR="$(cd "$(dirname "$0")/ollama-modelfile" 2>/dev/null && pwd || true)"
  MODELFILE_PATH="${MODELFILE_DIR}/BikerLink-Bowie.Modelfile"
  if [[ -f "$MODELFILE_PATH" ]]; then
    log "  → Creazione modello custom bikerlink (Bowie) da BikerLink-Bowie.Modelfile..."
    if ollama create bikerlink -f "$MODELFILE_PATH"; then
      ok "  Modello custom 'bikerlink' (Bowie) creato con successo."
      warn "  Imposta BOWIE_OLLAMA_MODEL=bikerlink nelle variabili Replit (vedi output finale)."
    else
      warn "  Creazione modello bikerlink fallita — usando '${CHAT_MODEL}' come fallback."
      BIKERLINK_CUSTOM_MODEL="${CHAT_MODEL}"
    fi
  else
    warn "  BikerLink-Bowie.Modelfile non trovato in ${MODELFILE_DIR} — salto creazione modello custom."
    BIKERLINK_CUSTOM_MODEL="${CHAT_MODEL}"
  fi
fi
echo ""

# =============================================================================
# STEP 4 — Token + configurazione nginx (location /ollama/ con X-Ollama-Token)
# =============================================================================
log "STEP 4/6 — Configurazione nginx..."

# ── Token: riusa quello passato o generane uno nuovo ─────────────────────────
# Se esiste già un token nello snippet nginx, lo riusiamo di default così le
# riesecuzioni NON invalidano i secret già impostati su Replit (token rotation).
EXISTING_TOKEN=""
if [[ -f "$NGINX_SNIPPET" ]]; then
  EXISTING_TOKEN="$($SUDO grep -oE '\$http_x_ollama_token != "[^"]+"' "$NGINX_SNIPPET" 2>/dev/null \
    | sed -E 's/.*"([^"]+)".*/\1/' | head -1 || true)"
fi

if [[ -n "${OLLAMA_TOKEN:-}" ]]; then
  TOKEN="${OLLAMA_TOKEN}"
  # Valida il formato: solo caratteri sicuri per la config nginx (no quote/spazi
  # che romperebbero il blocco `if`). Accetta hex/base64url ragionevolmente lunghi.
  if [[ ! "$TOKEN" =~ ^[A-Za-z0-9_-]{16,128}$ ]]; then
    die "OLLAMA_TOKEN non valido: usa 16-128 caratteri tra A-Z a-z 0-9 _ - (niente quote/spazi)."
  fi
  ok "Riuso il token fornito via OLLAMA_TOKEN."
elif [[ -n "$EXISTING_TOKEN" ]]; then
  TOKEN="$EXISTING_TOKEN"
  ok "Riuso il token già presente nello snippet nginx (nessuna rotazione)."
  warn "Per forzare un nuovo token: rimuovi ${NGINX_SNIPPET} oppure passa OLLAMA_TOKEN=<nuovo>."
else
  TOKEN="$(openssl rand -hex 32)"
  ok "Generato un NUOVO token (openssl rand -hex 32)."
  warn "Token ruotato: aggiorna il secret BOWIE_OLLAMA_TOKEN su Replit con il valore stampato a fine script."
fi

# ── Snippet nginx con la location /ollama/ ───────────────────────────────────
# Pattern identico a GraphHopper: verifica header token con `if`, 403 se errato,
# `rewrite` per rimuovere il prefisso /ollama, proxy_pass a 127.0.0.1:11434.
# proxy_buffering off per lo streaming token-by-token delle risposte LLM.
$SUDO mkdir -p "$(dirname "$NGINX_SNIPPET")"
$SUDO tee "$NGINX_SNIPPET" > /dev/null << EOF
# BikerLink — Reverse proxy Ollama con auth token (X-Ollama-Token).
# Generato da scripts/setup-ollama-server.sh — non modificare a mano.
# Incluso dentro il server{} principale (Tailscale Funnel).
location /ollama/ {
    # Verifica token: stesso meccanismo di X-GH-Token (GraphHopper).
    if (\$http_x_ollama_token != "${TOKEN}") {
        return 403;
    }

    # Rimuove il prefisso /ollama prima di inoltrare a Ollama.
    rewrite ^/ollama/(.*)\$ /\$1 break;

    proxy_pass http://127.0.0.1:${OLLAMA_PORT};
    # Ollama accetta solo Host localhost — passiamo quello per evitare 403 vuoto.
    proxy_set_header Host localhost;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # Streaming risposte LLM (no buffering) + timeout generosi (CPU lenta).
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    proxy_connect_timeout 10s;
}
EOF
ok "Snippet nginx scritto: ${NGINX_SNIPPET}"

# ── Individua il file nginx con il server{} pubblico da modificare ───────────
detect_nginx_conf() {
  if [[ -n "${NGINX_CONF:-}" ]]; then
    echo "${NGINX_CONF}"; return
  fi
  # Cerca il file che contiene un server{} con un hostname .ts.net (Tailscale).
  local hit
  hit="$(grep -rlE 'server_name[^;]*\.ts\.net' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)"
  if [[ -n "$hit" ]]; then echo "$hit"; return; fi
  # Fallback: file di default tipico.
  if [[ -f /etc/nginx/sites-enabled/default ]]; then
    echo "/etc/nginx/sites-enabled/default"; return
  fi
  echo ""
}

NGINX_TARGET="$(detect_nginx_conf)"
INCLUDE_LINE="    include ${NGINX_SNIPPET};"

inject_include() {
  local target="$1"
  # Già incluso? idempotente.
  if grep -qF "$NGINX_SNIPPET" "$target" 2>/dev/null; then
    ok "include già presente in ${target} — nessuna modifica."
    return 0
  fi

  # Backup prima di toccare il file.
  local backup="${target}.bak-$(date +%Y%m%d%H%M%S)"
  $SUDO cp "$target" "$backup"
  log "Backup creato: ${backup}"

  # Inserisce l'include subito dopo l'apertura del PRIMO blocco server{}.
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

  # Verifica che l'include sia stato effettivamente aggiunto.
  if ! grep -qF "$NGINX_SNIPPET" "$target"; then
    $SUDO cp "$backup" "$target"
    return 1
  fi
  ok "include aggiunto in ${target} (dentro il primo server{})."
  echo "BACKUP_FILE=${backup}"
  return 0
}

NGINX_OK=0
if [[ -n "$NGINX_TARGET" && -f "$NGINX_TARGET" ]]; then
  log "File nginx individuato: ${NGINX_TARGET}"
  if inject_include "$NGINX_TARGET"; then
    # Valida e ricarica; in caso di errore esegue il rollback del backup.
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
  warn "Poi esegui:  ${SUDO} nginx -t && ${SUDO} systemctl reload nginx"
fi
echo ""

# =============================================================================
# STEP 5 — Test (locale + attraverso nginx)
# =============================================================================
log "STEP 5/6 — Test di verifica..."

# ── Determina l'hostname pubblico (Tailscale) ────────────────────────────────
detect_public_host() {
  if [[ -n "${PUBLIC_HOST:-}" ]]; then echo "${PUBLIC_HOST}"; return; fi
  if command -v tailscale >/dev/null 2>&1; then
    # DNSName del nodo, es: bikerlink.tail5056aa.ts.net.
    local dns
    dns="$(tailscale status --json 2>/dev/null \
      | grep -oE '"DNSName"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 \
      | sed -E 's/.*:[[:space:]]*"([^"]+)"/\1/' | sed 's/\.$//' || true)"
    if [[ -n "$dns" ]]; then echo "$dns"; return; fi
  fi
  echo ""
}

PUBLIC_HOSTNAME="$(detect_public_host)"

# Test 1: API locale diretta
log "  1) Test API locale (http://${OLLAMA_HOST_BIND}/api/tags)..."
if curl -fsS "http://${OLLAMA_HOST_BIND}/api/tags" >/dev/null 2>&1; then
  ok "  API locale risponde."
else
  err "  API locale NON risponde."
fi

# Test attraverso nginx (solo se la config è stata applicata)
if [[ "$NGINX_OK" -eq 1 ]]; then
  # Test 2: senza token → deve essere 403
  log "  2) Test nginx senza token (deve dare 403)..."
  CODE_NOAUTH="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/ollama/api/tags" 2>/dev/null || echo 000)"
  if [[ "$CODE_NOAUTH" == "403" ]]; then
    ok "  Senza token → 403 (auth attiva)."
  else
    warn "  Senza token ho ricevuto HTTP ${CODE_NOAUTH} (atteso 403). Verifica il vhost."
  fi

  # Test 3: con token → deve dare 200
  log "  3) Test nginx con token valido (deve dare 200)..."
  CODE_AUTH="$(curl -s -o /dev/null -w '%{http_code}' \
    -H "X-Ollama-Token: ${TOKEN}" "http://127.0.0.1/ollama/api/tags" 2>/dev/null || echo 000)"
  if [[ "$CODE_AUTH" == "200" ]]; then
    ok "  Con token → 200 (proxy + rewrite OK)."
  else
    warn "  Con token ho ricevuto HTTP ${CODE_AUTH} (atteso 200)."
    warn "  Nota: il test usa http://127.0.0.1 e potrebbe non matchare il server_name. Verifica via URL pubblico."
  fi
fi
echo ""

# =============================================================================
# STEP 6 — Output finale: secret da impostare su Replit
# =============================================================================
if [[ -n "$PUBLIC_HOSTNAME" ]]; then
  OLLAMA_URL_VALUE="https://${PUBLIC_HOSTNAME}/ollama"
else
  OLLAMA_URL_VALUE="https://<IL-TUO-HOST>.ts.net/ollama"
fi

echo "============================================================"
echo -e "\033[1;32m✓ SETUP OLLAMA COMPLETATO\033[0m"
echo "============================================================"
echo ""
echo "Imposta questi 3 secret nel progetto BikerLink su Replit"
echo "(Tools → Secrets), poi riavvia il backend:"
echo ""
echo -e "  \033[1mBOWIE_OLLAMA_URL\033[0m   = ${OLLAMA_URL_VALUE}"
echo -e "  \033[1mBOWIE_OLLAMA_TOKEN\033[0m = ${TOKEN}"
echo -e "  \033[1mBOWIE_OLLAMA_MODEL\033[0m = ${BIKERLINK_CUSTOM_MODEL}"
echo ""
warn "PROMEMORIA: il secret BOWIE_OLLAMA_MODEL va AGGIORNATO A MANO su Replit dopo"
warn "questo deploy sul ThinkCentre (Tools → Secrets). L'agente Replit NON può"
warn "modificare un secret già esistente in autonomia. Base model ora: qwen3:1.7b;"
warn "fallback hardcoded nel codice: qwen3:1.7b (se il secret resta vuoto)."
echo ""
if [[ -z "$PUBLIC_HOSTNAME" ]]; then
  warn "Non sono riuscito a rilevare l'hostname Tailscale automaticamente."
  warn "Sostituisci <IL-TUO-HOST>.ts.net con il dominio del tuo nodo:"
  warn "  tailscale status   # colonna hostname, oppure il dominio del Funnel"
fi
echo ""
echo "Verifica dall'esterno (da un altro PC):"
echo "  curl -H \"X-Ollama-Token: ${TOKEN}\" \\"
echo "    ${OLLAMA_URL_VALUE}/api/tags"
echo ""
echo "Test di generazione:"
echo "  curl ${OLLAMA_URL_VALUE}/api/generate \\"
echo "    -H \"X-Ollama-Token: ${TOKEN}\" \\"
echo "    -d '{\"model\":\"${BIKERLINK_CUSTOM_MODEL}\",\"prompt\":\"Ciao\",\"stream\":false}'"
echo "============================================================"
