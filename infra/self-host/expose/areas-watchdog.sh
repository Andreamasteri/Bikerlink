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
#
# EVENTS FILE: ogni avvio/stop di container viene scritto in AREAS_EVENTS_FILE
# (default /var/lib/bikerlink/watchdog-events.jsonl) come riga JSON:
#   {"ts":"2026-06-07T10:00:00Z","code":"grecia","action":"start","reason":"enabled→up"}
# Il collector areas-metrics.py legge gli ultimi N eventi per esporli nella relay.
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

# File JSONL dove vengono registrati gli eventi start/stop container.
# Leggibile da areas-metrics.py per esporli nella relay metriche.
AREAS_EVENTS_FILE="${AREAS_EVENTS_FILE:-/var/lib/bikerlink/watchdog-events.jsonl}"
# Numero massimo di righe da tenere nel file (ruota per troncamento).
EVENTS_MAX_LINES=200

# Tutti i codici area validi (sync con shared/routing-areas.ts).
ALL_CODES="grecia balcani est iberia arco-alpino germania-centro francia-benelux ecuador"

ts()      { date '+%Y-%m-%d %H:%M:%S'; }
ts_iso()  { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log()     { echo "[areas-watchdog] $(ts) $*"; }
err()     { echo "[areas-watchdog] $(ts) ERRORE: $*" >&2; }

# Scrive un evento nel file JSONL (crea la dir se necessario; ruota se troppo lungo).
# Usage: write_event <code> <action> <reason>
write_event() {
  local code="$1" action="$2" reason="$3"
  local dir
  dir="$(dirname "$AREAS_EVENTS_FILE")"
  if [[ ! -d "$dir" ]]; then
    mkdir -p "$dir" 2>/dev/null || { err "impossibile creare dir eventi: $dir"; return; }
  fi
  # Riga JSON su una riga sola (no jq richiesto).
  local ts_val
  ts_val="$(ts_iso)"
  # Escaping manuale dei caratteri speciali nelle stringhe (code/action/reason
  # sono valori controllati, ma sanitizziamo per sicurezza).
  local esc_code esc_action esc_reason
  esc_code="${code//\"/\\\"}"
  esc_action="${action//\"/\\\"}"
  esc_reason="${reason//\"/\\\"}"
  printf '{"ts":"%s","code":"%s","action":"%s","reason":"%s"}\n' \
    "$ts_val" "$esc_code" "$esc_action" "$esc_reason" \
    >> "$AREAS_EVENTS_FILE" 2>/dev/null || { err "impossibile scrivere in $AREAS_EVENTS_FILE"; return; }
  # Ruota se supera il limite: mantieni solo le ultime EVENTS_MAX_LINES righe.
  local line_count
  line_count="$(wc -l < "$AREAS_EVENTS_FILE" 2>/dev/null || echo 0)"
  if [[ "$line_count" -gt "$EVENTS_MAX_LINES" ]]; then
    local tmp
    tmp="$(mktemp)"
    tail -n "$EVENTS_MAX_LINES" "$AREAS_EVENTS_FILE" > "$tmp" && mv "$tmp" "$AREAS_EVENTS_FILE"
  fi
}

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
      if dc up -d "graphhopper-${code}"; then
        CHANGED=1
        write_event "$code" "start" "abilitata→avvio"
      else
        err "avvio '$code' fallito"
        write_event "$code" "start_failed" "avvio fallito"
      fi
    fi
  else
    if is_running "$code"; then
      log "area '$code' DISABILITATA ma su → spengo container"
      if dc stop "graphhopper-${code}"; then
        CHANGED=1
        write_event "$code" "stop" "disabilitata→spento"
      else
        err "stop '$code' fallito"
        write_event "$code" "stop_failed" "stop fallito"
      fi
    fi
  fi
done <<< "$STATES"

if [[ "$CHANGED" -eq 0 ]]; then
  log "nessun cambiamento necessario — stato già allineato."
else
  log "sincronizzazione completata."
fi
