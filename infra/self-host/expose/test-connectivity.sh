#!/usr/bin/env bash
# =============================================================================
# BikerLink — test-connectivity.sh
# Verifica la raggiungibilità e l'autenticazione di tutti i servizi esposti.
#
# Uso (dal ThinkCentre o da qualsiasi macchina con accesso a internet):
#   chmod +x test-connectivity.sh
#   ./test-connectivity.sh
#
# Legge BASE_DOMAIN e i token da .env.local (o da variabili d'ambiente).
# Esegui con VERBOSE=1 per vedere le risposte complete dei servizi.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${SCRIPT_DIR}/../.env.local}"
VERBOSE="${VERBOSE:-0}"

# ── Colori ────────────────────────────────────────────────────────────────────
GREEN="\033[32m"; RED="\033[31m"; YELLOW="\033[33m"; CYAN="\033[36m"; RESET="\033[0m"; BOLD="\033[1m"
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
fail() { echo -e "  ${RED}✗${RESET} $*"; FAILURES=$((FAILURES+1)); }
warn() { echo -e "  ${YELLOW}!${RESET} $*"; }
info() { echo -e "  ${CYAN}→${RESET} $*"; }
section() { echo; echo -e "${BOLD}━━━ $* ━━━${RESET}"; }

FAILURES=0

# ── Leggi .env.local ──────────────────────────────────────────────────────────
read_env_value() {
  local key="$1" file="$2" line val
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

if [[ -r "$ENV_LOCAL_FILE" ]]; then
  BASE_DOMAIN="${BASE_DOMAIN:-$(read_env_value BASE_DOMAIN "$ENV_LOCAL_FILE" 2>/dev/null || true)}"
  GRAPHHOPPER_TOKEN="${GRAPHHOPPER_TOKEN:-$(read_env_value GRAPHHOPPER_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)}"
  VALHALLA_API_KEY="${VALHALLA_API_KEY:-$(read_env_value VALHALLA_API_KEY "$ENV_LOCAL_FILE" 2>/dev/null || true)}"
  OLLAMA_TOKEN="${OLLAMA_TOKEN:-$(read_env_value OLLAMA_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)}"
  WHISPER_TOKEN="${WHISPER_TOKEN:-$(read_env_value WHISPER_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)}"
  NOMINATIM_TOKEN="${NOMINATIM_TOKEN:-$(read_env_value NOMINATIM_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)}"
fi

BASE_DOMAIN="${BASE_DOMAIN:-}"
if [[ -z "$BASE_DOMAIN" ]]; then
  echo -e "${RED}ERRORE:${RESET} BASE_DOMAIN non impostato." >&2
  echo "  Imposta BASE_DOMAIN=bikerlink.duckdns.org nell'env o nel .env.local" >&2
  exit 1
fi

# ── Funzioni di test ──────────────────────────────────────────────────────────

# Esegue un curl e controlla il codice HTTP atteso.
# check_http <etichetta> <url> <codice-atteso> [header...]
check_http() {
  local label="$1" url="$2" expected="$3"
  shift 3
  local headers=()
  for h in "$@"; do headers+=(-H "$h"); done

  local http_code body
  body="$(curl -fsSL --max-time 8 -o /tmp/bikerlink_test_body \
    -w "%{http_code}" "${headers[@]}" "$url" 2>/dev/null || true)"
  http_code="${body:-000}"

  if [[ "$VERBOSE" == "1" ]]; then
    info "  $url → HTTP $http_code"
    [[ -s /tmp/bikerlink_test_body ]] && head -c 300 /tmp/bikerlink_test_body && echo
  fi

  if [[ "$http_code" == "$expected" ]]; then
    ok "${label} — HTTP ${http_code}"
    return 0
  else
    fail "${label} — atteso HTTP ${expected}, ricevuto HTTP ${http_code}"
    return 1
  fi
}

# ── Sezione 1: DNS ────────────────────────────────────────────────────────────
section "1/6 — Risoluzione DNS"

for sub in gh valhalla ollama whisper nominatim; do
  host="${sub}.${BASE_DOMAIN}"
  if resolved="$(getent hosts "$host" 2>/dev/null | awk '{print $1}' | head -1)" && [[ -n "$resolved" ]]; then
    ok "${host} → ${resolved}"
  else
    fail "${host} — DNS non risolve (DuckDNS aggiornato? Passo 1-2 della guida)"
  fi
done

# ── Sezione 2: TLS ────────────────────────────────────────────────────────────
section "2/6 — Certificati TLS"

for sub in gh valhalla ollama whisper nominatim; do
  host="${sub}.${BASE_DOMAIN}"
  if openssl s_client -connect "${host}:443" -servername "$host" \
      </dev/null 2>/dev/null | grep -q "Verify return code: 0"; then
    ok "${host} — TLS valido"
  else
    fail "${host} — TLS non valido o porta 443 chiusa (certbot eseguito? Porte aperte?)"
  fi
done

# ── Sezione 3: Auth (401 senza token) ─────────────────────────────────────────
section "3/6 — Autenticazione (senza token deve rispondere 401)"

check_http "GraphHopper  no-token" "https://gh.${BASE_DOMAIN}/route"          "401"
check_http "Valhalla     no-token" "https://valhalla.${BASE_DOMAIN}/route"     "401"
check_http "Ollama       no-token" "https://ollama.${BASE_DOMAIN}/api/tags"    "401"
check_http "Whisper      no-token" "https://whisper.${BASE_DOMAIN}/inference"  "401"
check_http "Nominatim    no-token" "https://nominatim.${BASE_DOMAIN}/search"   "401"

# ── Sezione 4: Connettività con token ─────────────────────────────────────────
section "4/6 — Connettività con token (deve rispondere 2xx)"

if [[ -n "${GRAPHHOPPER_TOKEN:-}" ]]; then
  check_http "GraphHopper  /health" \
    "https://gh.${BASE_DOMAIN}/health" "200" \
    "X-GH-Token: ${GRAPHHOPPER_TOKEN}"
else
  warn "GRAPHHOPPER_TOKEN non impostato — skip test autenticato"
fi

if [[ -n "${VALHALLA_API_KEY:-}" ]]; then
  check_http "Valhalla     /status" \
    "https://valhalla.${BASE_DOMAIN}/status" "200" \
    "X-Valhalla-Key: ${VALHALLA_API_KEY}"
else
  warn "VALHALLA_API_KEY non impostata — skip test autenticato"
fi

if [[ -n "${OLLAMA_TOKEN:-}" ]]; then
  check_http "Ollama       /api/tags" \
    "https://ollama.${BASE_DOMAIN}/api/tags" "200" \
    "X-Ollama-Token: ${OLLAMA_TOKEN}"
else
  warn "OLLAMA_TOKEN non impostato — skip test autenticato"
fi

if [[ -n "${NOMINATIM_TOKEN:-}" ]]; then
  check_http "Nominatim    /search" \
    "https://nominatim.${BASE_DOMAIN}/search?q=Milano&format=json&limit=1" "200" \
    "X-Nominatim-Token: ${NOMINATIM_TOKEN}"
else
  warn "NOMINATIM_TOKEN non impostato — skip test autenticato"
fi

# Whisper: probe audio silenzioso (POST multipart)
if [[ -n "${WHISPER_TOKEN:-}" ]]; then
  # WAV silenzioso minimale (0.5s 16kHz mono) — stessa tecnica dell'health route
  TMPWAV="$(mktemp /tmp/bikerlink_probe_XXXXXX.wav)"
  python3 - "$TMPWAV" <<'PYSCRIPT'
import sys, struct
sr=16000; n=int(sr*0.5); d=n*2
hdr=struct.pack('<4sI4s4sIHHIIHH4sI',b'RIFF',36+d,b'WAVE',b'fmt ',16,1,1,sr,sr*2,2,16,b'data',d)
open(sys.argv[1],'wb').write(hdr+bytes(d))
PYSCRIPT
  code="$(curl -fsSL --max-time 15 -o /dev/null -w "%{http_code}" \
    -H "X-Whisper-Token: ${WHISPER_TOKEN}" \
    -F "file=@${TMPWAV};type=audio/wav" \
    -F "response_format=json" \
    "https://whisper.${BASE_DOMAIN}/inference" 2>/dev/null || echo "000")"
  rm -f "$TMPWAV"
  if [[ "$code" == "200" ]]; then
    ok "Whisper      /inference — HTTP 200"
  else
    fail "Whisper      /inference — HTTP ${code} (atteso 200)"
  fi
else
  warn "WHISPER_TOKEN non impostato — skip test autenticato"
fi

# ── Sezione 5: Rate-limit header ──────────────────────────────────────────────
section "5/6 — Rate limit (verifica header X-RateLimit / RateLimit)"

for sub in ollama whisper; do
  host="${sub}.${BASE_DOMAIN}"
  headers="$(curl -sI --max-time 5 "https://${host}/" 2>/dev/null | tr -d '\r' || true)"
  if echo "$headers" | grep -qi "429\|ratelimit\|retry-after"; then
    ok "${host} — header rate-limit presenti"
  else
    info "${host} — nessun header rate-limit visibile (normale su prima richiesta)"
  fi
done

# ── Sezione 6: DuckDNS timer ──────────────────────────────────────────────────
section "6/6 — Timer DuckDNS systemd"

if systemctl is-active --quiet duckdns.timer 2>/dev/null; then
  ok "duckdns.timer — attivo"
  next="$(systemctl status duckdns.timer 2>/dev/null | grep 'Trigger:' | head -1 | sed 's/.*Trigger:/Prossimo aggiornamento:/')"
  [[ -n "$next" ]] && info "$next"
else
  warn "duckdns.timer non attivo o non installato (solo su ThinkCentre)"
fi

# ── Risultato finale ──────────────────────────────────────────────────────────
echo
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}✓ Tutti i test superati — BikerLink self-host operativo su DuckDNS${RESET}"
  exit 0
else
  echo -e "${RED}${BOLD}✗ ${FAILURES} test falliti — vedi i messaggi sopra e la sezione Troubleshooting del README${RESET}"
  exit 1
fi
