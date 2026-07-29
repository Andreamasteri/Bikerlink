#!/usr/bin/env bash
# BikerLink — Smoke test produzione: verifica che /api/health restituisca JSON valido
#
# Exit 0  → OK
# Exit 1  → anomalia (probe leak, risposta non-JSON, campo status assente)
#
# Uso standalone:
#   bash scripts/smoke-test-prod.sh
#
# Variabili opzionali:
#   PROD_URL   — URL base di produzione (default: https://biker-link.net)
#   MAX_TIME   — timeout curl in secondi (default: 15)

set -euo pipefail

PROD_URL="${PROD_URL:-https://biker-link.net}"
MAX_TIME="${MAX_TIME:-15}"
ENDPOINT="$PROD_URL/api/health"

LOG_PREFIX="[smoke-test-prod]"
log() { echo "$LOG_PREFIX $*"; }

log "Interrogo $ENDPOINT ..."

HTTP_RESPONSE=$(curl -s --max-time "$MAX_TIME" \
  -w "\n__HTTP_STATUS__:%{http_code}" \
  "$ENDPOINT" 2>/dev/null || true)

BODY=$(echo "$HTTP_RESPONSE" | sed '/^__HTTP_STATUS__:/d')
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | grep '^__HTTP_STATUS__:' | cut -d: -f2)

log "HTTP status: ${HTTP_STATUS:-???}"

# ── Guard 1: risposta vuota ───────────────────────────────────────────────────
if [ -z "$BODY" ]; then
  log "❌ ERRORE: risposta vuota (curl timeout o connessione rifiutata)"
  exit 1
fi

# ── Guard 2: probe leak (risposta inizia con "ok") ───────────────────────────
FIRST_CHARS=$(echo "$BODY" | head -c 2)
if [ "$FIRST_CHARS" = "ok" ]; then
  log "❌ ERRORE: probe leak — la risposta inizia con 'ok' (testo plain invece di JSON)"
  log "   Corpo ricevuto: $(echo "$BODY" | head -c 200)"
  exit 1
fi

# ── Guard 3: JSON valido ──────────────────────────────────────────────────────
if ! echo "$BODY" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
  log "❌ ERRORE: risposta non è JSON valido"
  log "   Corpo ricevuto: $(echo "$BODY" | head -c 200)"
  exit 1
fi

# ── Guard 4: campo 'status' presente ─────────────────────────────────────────
STATUS_FIELD=$(echo "$BODY" | python3 -c \
  "import sys, json; d=json.load(sys.stdin); print(d.get('status','__MISSING__'))" \
  2>/dev/null || echo "__MISSING__")

if [ "$STATUS_FIELD" = "__MISSING__" ]; then
  log "❌ ERRORE: campo 'status' assente nella risposta JSON"
  log "   Corpo ricevuto: $(echo "$BODY" | head -c 200)"
  exit 1
fi

log "✅ OK — /api/health risponde JSON valido, status='$STATUS_FIELD'"
exit 0
