#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  BikerLink — Sistema B: Runtime Health Check
#
#  Verifica il comportamento effettivo dei processi live:
#    - Porta 5000 raggiungibile (backend Express)
#    - GET /api/health → { status: "ok" }
#    - Porta 8081 raggiungibile (Metro / Expo)
#    - Nessun FATAL nei log recenti (file di log standard)
#
#  Fa parte del protocollo "controllo-incrociato" — Sistema B (verifica runtime).
#  Produce output strutturato compatibile con la firma di completamento.
#
#  Exit code:
#    0 — tutti i check verdi (VERDE)
#    1 — almeno un check BLOCCANTE
#
#  Uso:
#    bash scripts/check-runtime-health.sh
#    bash scripts/check-runtime-health.sh --quiet   # solo summary finale
#    bash scripts/check-runtime-health.sh --timeout 10  # timeout porta (default: 5s)
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

QUIET=false
PORT_TIMEOUT=5
MAX_RETRIES=12
RETRY_SLEEP=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet)   QUIET=true; shift ;;
    --timeout) PORT_TIMEOUT="${2:-5}"; shift 2 ;;
    *)         shift ;;
  esac
done

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

BLOCKING=0
WARNINGS=0
FINDINGS=()

blocker() {
  local msg="$1"
  FINDINGS+=("[BLOCCANTE] $msg")
  ((BLOCKING++)) || true
  $QUIET || echo -e "  ${RED}✖ BLOCCANTE${RESET}  $msg"
}

warning() {
  local msg="$1"
  FINDINGS+=("[WARNING] $msg")
  ((WARNINGS++)) || true
  $QUIET || echo -e "  ${YELLOW}⚠ WARNING${RESET}   $msg"
}

ok() {
  local msg="$1"
  $QUIET || echo -e "  ${GREEN}✔${RESET}  $msg"
}

info() {
  local msg="$1"
  $QUIET || echo -e "  ${CYAN}ℹ${RESET}  $msg"
}

$QUIET || echo ""
$QUIET || echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
$QUIET || echo -e "${BOLD}║   BikerLink — Sistema B: Runtime Health Check               ║${RESET}"
$QUIET || echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
$QUIET || echo ""

# ── Helper: verifica porta con retry ─────────────────────────────────────────
check_port() {
  local port="$1"
  local label="$2"
  local attempt=0

  $QUIET || echo -e "  ${BOLD}─── Porta ${port} (${label}) ─────────────────────────────────────${RESET}"

  while [ $attempt -lt $MAX_RETRIES ]; do
    attempt=$((attempt + 1))
    if timeout "$PORT_TIMEOUT" bash -c "echo > /dev/tcp/localhost/${port}" 2>/dev/null; then
      ok "Porta ${port} (${label}) raggiungibile (tentativo ${attempt}/${MAX_RETRIES})"
      return 0
    fi
    $QUIET || info "Tentativo ${attempt}/${MAX_RETRIES} fallito — porta ${port} non risponde"
    if [ $attempt -lt $MAX_RETRIES ]; then
      sleep "${RETRY_SLEEP}"
    fi
  done

  blocker "Porta ${port} (${label}) non raggiungibile dopo ${MAX_RETRIES} tentativi (timeout ${PORT_TIMEOUT}s)"
  return 1
}

# ── 1. Porta 5000 — Backend Express ──────────────────────────────────────────
BACKEND_UP=false
if check_port 5000 "Backend Express"; then
  BACKEND_UP=true
fi

# ── 2. GET /api/health ────────────────────────────────────────────────────────
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}─── GET /api/health ─────────────────────────────────────────${RESET}"

if [ "$BACKEND_UP" = true ]; then
  HEALTH_OK=false
  attempt=0

  while [ $attempt -lt $MAX_RETRIES ]; do
    attempt=$((attempt + 1))
    HTTP_RESPONSE=$(curl -s --max-time "$PORT_TIMEOUT" http://localhost:5000/api/health 2>/dev/null || echo "")

    # /api/health distingue booting(503)/ready(200)/degraded(200): "ready" e
    # "degraded" = backend che SERVE richieste (vedi server/init-state.ts).
    # "ok" accettato per retro-compat. Prima jq, poi python3, poi grep.
    STATUS_OK=false
    if command -v jq >/dev/null 2>&1; then
      if echo "$HTTP_RESPONSE" | jq -e '.status == "ready" or .status == "degraded" or .status == "ok"' >/dev/null 2>&1; then
        STATUS_OK=true
      fi
    elif command -v python3 >/dev/null 2>&1; then
      if echo "$HTTP_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status') in ('ready','degraded','ok') else 1)" 2>/dev/null; then
        STATUS_OK=true
      fi
    else
      # Fallback conservativo: cerca "status":"ready|degraded|ok"
      if echo "$HTTP_RESPONSE" | grep -qE '"status"\s*:\s*"(ready|degraded|ok)"'; then
        STATUS_OK=true
      fi
    fi

    if [ "$STATUS_OK" = true ]; then
      ok "GET /api/health → { status: ready|degraded } verificato (tentativo ${attempt}/${MAX_RETRIES})"
      $QUIET || info "Risposta completa: $HTTP_RESPONSE"
      HEALTH_OK=true
      break
    fi

    $QUIET || info "Tentativo ${attempt}/${MAX_RETRIES} — risposta inattesa: ${HTTP_RESPONSE:-<vuota>}"
    if [ $attempt -lt $MAX_RETRIES ]; then
      sleep "${RETRY_SLEEP}"
    fi
  done

  if [ "$HEALTH_OK" = false ]; then
    blocker "GET /api/health non restituisce { status: ready|degraded } dopo ${MAX_RETRIES} tentativi — risposta: ${HTTP_RESPONSE:-<vuota>}"
  fi
else
  warning "GET /api/health saltato — backend non raggiungibile su porta 5000"
fi

# ── 3. Porta 8081 — Metro / Expo (warning-only: dev server, not required for backend tasks) ──
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}─── Porta 8081 (Metro / Expo) ───────────────────────────────${RESET}"
METRO_UP=false
for attempt in 1 2 3; do
  if timeout "$PORT_TIMEOUT" bash -c "echo > /dev/tcp/localhost/8081" 2>/dev/null; then
    ok "Porta 8081 (Metro / Expo) raggiungibile (tentativo ${attempt}/3)"
    METRO_UP=true
    break
  fi
  $QUIET || info "Tentativo ${attempt}/3 fallito — porta 8081 non risponde"
  [ "$attempt" -lt 3 ] && sleep 1
done
if [ "$METRO_UP" = false ]; then
  warning "Porta 8081 (Metro / Expo) non raggiungibile — frontend dev server non avviato (non bloccante per task backend)"
fi

# ── 4. Controllo FATAL nei log recenti ───────────────────────────────────────
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}─── Log recenti — ricerca FATAL ─────────────────────────────${RESET}"

LOG_DIRS=(
  "/tmp/logs"
  "/tmp"
)

FATAL_FOUND=false
FATAL_LINES=()

for log_dir in "${LOG_DIRS[@]}"; do
  if [ -d "$log_dir" ]; then
    while IFS= read -r -d '' logfile; do
      # Salta i log prodotti da questo script stesso (evita falsi positivi auto-referenziali)
      [[ "$(basename "$logfile")" == healthcheck_* ]] && continue
      # Considera solo log modificati negli ultimi 10 minuti
      if [ -n "$(find "$logfile" -mmin -10 2>/dev/null)" ]; then
        matches=$(grep -iE "FATAL" "$logfile" 2>/dev/null | grep -vE "ricerca FATAL|── Log recenti|FATAL trovati nei log|Nessun FATAL" | tail -5 || true)
        if [ -n "$matches" ]; then
          FATAL_FOUND=true
          while IFS= read -r line; do
            FATAL_LINES+=("$(basename "$logfile"): $line")
          done <<< "$matches"
        fi
      fi
    done < <(find "$log_dir" -maxdepth 2 -name "*.log" -print0 2>/dev/null)
  fi
done

if [ "$FATAL_FOUND" = true ]; then
  blocker "FATAL trovati nei log recenti (ultimi 10 minuti):"
  for line in "${FATAL_LINES[@]}"; do
    $QUIET || echo -e "      ${RED}→${RESET} $line"
    FINDINGS+=("  → $line")
  done
else
  ok "Nessun FATAL nei log recenti (ultimi 10 minuti)"
fi

# ── 5. Riepilogo e firma di completamento ─────────────────────────────────────
$QUIET || echo ""
$QUIET || echo -e "  ${BOLD}──────────────────────────────────────────────────────────────${RESET}"
$QUIET || echo ""

if [ "$BLOCKING" -gt 0 ]; then
  ESITO="ROSSO"
else
  ESITO="VERDE"
fi

echo ""
echo "=== CONTROLLO INCROCIATO — Runtime Health ==="
echo ""
echo "SISTEMA B — Findings runtime:"
if [ ${#FINDINGS[@]} -eq 0 ]; then
  echo "- nessun finding"
else
  printf -- '- %s\n' "${FINDINGS[@]}"
fi
echo ""
echo "ESITO FINALE: $ESITO ($BLOCKING bloccanti, $WARNINGS warning)"
echo "============================================="

if [ "$BLOCKING" -gt 0 ]; then
  echo ""
  echo -e "  ${RED}${BOLD}✖  $BLOCKING check BLOCCANTI — verificare i processi prima di consegnare.${RESET}"
  echo ""
  echo "  Avvia i workflow backend e frontend, poi ri-esegui:"
  echo "  bash scripts/check-runtime-health.sh"
  echo ""
  exit 1
fi

echo ""
echo -e "  ${GREEN}${BOLD}✔  Tutti i check runtime sono verdi — VERDE.${RESET}"
echo ""
exit 0
