#!/usr/bin/env bash
# =============================================================================
# BikerLink — expose/setup-expose.sh
# Genera i file di configurazione per esporre i servizi self-host (GraphHopper
# e Valhalla) all'app cloud, compilando automaticamente i segnaposto a partire
# dai template di questa cartella e dai valori del .env.local.
#
# Cosa fa:
#   1. Legge i token (GRAPHHOPPER_TOKEN, VALHALLA_API_KEY) dal .env.local.
#   2. Chiede/legge dominio base, origin web (CORS) e UUID del tunnel Cloudflare.
#   3. Valida che i token forniti coincidano con quelli del .env.local.
#   4. Produce i config compilati (senza segnaposto):
#        - generated/nginx-bikerlink.conf
#        - generated/cloudflared-config.yml
#   I file template originali (nginx-bikerlink.conf, cloudflared-config.yml)
#   restano intatti come riferimento.
#
# Uso:
#   chmod +x setup-expose.sh && ./setup-expose.sh
#
# Variabili d'ambiente per modalità non-interattiva (CI / scripting):
#   BASE_DOMAIN, APP_ORIGIN, TUNNEL_UUID, GRAPHHOPPER_TOKEN, VALHALLA_API_KEY,
#   ENV_LOCAL_FILE, NONINTERACTIVE=1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_LOCAL_FILE="${ENV_LOCAL_FILE:-${SCRIPT_DIR}/../.env.local}"
NGINX_TEMPLATE="${SCRIPT_DIR}/nginx-bikerlink.conf"
CLOUDFLARED_TEMPLATE="${SCRIPT_DIR}/cloudflared-config.yml"
OUT_DIR="${SCRIPT_DIR}/generated"
NGINX_OUT="${OUT_DIR}/nginx-bikerlink.conf"
CLOUDFLARED_OUT="${OUT_DIR}/cloudflared-config.yml"
PLACEHOLDER_VALUE="<INSERIRE>"

NONINTERACTIVE="${NONINTERACTIVE:-0}"

# ── Estetica (coerente con setup.sh) ──────────────────────────────────────────
bold()  { echo -e "\033[1m$*\033[0m"; }
ok()    { echo -e "  \033[32m✓\033[0m $*"; }
warn()  { echo -e "  \033[33m!\033[0m $*"; }
info()  { echo -e "  \033[36m→\033[0m $*"; }
die()   { echo -e "\033[31m✗ ERRORE:\033[0m $*" >&2; exit 1; }
section() { echo; bold "━━━ $* ━━━"; }

# Legge il valore di una chiave da un file .env (ultima occorrenza, trim quote).
read_env_value() {
  local key="$1" file="$2" line val
  [[ -r "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  # Rimuove eventuali virgolette singole/doppie esterne.
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

# Chiede un valore all'utente con default opzionale; rispetta NONINTERACTIVE.
ask() {
  local prompt="$1" default="${2:-}" reply
  if [[ "$NONINTERACTIVE" == "1" ]]; then
    printf '%s' "$default"; return 0
  fi
  if [[ -n "$default" ]]; then
    read -r -p "  ${prompt} [${default}]: " reply
    printf '%s' "${reply:-$default}"
  else
    read -r -p "  ${prompt}: " reply
    printf '%s' "$reply"
  fi
}

# Escape per sed (sostituzione sicura su separatore '#').
sed_escape() { printf '%s' "$1" | sed -e 's/[\#&]/\\&/g'; }

# ─────────────────────────────────────────────────────────────────────────────
section "1/4 — Verifica template e .env.local"
# ─────────────────────────────────────────────────────────────────────────────
[[ -f "$NGINX_TEMPLATE" ]]       || die "Template Nginx non trovato: $NGINX_TEMPLATE"
[[ -f "$CLOUDFLARED_TEMPLATE" ]] || die "Template cloudflared non trovato: $CLOUDFLARED_TEMPLATE"
ok "Template trovati (nginx-bikerlink.conf, cloudflared-config.yml)"

if [[ -r "$ENV_LOCAL_FILE" ]]; then
  ok ".env.local trovato: $ENV_LOCAL_FILE"
else
  warn ".env.local non trovato in $ENV_LOCAL_FILE — i token andranno inseriti a mano."
fi

# Token attesi (dal .env.local). Possono essere vuoti o placeholder.
ENV_GH_TOKEN="$(read_env_value GRAPHHOPPER_TOKEN "$ENV_LOCAL_FILE" 2>/dev/null || true)"
ENV_VALHALLA_KEY="$(read_env_value VALHALLA_API_KEY "$ENV_LOCAL_FILE" 2>/dev/null || true)"

# ─────────────────────────────────────────────────────────────────────────────
section "2/4 — Parametri di esposizione"
# ─────────────────────────────────────────────────────────────────────────────
BASE_DOMAIN="${BASE_DOMAIN:-$(ask "Dominio base (es: bikerlink.app)")}"
[[ -n "$BASE_DOMAIN" ]] || die "Dominio base obbligatorio."
[[ "$BASE_DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] \
  || warn "Il dominio '$BASE_DOMAIN' non sembra valido: procedo comunque."

APP_ORIGIN="${APP_ORIGIN:-$(ask "Origin web autorizzato per CORS" "https://${BASE_DOMAIN}")}"
TUNNEL_UUID="${TUNNEL_UUID:-$(ask "Tunnel UUID Cloudflare (vuoto se usi solo Nginx)")}"

ok "Dominio:     $BASE_DOMAIN"
ok "App origin:  $APP_ORIGIN"
if [[ -n "$TUNNEL_UUID" ]]; then
  ok "Tunnel UUID: $TUNNEL_UUID"
else
  warn "Tunnel UUID non fornito: il file cloudflared resterà con __TUNNEL_UUID__ da compilare."
fi

# ─────────────────────────────────────────────────────────────────────────────
section "3/4 — Token e validazione con .env.local"
# ─────────────────────────────────────────────────────────────────────────────
# Risolve un token: usa la variabile d'ambiente se passata, altrimenti il valore
# del .env.local; se entrambi mancano/placeholder lo chiede all'utente.
resolve_token() {
  local name="$1" env_val="$2" provided="${3:-}" resolved
  if [[ -n "$provided" ]]; then
    resolved="$provided"
  elif [[ -n "$env_val" && "$env_val" != "$PLACEHOLDER_VALUE" ]]; then
    resolved="$env_val"
  else
    resolved="$(ask "Inserisci ${name}")"
  fi
  printf '%s' "$resolved"
}

GH_TOKEN="$(resolve_token "GRAPHHOPPER_TOKEN" "$ENV_GH_TOKEN" "${GRAPHHOPPER_TOKEN:-}")"
VALHALLA_KEY="$(resolve_token "VALHALLA_API_KEY" "$ENV_VALHALLA_KEY" "${VALHALLA_API_KEY:-}")"

[[ -n "$GH_TOKEN" && "$GH_TOKEN" != "$PLACEHOLDER_VALUE" ]] \
  || die "GRAPHHOPPER_TOKEN mancante. Generane uno con: openssl rand -base64 32"
[[ -n "$VALHALLA_KEY" && "$VALHALLA_KEY" != "$PLACEHOLDER_VALUE" ]] \
  || die "VALHALLA_API_KEY mancante. Generane uno con: openssl rand -base64 32"

# Validazione: i token usati devono coincidere con quelli del .env.local
# (se presenti e valorizzati). Disabilitabile con SKIP_TOKEN_VALIDATION=1.
validate_token() {
  local name="$1" used="$2" env_val="$3"
  if [[ -z "$env_val" || "$env_val" == "$PLACEHOLDER_VALUE" ]]; then
    warn "${name} non valorizzato nel .env.local: salto la validazione di coincidenza."
    return 0
  fi
  if [[ "$used" == "$env_val" ]]; then
    ok "${name} coincide con .env.local"
  else
    if [[ "${SKIP_TOKEN_VALIDATION:-0}" == "1" ]]; then
      warn "${name} NON coincide con .env.local (validazione ignorata: SKIP_TOKEN_VALIDATION=1)."
    else
      die "${name} non coincide con .env.local. Il proxy e l'app userebbero token diversi (401).
       Allinea i valori o riesegui con SKIP_TOKEN_VALIDATION=1 per forzare."
    fi
  fi
}

validate_token "GRAPHHOPPER_TOKEN" "$GH_TOKEN" "$ENV_GH_TOKEN"
validate_token "VALHALLA_API_KEY"  "$VALHALLA_KEY" "$ENV_VALHALLA_KEY"

# ─────────────────────────────────────────────────────────────────────────────
section "4/4 — Generazione config compilati"
# ─────────────────────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"

E_BASE_DOMAIN="$(sed_escape "$BASE_DOMAIN")"
E_APP_ORIGIN="$(sed_escape "$APP_ORIGIN")"
E_GH_TOKEN="$(sed_escape "$GH_TOKEN")"
E_VALHALLA_KEY="$(sed_escape "$VALHALLA_KEY")"
E_TUNNEL_UUID="$(sed_escape "${TUNNEL_UUID:-__TUNNEL_UUID__}")"

# Nginx
sed \
  -e "s#__BASE_DOMAIN__#${E_BASE_DOMAIN}#g" \
  -e "s#__APP_ORIGIN__#${E_APP_ORIGIN}#g" \
  -e "s#__GH_TOKEN__#${E_GH_TOKEN}#g" \
  -e "s#__VALHALLA_KEY__#${E_VALHALLA_KEY}#g" \
  "$NGINX_TEMPLATE" > "$NGINX_OUT"
chmod 600 "$NGINX_OUT"
ok "Generato $NGINX_OUT"

# Cloudflared
sed \
  -e "s#__TUNNEL_UUID__#${E_TUNNEL_UUID}#g" \
  -e "s#__BASE_DOMAIN__#${E_BASE_DOMAIN}#g" \
  "$CLOUDFLARED_TEMPLATE" > "$CLOUDFLARED_OUT"
chmod 600 "$CLOUDFLARED_OUT"
ok "Generato $CLOUDFLARED_OUT"

# Avviso se restano segnaposto non risolti (es. TUNNEL_UUID lasciato vuoto).
if grep -q "__[A-Z_]*__" "$NGINX_OUT" "$CLOUDFLARED_OUT" 2>/dev/null; then
  warn "Restano segnaposto non risolti nei file generati:"
  grep -ho "__[A-Z_]*__" "$NGINX_OUT" "$CLOUDFLARED_OUT" | sort -u | sed 's/^/      /'
fi

cat <<EOF

$(bold "Config pronti in: ${OUT_DIR}")

$(bold "Nginx + Let's Encrypt")
  sudo cp ${NGINX_OUT} /etc/nginx/sites-available/bikerlink
  sudo ln -sf /etc/nginx/sites-available/bikerlink /etc/nginx/sites-enabled/
  sudo certbot --nginx -d gh.${BASE_DOMAIN} -d valhalla.${BASE_DOMAIN}
  sudo nginx -t && sudo systemctl reload nginx

$(bold "Cloudflare Tunnel")
  sudo cp ${CLOUDFLARED_OUT} /etc/cloudflared/config.yml
  sudo cloudflared service install
  sudo systemctl enable --now cloudflared

$(bold "Nota")
  I file contengono i token in chiaro (chmod 600). NON committarli.
  La cartella generated/ è ignorata da git.

EOF
ok "Fatto."
