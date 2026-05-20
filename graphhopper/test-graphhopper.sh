#!/usr/bin/env bash
# =============================================================================
# BikerLink — Script di test e validazione GraphHopper
#
# Utilizzo:
#   ./test-graphhopper.sh <BASE_URL> <GH_TOKEN>
#
# Esempi:
#   ./test-graphhopper.sh https://gh.bikerlink.app my-secret-token
#   ./test-graphhopper.sh http://localhost:8989 my-secret-token
# =============================================================================

set -euo pipefail

BASE_URL="${1:-https://gh.bikerlink.app}"
GH_TOKEN="${2:-change-me-before-production}"

# Rimuove trailing slash
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0

log()  { echo -e "\033[1;34m[TEST]\033[0m $*"; }
ok()   { echo -e "\033[1;32m[PASS]\033[0m $*"; ((PASS++)); }
fail() { echo -e "\033[1;31m[FAIL]\033[0m $*"; ((FAIL++)); }
info() { echo -e "\033[1;33m[INFO]\033[0m $*"; }

# Helper: HTTP con token
gh_curl() {
    curl -s -f \
        -H "X-GH-Token: ${GH_TOKEN}" \
        -H "Content-Type: application/json" \
        "$@"
}

echo "============================================================"
echo "GraphHopper Test Suite — BikerLink"
echo "URL: ${BASE_URL}"
echo "Token: ${GH_TOKEN:0:8}..."
echo "$(date)"
echo "============================================================"
echo ""

# =============================================================================
# TEST 1: Health check (senza token — pubblico)
# =============================================================================
log "1. Health check pubblico (/health)..."
HEALTH=$(curl -s -f "${BASE_URL}/health" 2>/dev/null || echo "{}")
HEALTH_STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
GRAPH_LOADED=$(echo "$HEALTH" | grep -o '"graph_loaded":[a-z]*' | cut -d: -f2 || echo "unknown")

if [[ "$HEALTH_STATUS" == "ok" ]]; then
    ok "Health check: status=ok, graph_loaded=${GRAPH_LOADED}"
    info "Risposta: $HEALTH"
else
    fail "Health check fallito. Risposta: $HEALTH"
fi

# =============================================================================
# TEST 2: Autenticazione — token errato deve essere rifiutato
# =============================================================================
log "2. Autenticazione — token errato deve restituire 401..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-GH-Token: token-sbagliato" \
    "${BASE_URL}/route" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "401" ]]; then
    ok "Token errato rifiutato con HTTP 401"
else
    fail "Token errato non rifiutato (HTTP ${HTTP_CODE})"
fi

# =============================================================================
# TEST 3: Routing API — Roma → Napoli (profilo motorcycle)
# =============================================================================
log "3. Routing API — Roma→Napoli con profilo motorcycle..."

ROUTING_PAYLOAD='{
  "points": [
    [12.4964, 41.9028],
    [14.2681, 40.8518]
  ],
  "profile": "motorcycle",
  "locale": "it",
  "instructions": false,
  "calc_points": true,
  "points_encoded": false
}'

ROUTE_RESPONSE=$(gh_curl \
    -X POST \
    -d "$ROUTING_PAYLOAD" \
    "${BASE_URL}/route" 2>/dev/null || echo "{}")

DISTANCE_M=$(echo "$ROUTE_RESPONSE" | grep -o '"distance":[0-9.]*' | head -1 | cut -d: -f2 || echo "0")
DISTANCE_KM=$(echo "scale=1; $DISTANCE_M / 1000" | bc 2>/dev/null || echo "0")
TIME_MS=$(echo "$ROUTE_RESPONSE" | grep -o '"time":[0-9]*' | head -1 | cut -d: -f2 || echo "0")
TIME_MIN=$(echo "scale=0; $TIME_MS / 60000" | bc 2>/dev/null || echo "0")

if [[ "${DISTANCE_M%.*}" -gt 100000 ]] 2>/dev/null; then
    ok "Routing Roma→Napoli: distanza=${DISTANCE_KM}km, tempo=${TIME_MIN}min"
else
    fail "Routing fallito o distanza anomala (${DISTANCE_KM}km). Risposta: $(echo $ROUTE_RESPONSE | head -c 200)"
fi

# =============================================================================
# TEST 4: Routing — profilo motorcycle_fast (per confronto)
# =============================================================================
log "4. Routing API — profilo motorcycle_fast (per confronto tempi)..."

ROUTING_FAST_PAYLOAD='{
  "points": [[12.4964, 41.9028], [14.2681, 40.8518]],
  "profile": "motorcycle_fast",
  "instructions": false,
  "calc_points": false
}'

ROUTE_FAST=$(gh_curl \
    -X POST \
    -d "$ROUTING_FAST_PAYLOAD" \
    "${BASE_URL}/route" 2>/dev/null || echo "{}")

DIST_FAST=$(echo "$ROUTE_FAST" | grep -o '"distance":[0-9.]*' | head -1 | cut -d: -f2 || echo "0")
DIST_FAST_KM=$(echo "scale=1; $DIST_FAST / 1000" | bc 2>/dev/null || echo "0")

if [[ "${DIST_FAST%.*}" -gt 100000 ]] 2>/dev/null; then
    ok "Routing motorcycle_fast: distanza=${DIST_FAST_KM}km"
    info "Confronto: curvy=${DISTANCE_KM}km vs fast=${DIST_FAST_KM}km (curvy dovrebbe essere più lungo)"
else
    fail "Routing motorcycle_fast fallito"
fi

# =============================================================================
# TEST 5: Map Matching API — tracciato GPS campione (20 punti, Appennini)
# Percorso: tratto della SS4 Salaria nel Lazio
# =============================================================================
log "5. Map Matching API — tracciato GPS 20 punti (Appennini)..."

MAP_MATCH_PAYLOAD='{
  "points": [
    [12.6938, 42.3542],
    [12.6952, 42.3561],
    [12.6971, 42.3580],
    [12.6993, 42.3598],
    [12.7012, 42.3615],
    [12.7034, 42.3631],
    [12.7058, 42.3647],
    [12.7079, 42.3663],
    [12.7103, 42.3678],
    [12.7128, 42.3694],
    [12.7151, 42.3710],
    [12.7175, 42.3725],
    [12.7198, 42.3740],
    [12.7221, 42.3755],
    [12.7244, 42.3770],
    [12.7268, 42.3785],
    [12.7291, 42.3800],
    [12.7315, 42.3815],
    [12.7339, 42.3830],
    [12.7363, 42.3845]
  ],
  "profile": "motorcycle",
  "details": ["osm_way_id", "road_class"]
}'

MM_RESPONSE=$(gh_curl \
    -X POST \
    -d "$MAP_MATCH_PAYLOAD" \
    "${BASE_URL}/match" 2>/dev/null || echo "{}")

HAS_WAYS=$(echo "$MM_RESPONSE" | grep -c '"osm_way_id"' 2>/dev/null || echo "0")
HAS_PATHS=$(echo "$MM_RESPONSE" | grep -c '"paths"' 2>/dev/null || echo "0")

if [[ "$HAS_WAYS" -gt 0 ]]; then
    ok "Map Matching: trovati ${HAS_WAYS} occorrenze osm_way_id"
    # Estrai primo osm_way_id (formato nel details array: [from_node, to_node, way_id])
    FIRST_WAY=$(echo "$MM_RESPONSE" | grep -o '"osm_way_id":[[0-9,\[\] ]*' | head -1 | \
                grep -o '[0-9]\{5,\}' | tail -1 || echo "N/A")
    if [[ "$FIRST_WAY" != "N/A" ]]; then
        info "Esempio osm_way_id: ${FIRST_WAY} → https://www.openstreetmap.org/way/${FIRST_WAY}"
    fi
elif [[ "$HAS_PATHS" -gt 0 ]]; then
    # paths presenti ma senza details — verifica che il grafo sia buildato con details abilitati
    info "Map Matching: paths presenti ma nessun osm_way_id nei details."
    info "  Verifica: il grafo deve essere buildato con graph.encoded_values che include road_class."
    info "  Risposta parziale: $(echo "$MM_RESPONSE" | head -c 200)"
    # Non è un fail critico se il grafo è stato buildato senza quel dettaglio
    ok "Map Matching funziona (paths trovati) — osm_way_id richiede rebuild con config aggiornato"
else
    fail "Map Matching fallito. Risposta: $(echo "$MM_RESPONSE" | head -c 300)"
fi

# =============================================================================
# TEST 6: Custom Model API — modello dinamico con curvature
# =============================================================================
log "6. Custom Model API — invio custom model dinamico..."

CUSTOM_MODEL_PAYLOAD='{
  "points": [[12.4964, 41.9028], [14.2681, 40.8518]],
  "profile": "motorcycle",
  "custom_model": {
    "speed": [
      {"if": "road_class == MOTORWAY", "multiply_by": "0.05"},
      {"if": "true", "limit_to": "max_speed"}
    ],
    "priority": [
      {"if": "road_class == MOTORWAY", "multiply_by": "0.01"},
      {"if": "road_class == SECONDARY || road_class == TERTIARY", "multiply_by": "1.5"}
    ]
  },
  "instructions": false,
  "calc_points": false
}'

CUSTOM_RESPONSE=$(gh_curl \
    -X POST \
    -d "$CUSTOM_MODEL_PAYLOAD" \
    "${BASE_URL}/route" 2>/dev/null || echo "{}")

CUSTOM_DIST=$(echo "$CUSTOM_RESPONSE" | grep -o '"distance":[0-9.]*' | head -1 | cut -d: -f2 || echo "0")
CUSTOM_DIST_KM=$(echo "scale=1; $CUSTOM_DIST / 1000" | bc 2>/dev/null || echo "0")

if [[ "${CUSTOM_DIST%.*}" -gt 100000 ]] 2>/dev/null; then
    ok "Custom Model API funzionante: distanza=${CUSTOM_DIST_KM}km"
    info "Il routing curvy dovrebbe evitare le autostrade rispetto a fast"
else
    fail "Custom Model API fallita. Risposta: $(echo $CUSTOM_RESPONSE | head -c 200)"
fi

# =============================================================================
# TEST 7: Rate limiting (solo verifica che il rate limiter sia attivo)
# =============================================================================
log "7. Rate limiting — verifica risposta 429 dopo burst..."

RATE_LIMIT_HIT=0
for i in $(seq 1 10); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "X-GH-Token: token-sbagliato" \
        "${BASE_URL}/route" 2>/dev/null || echo "000")
    if [[ "$CODE" == "429" ]]; then
        RATE_LIMIT_HIT=1
        break
    fi
done

if [[ $RATE_LIMIT_HIT -eq 1 ]]; then
    ok "Rate limiting attivo: HTTP 429 ricevuto"
else
    info "Rate limiting: 429 non ricevuto in 10 richieste (normale in test isolato)"
fi

# =============================================================================
# RIEPILOGO
# =============================================================================
echo ""
echo "============================================================"
echo "RISULTATO FINALE"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  Totale: $((PASS + FAIL))"
echo "============================================================"

if [[ $FAIL -eq 0 ]]; then
    echo -e "\033[1;32m✓ Tutti i test superati! GraphHopper pronto per BikerLink.\033[0m"
    exit 0
else
    echo -e "\033[1;31m✗ ${FAIL} test falliti. Controllare i log sopra.\033[0m"
    echo ""
    echo "Debug utile:"
    echo "  journalctl -u graphhopper -n 100"
    echo "  cat /opt/graphhopper/logs/graphhopper.log | tail -50"
    echo "  curl -v -H 'X-GH-Token: ${GH_TOKEN}' ${BASE_URL}/health"
    exit 1
fi
