#!/usr/bin/env bash
# =============================================================================
# BikerLink — areas-watchdog.sh
# Sincronizza le istanze GraphHopper-area (docker-compose) con lo stato
# "abilitato" deciso dall'app cloud. Accende i container delle aree abilitate e
# spegne quelli delle aree disabilitate, per liberare RAM sul ThinkCentre.
#
# Flusso:
#   1. GET <APP_AREAS_URL> con header X-GH-Token → JSON contratto:
#        { "areas": [ { "code": "grecia", "enabled": true }, ... ] }
#      (endpoint fornito dal server app — Task B; finché non esiste, il watchdog
#       logga l'errore e NON tocca i container, così non spegne nulla per sbaglio.)
#   2. Per ogni area:
#        enabled=true  e container giù  → docker compose up -d graphhopper-<code>
#        enabled=false e container su   → docker compose stop  graphhopper-<code>
#
# Uso (systemd timer ogni 1 min: areas-watchdog.timer):
#   APP_AREAS_URL=https://bikerlink.app/api/routing/areas/status \
#   GH_TOKEN=<token> ./areas-watchdog.sh
#
# Oppure /etc/bikerlink-areas.env con APP_AREAS_URL / GH_TOKEN / COMPOSE_DIR.
# Log: journalctl -u areas-watchdog.service -n 50
# =============================================================================
set -uo pipefail

ENV_FILE="${AREAS_ENV_FILE:-/etc/bikerlink-areas.env}"
if [[ -r "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a; source "$ENV_FILE"; set +a
fi

# Cartella con il docker-compose.yml dello stack self-host.
COMPOSE_DIR="${COMPOSE_DIR:-/opt/bikerlink/self-host}"
APP_AREAS_URL="${APP_AREAS_URL:-}"
GH_TOKEN="${GH_TOKEN:-}"

# Tutti i codici area validi (sync con shared/routing-areas.ts).
ALL_CODES="grecia balcani est iberia arco-alpino germania-centro francia-benelux"

ts()  { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[areas-watchdog] $(ts) $*"; }
err() { echo "[areas-watchdog] $(ts) ERRORE: $*" >&2; }

command -v docker >/dev/null 2>&1 || { err "'docker' non installato."; exit 1; }
command -v curl   >/dev/null 2>&1 || { err "'curl' non installato.";   exit 1; }
[[ -n "$APP_AREAS_URL" ]] || { err "APP_AREAS_URL non impostata (vedi $ENV_FILE)."; exit 1; }
[[ -f "${COMPOSE_DIR}/docker-compose.yml" ]] || { err "docker-compose.yml non trovato in $COMPOSE_DIR"; exit 1; }

# jq è opzionale: se assente, fallback a grep/sed sul JSON.
HAS_JQ=0
command -v jq >/dev/null 2>&1 && HAS_JQ=1

dc() { docker compose -f "${COMPOSE_DIR}/docker-compose.yml" "$@"; }

# Vero se il container dell'area è in esecuzione.
is_running() {
  local code="$1"
  [[ "$(docker inspect -f '{{.State.Running}}' "bikerlink-gh-${code}" 2>/dev/null)" == "true" ]]
}

# ── Recupera lo stato abilitato dall'app ─────────────────────────────────────
log "polling ${APP_AREAS_URL}"
RESPONSE="$(curl -fsS --max-time 15 -H "X-GH-Token: ${GH_TOKEN}" "$APP_AREAS_URL" 2>/dev/null)" || {
  err "richiesta allo stato aree fallita — NON modifico i container (fail-safe)."
  exit 1
}

# Estrae "code:enabled" per ogni area dal JSON.
parse_states() {
  if [[ "$HAS_JQ" -eq 1 ]]; then
    echo "$RESPONSE" | jq -r '.areas[] | "\(.code):\(.enabled)"' 2>/dev/null
  else
    # Fallback grezzo: cerca coppie code/enabled vicine nel JSON minificato.
    echo "$RESPONSE" \
      | tr -d ' \n' \
      | grep -oE '"code":"[^"]+","enabled":(true|false)' \
      | sed -E 's/"code":"([^"]+)","enabled":(true|false)/\1:\2/'
  fi
}

STATES="$(parse_states)"
if [[ -z "$STATES" ]]; then
  err "risposta senza aree interpretabili — NON modifico i container. Payload: ${RESPONSE:0:200}"
  exit 1
fi

CHANGED=0
while IFS=: read -r code enabled; do
  [[ -z "$code" ]] && continue
  if ! echo "$ALL_CODES" | grep -qw "$code"; then
    err "codice area sconosciuto dall'app: '$code' — ignorato."
    continue
  fi

  if [[ "$enabled" == "true" ]]; then
    if is_running "$code"; then
      : # già su
    else
      log "area '$code' ABILITATA ma giù → avvio container"
      if dc up -d "graphhopper-${code}"; then CHANGED=1; else err "avvio '$code' fallito"; fi
    fi
  else
    if is_running "$code"; then
      log "area '$code' DISABILITATA ma su → spengo container"
      if dc stop "graphhopper-${code}"; then CHANGED=1; else err "stop '$code' fallito"; fi
    fi
  fi
done <<< "$STATES"

if [[ "$CHANGED" -eq 0 ]]; then
  log "nessun cambiamento necessario — stato già allineato."
else
  log "sincronizzazione completata."
fi
