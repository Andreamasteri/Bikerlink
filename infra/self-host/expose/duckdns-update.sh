#!/usr/bin/env bash
# ⚠️ OBSOLETO — DuckDNS disabilitato il 29 Giugno 2026.
# Il ThinkCentre usa ora Cloudflare Tunnel su *.biker-link.net.
# Questo script non va eseguito in produzione.
#
# =============================================================================
# BikerLink — duckdns-update.sh
# Aggiorna l'IP del sottodominio DuckDNS chiamando l'API ufficiale.
#
# Uso:
#   DUCKDNS_TOKEN=<token> DUCKDNS_DOMAIN=bikerlink ./duckdns-update.sh
#
# Oppure crea un file /etc/duckdns.env con:
#   DUCKDNS_TOKEN=xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
#   DUCKDNS_DOMAIN=bikerlink           # solo il sottodominio, senza .duckdns.org
#
# Il systemd timer (duckdns.timer) esegue questo script ogni 5 minuti.
# Log: journalctl -u duckdns.service -n 20
# =============================================================================
set -euo pipefail

ENV_FILE="${DUCKDNS_ENV_FILE:-/etc/duckdns.env}"

# Carica le variabili dal file .env se presenti e non già impostate nell'env.
if [[ -r "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi

# ── Validazione ───────────────────────────────────────────────────────────────
if [[ -z "${DUCKDNS_TOKEN:-}" ]]; then
  echo "[duckdns] ERRORE: variabile DUCKDNS_TOKEN non impostata." >&2
  echo "          Imposta DUCKDNS_TOKEN nell'env o in $ENV_FILE" >&2
  exit 1
fi

if [[ -z "${DUCKDNS_DOMAIN:-}" ]]; then
  echo "[duckdns] ERRORE: variabile DUCKDNS_DOMAIN non impostata." >&2
  echo "          Es: DUCKDNS_DOMAIN=bikerlink  (solo il sottodominio)" >&2
  exit 1
fi

# ── Chiamata API DuckDNS ──────────────────────────────────────────────────────
# Supporta più sottodomini separati da virgola (es. DUCKDNS_DOMAIN=bikerlink,bikerlink-test).
RESPONSE="$(curl -fsSL \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=" \
  2>&1)"

TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

if [[ "$RESPONSE" == "OK" ]]; then
  echo "[duckdns] $TIMESTAMP — IP aggiornato OK (dominio: ${DUCKDNS_DOMAIN}.duckdns.org)"
elif [[ "$RESPONSE" == "NOCHANGE" ]]; then
  echo "[duckdns] $TIMESTAMP — Nessun cambio IP (dominio: ${DUCKDNS_DOMAIN}.duckdns.org)"
else
  echo "[duckdns] $TIMESTAMP — ERRORE risposta API: $RESPONSE" >&2
  exit 1
fi
