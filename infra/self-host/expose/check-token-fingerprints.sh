#!/usr/bin/env bash
# =============================================================================
# BikerLink — expose/check-token-fingerprints.sh
#
# Legge i token dal .env.local del ThinkCentre (stessa logica di setup-expose.sh)
# e stampa i fingerprint SHA-256 (prime 8 hex) per confrontarli con quelli
# mostrati nel pannello admin ThinkCentre senza esporre i valori in chiaro.
#
# Uso tipico:
#   chmod +x check-token-fingerprints.sh && ./check-token-fingerprints.sh
#
# Variabili di ambiente (opzionali):
#   ENV_LOCAL_FILE   percorso alternativo al .env.local (default: ../infra/.env.local)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Estetica ──────────────────────────────────────────────────────────────────
bold()  { echo -e "\033[1m$*\033[0m"; }
ok()    { echo -e "  \033[32m✓\033[0m $*"; }
warn()  { echo -e "  \033[33m!\033[0m $*"; }
info()  { echo -e "  \033[36m→\033[0m $*"; }
err()   { echo -e "  \033[31m✗\033[0m $*"; }
section() { echo; bold "━━━ $* ━━━"; }

# ── Prerequisiti ──────────────────────────────────────────────────────────────
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "ERRORE: sha256sum / shasum non disponibili." >&2
  exit 1
fi

sha256_hex() {
  local input="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$input" | sha256sum | awk '{print $1}'
  else
    printf '%s' "$input" | shasum -a 256 | awk '{print $1}'
  fi
}

fingerprint() {
  local token="$1"
  [[ -z "$token" ]] && { printf 'null'; return; }
  local hex
  hex="$(sha256_hex "$token")"
  printf '%s' "${hex:0:8}"
}

# ── .env.local ────────────────────────────────────────────────────────────────
ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${SCRIPT_DIR}/../.env.local}"

read_env_value() {
  local key="$1" file="$2" line val
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# ── Header ────────────────────────────────────────────────────────────────────
echo
bold "BikerLink — Token Fingerprint Checker"
info "Confronta questi fingerprint con quelli nel pannello admin ThinkCentre."
info "Un fingerprint diverso = token disallineato = 401 sui probe Replit."

# ── Lettura .env.local ────────────────────────────────────────────────────────
section "Sorgente token"

if [[ -r "$ENV_LOCAL_FILE" ]]; then
  ok ".env.local trovato: $ENV_LOCAL_FILE"
else
  warn ".env.local non trovato: $ENV_LOCAL_FILE"
  warn "Setto le variabili a vuoto — i token devono essere passati come env."
fi

GH_TOKEN="$(read_env_value GRAPHHOPPER_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || echo "${GRAPHHOPPER_TOKEN:-}")"
VALHALLA_KEY="$(read_env_value VALHALLA_API_KEY "$ENV_LOCAL_FILE" 2>/dev/null || echo "${VALHALLA_API_KEY:-}")"
OLLAMA_TOKEN="$(read_env_value OLLAMA_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || echo "${OLLAMA_TOKEN:-}")"
WHISPER_TOKEN="$(read_env_value WHISPER_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || echo "${WHISPER_TOKEN:-}")"
NOMINATIM_TOKEN="$(read_env_value NOMINATIM_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || echo "${NOMINATIM_TOKEN:-}")"

PLACEHOLDER="<INSERIRE>"

# ── Calcolo fingerprint ───────────────────────────────────────────────────────
section "Fingerprint SHA-256 (prime 8 hex)"

declare -A SERVICE_LABELS=(
  [GRAPHHOPPER_TOKEN]="GraphHopper"
  [VALHALLA_API_KEY]="Valhalla"
  [OLLAMA_TOKEN]="Ollama AI"
  [WHISPER_TOKEN]="Whisper ASR"
  [NOMINATIM_TOKEN]="Nominatim"
)

print_fingerprint() {
  local key="$1" value="$2"
  local label="${SERVICE_LABELS[$key]:-$key}"
  if [[ -z "$value" || "$value" == "$PLACEHOLDER" ]]; then
    warn "${label} (${key}): TOKEN ASSENTE O PLACEHOLDER — fingerprint non calcolabile"
    return
  fi
  local fp
  fp="$(fingerprint "$value")"
  printf "  %-20s %s  [%s]\n" "$label" "$fp" "$key"
}

print_fingerprint "GRAPHHOPPER_TOKEN" "$GH_TOKEN"
print_fingerprint "VALHALLA_API_KEY"  "$VALHALLA_KEY"
print_fingerprint "OLLAMA_TOKEN"      "$OLLAMA_TOKEN"
print_fingerprint "WHISPER_TOKEN"     "$WHISPER_TOKEN"
print_fingerprint "NOMINATIM_TOKEN"   "$NOMINATIM_TOKEN"

# ── Confronto ─────────────────────────────────────────────────────────────────
section "Come confrontare"

echo "  1. Apri il pannello admin ThinkCentre nell'app BikerLink."
echo "  2. Espandi la card 'Server di casa (ThinkCentre)'."
echo "  3. Per i servizi offline, accanto allo stato trovi 'token Replit: XXXXXXXX…'"
echo "  4. Confronta le 8 cifre mostrate qui con quelle nell'app."
echo
echo "  Fingerprint uguali  → il token è allineato: il 401 ha un'altra causa."
echo "  Fingerprint diversi → i token sono disallineati: rigenera e riallinea."

# ── Riallineamento ────────────────────────────────────────────────────────────
section "Riallineamento (se i fingerprint non coincidono)"

cat <<'EOF'
  Passo 1 — Rigenera i token sul ThinkCentre:

      cd infra/self-host/expose
      ./setup-expose.sh --gen-tokens

    I nuovi token vengono salvati in .env.local e nei config nginx generati.

  Passo 2 — Applica il nuovo nginx sul ThinkCentre:

      sudo cp generated/nginx-bikerlink.conf /etc/nginx/sites-available/bikerlink
      sudo nginx -t && sudo systemctl reload nginx

  Passo 3 — Aggiorna i secret Replit con i valori da .env.local:

      OLLAMA_TOKEN=<nuovo valore>
      WHISPER_TOKEN=<nuovo valore>
      NOMINATIM_TOKEN=<nuovo valore>
      GRAPHHOPPER_TOKEN=<nuovo valore>
      VALHALLA_API_KEY=<nuovo valore>

    (Pannello Replit → Secrets, oppure usa il CLI Replit)

  Passo 4 — Riavvia il backend Replit per caricare i nuovi secret.

  Passo 5 — Riesegui questo script e controlla che i fingerprint coincidano.
EOF

echo
ok "Fatto."
echo
