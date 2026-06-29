#!/usr/bin/env bash
# ⚠️ OBSOLETO — nginx e DuckDNS disabilitati il 29 Giugno 2026.
# Il ThinkCentre usa ora Cloudflare Tunnel su *.biker-link.net.
# Questo script non va più eseguito in produzione.
#
# =============================================================================
# BikerLink — Aggiungi tc.bikerlink.duckdns.org al certificato TLS e nginx
#
# Eseguire sul ThinkCentre come root DOPO aver:
#   1. Aggiunto il sottodominio "tc" su DuckDNS (stesso IP degli altri)
#   2. Fermato temporaneamente nginx (certbot standalone ha bisogno della 443)
#
#   sudo bash scripts/setup-nginx-tc-metrics.sh
#
# Cosa fa:
#   - Espande il certificato bikerlink per includere tc.bikerlink.duckdns.org
#   - Copia il nuovo nginx-bikerlink.conf con il server block tc
#   - Ricarica nginx
# =============================================================================

set -euo pipefail

echo "ERRORE: Questo script è OBSOLETO. nginx e DuckDNS sono stati disabilitati il 29 Giugno 2026." >&2
echo "Il ThinkCentre usa Cloudflare Tunnel su *.biker-link.net. Non eseguire questo script." >&2
exit 1

DOMAIN="tc.bikerlink.duckdns.org"
BASE_DOMAIN="bikerlink.duckdns.org"
CERT_NAME="bikerlink"
NGINX_CONF_SRC="infra/self-host/expose/nginx-bikerlink.conf"
NGINX_CONF_DST="/etc/nginx/sites-enabled/bikerlink"
TC_AGENT_TOKEN="${THINKCENTRE_AGENT_TOKEN:-}"

echo "=== BikerLink — Setup tc.$BASE_DOMAIN ==="
echo ""

if [[ $EUID -ne 0 ]]; then
    echo "ERRORE: eseguire come root (sudo)." >&2
    exit 1
fi

# --- 1. Verifica che il sottodominio tc risponda ─────────────────────────────
echo "[1/5] Verifica DNS tc.${BASE_DOMAIN}..."
if ! host "tc.${BASE_DOMAIN}" &>/dev/null; then
    echo "    ATTENZIONE: DNS non risolve ancora. Aggiungi 'tc' su duckdns.org"
    echo "    e aspetta qualche minuto prima di proseguire."
    echo "    Continuo comunque (certbot verificherà lui stesso)."
fi

# --- 2. Espandi il certificato bikerlink per tc ───────────────────────────────
echo "[2/5] Espansione certificato '$CERT_NAME' per $DOMAIN..."
# Recupera la lista attuale di domini nel certificato
CURRENT_DOMAINS=$(certbot certificates --cert-name "$CERT_NAME" 2>/dev/null \
    | grep -oP '(?<=Domains: ).*' | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ $//')
echo "    Domini attuali: $CURRENT_DOMAINS"

if echo "$CURRENT_DOMAINS" | grep -q "$DOMAIN"; then
    echo "    OK — $DOMAIN è già nel certificato."
else
    echo "    Espansione con --expand..."
    # Costruisce la lista -d per certbot (tutti i vecchi + il nuovo)
    D_ARGS=""
    for d in $CURRENT_DOMAINS; do D_ARGS="$D_ARGS -d $d"; done
    D_ARGS="$D_ARGS -d $DOMAIN"

    # Usa --nginx per il challenge (nginx deve essere attivo)
    # shellcheck disable=SC2086
    certbot certonly --nginx --cert-name "$CERT_NAME" --expand \
        --non-interactive --agree-tos --register-unsafely-without-email \
        $D_ARGS
    echo "    OK — certificato espanso."
fi

# --- 3. Genera token se non fornito ──────────────────────────────────────────
echo "[3/5] Token agente ThinkCentre..."
if [[ -z "$TC_AGENT_TOKEN" ]]; then
    TC_AGENT_TOKEN=$(openssl rand -hex 24)
    echo ""
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │  NUOVO TOKEN GENERATO — aggiungi questi secret su Replit:   │"
    echo "  │                                                             │"
    echo "  │  THINKCENTRE_AGENT_TOKEN = $TC_AGENT_TOKEN  │"
    echo "  │  THINKCENTRE_METRICS_URL = https://$DOMAIN  │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
else
    echo "    Uso THINKCENTRE_AGENT_TOKEN dall'ambiente."
fi

# --- 4. Copia nginx config con segnaposti sostituiti ─────────────────────────
echo "[4/5] Aggiornamento nginx config..."
if [[ ! -f "$NGINX_CONF_SRC" ]]; then
    echo "    ERRORE: file sorgente non trovato: $NGINX_CONF_SRC"
    echo "    Esegui da dentro la directory del repo BikerLink."
    exit 1
fi

# Recupera i token dagli altri file di config (se già configurati)
GH_TOKEN="${GRAPHHOPPER_TOKEN:-__GH_TOKEN__}"
VALHALLA_KEY="${VALHALLA_API_KEY:-__VALHALLA_KEY__}"
OLLAMA_TOKEN="${OLLAMA_TOKEN:-__OLLAMA_TOKEN__}"
WHISPER_TOKEN="${WHISPER_TOKEN:-__WHISPER_TOKEN__}"
NOMINATIM_TOKEN="${NOMINATIM_TOKEN:-__NOMINATIM_TOKEN__}"
APP_ORIGIN="${APP_ORIGIN:-https://bikerlink.app}"

sed \
    -e "s|__BASE_DOMAIN__|$BASE_DOMAIN|g" \
    -e "s|__GH_TOKEN__|$GH_TOKEN|g" \
    -e "s|__VALHALLA_KEY__|$VALHALLA_KEY|g" \
    -e "s|__OLLAMA_TOKEN__|$OLLAMA_TOKEN|g" \
    -e "s|__WHISPER_TOKEN__|$WHISPER_TOKEN|g" \
    -e "s|__NOMINATIM_TOKEN__|$NOMINATIM_TOKEN|g" \
    -e "s|__TC_AGENT_TOKEN__|$TC_AGENT_TOKEN|g" \
    -e "s|__APP_ORIGIN__|$APP_ORIGIN|g" \
    "$NGINX_CONF_SRC" > "$NGINX_CONF_DST"

echo "    OK — config scritta in $NGINX_CONF_DST"

# --- 5. Testa e ricarica nginx ────────────────────────────────────────────────
echo "[5/5] Verifica e reload nginx..."
nginx -t
systemctl reload nginx
echo "    OK — nginx ricaricato."

echo ""
echo "==================================================="
echo "  Setup completato!"
echo "==================================================="
echo ""
echo "  Verifica la connessione:"
echo "  curl -s -H 'X-Agent-Token: $TC_AGENT_TOKEN' \\"
echo "       https://$DOMAIN/sys-metrics | jq ."
echo ""
echo "  Deve rispondere con CPU/RAM/uptime del ThinkCentre."
echo ""
echo "  Poi aggiorna i secret su Replit:"
echo "    THINKCENTRE_METRICS_URL = https://$DOMAIN"
echo "    THINKCENTRE_AGENT_TOKEN = $TC_AGENT_TOKEN"
echo ""
echo "  E riavvia il backend Replit."
echo "==================================================="
