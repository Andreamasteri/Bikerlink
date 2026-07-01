#!/usr/bin/env bash
# =============================================================================
# setup-cloudflared-redis-tunnel.sh  (Task #5261)
#
# Costruisce il PATH PRIVATO TCP da Replit Cloud al DragonflyDB del ThinkCentre
# usando Cloudflare Tunnel + Cloudflare Access (NON un hostname HTTP pubblico).
#
# Cosa fa, via Cloudflare API (idempotente — rieseguibile senza effetti doppi):
#   1. Aggiunge al tunnel del ThinkCentre una regola ingress TCP:
#        <REDIS_HOSTNAME>  ->  tcp://127.0.0.1:6379
#      (inserita PRIMA del catch-all http_status:404).
#   2. Crea il record DNS  <REDIS_SUBDOMAIN>  ->  <tunnel>.cfargotunnel.com  (proxied).
#   3. Crea un'applicazione Cloudflare Access self-hosted su <REDIS_HOSTNAME>
#      protetta da una policy `non_identity` che ammette SOLO il service token
#      esistente (lo stesso usato per gh/valhalla/...).
#
# Dal lato Replit, il bridge è server/cache/redis-tunnel.ts: esegue
#   cloudflared access tcp --hostname <REDIS_HOSTNAME> --url 127.0.0.1:16379
# e si autentica all'edge con CF_ACCESS_CLIENT_ID/SECRET. Dopodiché:
#   TC_DRAGONFLY_URL=redis://:<password>@127.0.0.1:16379   (in chiaro su localhost)
#   REDIS_PROBE_HOST=127.0.0.1   REDIS_PROBE_PORT=16379
#
# Requisiti:
#   - CF_API_TOKEN con permessi: Account › Cloudflare Tunnel:Edit,
#     Account › Access: Apps and Policies:Edit, Zone › DNS:Edit.
#   - jq, curl.
#
# Uso:
#   CF_API_TOKEN=... bash scripts/setup-cloudflared-redis-tunnel.sh
#   (opzionale) DRY_RUN=1 per stampare le azioni senza applicarle.
# =============================================================================

set -euo pipefail

# ── Parametri (override via env) ─────────────────────────────────────────────
CF_ACCOUNT_ID="${CF_ACCOUNT_ID:-d116d3d97b133c543d02934be4bc98d2}"
CF_ZONE_ID="${CF_ZONE_ID:-e2ced3f458b06555c6c8e8a403f4b489}"
CF_TUNNEL_ID="${CF_TUNNEL_ID:-86122511-2752-4002-aec9-1fdd7c25b9f5}"
BASE_DOMAIN="${BASE_DOMAIN:-biker-link.net}"
REDIS_SUBDOMAIN="${REDIS_SUBDOMAIN:-redis-tc}"
REDIS_HOSTNAME="${REDIS_HOSTNAME:-${REDIS_SUBDOMAIN}.${BASE_DOMAIN}}"
REDIS_ORIGIN="${REDIS_ORIGIN:-tcp://127.0.0.1:6379}"
SERVICE_TOKEN_NAME="${SERVICE_TOKEN_NAME:-bikerlink-tc-access}"
DRY_RUN="${DRY_RUN:-0}"

API="https://api.cloudflare.com/client/v4"

# ── Helper ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERR]${NC}  $*" >&2; }

require() { command -v "$1" >/dev/null 2>&1 || { error "$1 non trovato — installalo prima di proseguire"; exit 1; }; }
require jq
require curl

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  error "CF_API_TOKEN non impostata. Esegui: CF_API_TOKEN=... bash $0"
  exit 1
fi

cf() {
  # cf METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "${API}${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$body"
  else
    curl -fsS -X "$method" "${API}${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

dry() { [[ "$DRY_RUN" == "1" ]]; }

echo ""
info "=== Setup Cloudflare Redis TCP path (BikerLink — Task #5261) ==="
info "  Account:   ${CF_ACCOUNT_ID}"
info "  Zone:      ${CF_ZONE_ID} (${BASE_DOMAIN})"
info "  Tunnel:    ${CF_TUNNEL_ID}"
info "  Hostname:  ${REDIS_HOSTNAME}  ->  ${REDIS_ORIGIN}"
info "  Token:     ${SERVICE_TOKEN_NAME}"
dry && warn "DRY_RUN=1 — nessuna modifica verrà applicata."
echo ""

# ── 1. Ingress TCP sul tunnel ────────────────────────────────────────────────
info "Step 1/3 — Regola ingress TCP del tunnel"
CFG=$(cf GET "/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${CF_TUNNEL_ID}/configurations")
CONFIG=$(echo "$CFG" | jq '.result.config')

if echo "$CONFIG" | jq -e --arg h "$REDIS_HOSTNAME" '.ingress[]? | select(.hostname==$h)' >/dev/null; then
  success "Ingress per ${REDIS_HOSTNAME} già presente — skip."
else
  # Inserisce la nuova regola PRIMA del catch-all (l'ultima regola senza hostname).
  NEW_CONFIG=$(echo "$CONFIG" | jq \
    --arg h "$REDIS_HOSTNAME" --arg svc "$REDIS_ORIGIN" '
    .ingress as $ing
    | ($ing | length) as $n
    | .ingress = ($ing[0:($n-1)] + [{"hostname":$h,"service":$svc}] + $ing[($n-1):])
  ')
  if dry; then
    warn "DRY_RUN — config tunnel che verrebbe applicata:"; echo "$NEW_CONFIG" | jq '.ingress'
  else
    cf PUT "/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${CF_TUNNEL_ID}/configurations" \
      "$(jq -nc --argjson c "$NEW_CONFIG" '{config:$c}')" >/dev/null
    success "Ingress TCP aggiunta: ${REDIS_HOSTNAME} -> ${REDIS_ORIGIN}"
  fi
fi

# ── 2. Record DNS CNAME -> cfargotunnel.com ──────────────────────────────────
info "Step 2/3 — Record DNS ${REDIS_HOSTNAME}"
CNAME_TARGET="${CF_TUNNEL_ID}.cfargotunnel.com"
EXISTING_DNS=$(cf GET "/zones/${CF_ZONE_ID}/dns_records?type=CNAME&name=${REDIS_HOSTNAME}")
if echo "$EXISTING_DNS" | jq -e '.result | length > 0' >/dev/null; then
  success "DNS ${REDIS_HOSTNAME} già presente — skip."
else
  DNS_BODY=$(jq -nc --arg name "$REDIS_HOSTNAME" --arg content "$CNAME_TARGET" \
    '{type:"CNAME",name:$name,content:$content,proxied:true,comment:"Task #5261 Redis TCP via cloudflared access"}')
  if dry; then
    warn "DRY_RUN — DNS che verrebbe creato:"; echo "$DNS_BODY" | jq .
  else
    cf POST "/zones/${CF_ZONE_ID}/dns_records" "$DNS_BODY" >/dev/null
    success "DNS CNAME creato: ${REDIS_HOSTNAME} -> ${CNAME_TARGET} (proxied)"
  fi
fi

# ── 3. Applicazione + policy Cloudflare Access ───────────────────────────────
info "Step 3/3 — Applicazione Cloudflare Access (service-token only)"

# Scopre l'id del service token esistente (riuso, NON ne creiamo uno nuovo).
TOKENS=$(cf GET "/accounts/${CF_ACCOUNT_ID}/access/service_tokens")
TOKEN_ID=$(echo "$TOKENS" | jq -r --arg n "$SERVICE_TOKEN_NAME" \
  '.result[]? | select(.name==$n) | .id' | head -1)
if [[ -z "$TOKEN_ID" || "$TOKEN_ID" == "null" ]]; then
  error "Service token '${SERVICE_TOKEN_NAME}' non trovato sull'account. Crealo prima (o passa SERVICE_TOKEN_NAME)."
  exit 1
fi
success "Service token trovato: ${SERVICE_TOKEN_NAME} (${TOKEN_ID})"

APPS=$(cf GET "/accounts/${CF_ACCOUNT_ID}/access/apps")
APP_ID=$(echo "$APPS" | jq -r --arg d "$REDIS_HOSTNAME" \
  '.result[]? | select(.domain==$d) | .id' | head -1)

if [[ -n "$APP_ID" && "$APP_ID" != "null" ]]; then
  success "Access app per ${REDIS_HOSTNAME} già presente (${APP_ID}) — skip creazione."
else
  APP_BODY=$(jq -nc --arg name "BikerLink Redis (TC)" --arg domain "$REDIS_HOSTNAME" --arg tid "$TOKEN_ID" '{
    name:$name, domain:$domain, type:"self_hosted", session_duration:"24h",
    app_launcher_visible:false,
    policies:[{
      name:"redis-service-token", decision:"non_identity", precedence:1,
      include:[{ service_token:{ token_id:$tid } }]
    }]
  }')
  if dry; then
    warn "DRY_RUN — Access app che verrebbe creata:"; echo "$APP_BODY" | jq .
  else
    APP_ID=$(cf POST "/accounts/${CF_ACCOUNT_ID}/access/apps" "$APP_BODY" | jq -r '.result.id')
    success "Access app creata: ${REDIS_HOSTNAME} (${APP_ID}), policy non_identity service-token."
  fi
fi

echo ""
success "=== Path Cloudflare Redis TCP configurato ==="
echo ""
echo "  Imposta i secret Replit (Tools › Secrets) — il <password> è la stessa già"
echo "  in uso nel TC_DRAGONFLY_URL attuale (DragonflyDB --requirepass):"
echo ""
echo "    TC_DRAGONFLY_URL      = redis://:<password>@127.0.0.1:16379"
echo "    REDIS_TUNNEL_HOSTNAME = ${REDIS_HOSTNAME}"
echo "    REDIS_PROBE_HOST  = 127.0.0.1"
echo "    REDIS_PROBE_PORT  = 16379"
echo ""
echo "  Verifica/imposta anche le credenziali del service token (le stesse usate"
echo "  dagli altri servizi TC — gh/valhalla/...): CF_ACCESS_CLIENT_ID (formato"
echo "  '<uuid>.access') e CF_ACCESS_CLIENT_SECRET. Se non sono ancora nei secret,"
echo "  vanno aggiunte ora — il bridge non parte senza."
echo "  Dopodiché: Publish → in produzione il bridge cloudflared parte al boot e"
echo "  l'admin dashboard mostrerà ping/RAM Redis live via il path privato."
echo ""
