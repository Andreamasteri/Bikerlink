#!/bin/bash
# horus-prev-report.test.sh — Verifica che collectPreviousHorusReport() includa la sezione
# "TRIAGE PRECEDENTE" nel bundle dry-run quando HORUS_LOG_DIR=/tmp contiene un report
# precedente, e che la sezione sia assente quando non esistono file candidati.
#
# Questa guard previene una regressione silenziosa in cui Horus ripropone i task
# identici a ogni ciclo del planner perché non vede mai il report del round precedente
# (il planning shell scrive i report in /tmp, non in logs/).
#
# Asserzioni:
#   (A) Con HORUS_LOG_DIR=/tmp e un file horus-log-analysis-*.md in /tmp:
#       stdout del dry-run contiene "TRIAGE PRECEDENTE"
#       stdout cita il percorso /tmp (fonte del file)
#       stdout contiene il testo estratto dalle sezioni del report sintetico
#   (B) Con HORUS_LOG_DIR non impostato e logs/ privo di file candidati:
#       stdout del dry-run NON contiene "TRIAGE PRECEDENTE"
#
# Eseguibile in CI. Exit 0 = verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PASS=0
FAIL=0
ERRORS=()

# ─── Colori ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}  ✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "${RED}  ✗ $1${NC}"; ((FAIL++)); ERRORS+=("$1"); }
info() { echo -e "${YELLOW}  ℹ $1${NC}"; }

# ─── File sintetico ─────────────────────────────────────────────────────────────
# Usa un timestamp nel futuro lontano (2099) così il nome ordina DOPO qualsiasi
# report reale in logs/ (2026-...) e la funzione seleziona sempre questo file.
SYNTHETIC_FILE="/tmp/horus-log-analysis-2099-12-31T23-59-59-999Z.md"
KNOWN_PROBLEM="Watchdog non ha rilevato il crash del backend per 12 minuti consecutivi"
# Titolo ASCII puro per evitare problemi di confronto UTF-8 in grep -F
KNOWN_TASK="Backend-irraggiungibile-alert-task-marker-abc123"

cleanup() {
  rm -f "$SYNTHETIC_FILE"
}
trap cleanup EXIT

# ─── Setup: crea report sintetico in /tmp ────────────────────────────────────
cat > "$SYNTHETIC_FILE" <<EOF
# Triage AI BikerLink — test sintetico

## PROBLEMI TROVATI
- $KNOWN_PROBLEM

## ANALISI CAUSE
- Il watchdog non monitora la porta 5000 con sufficiente frequenza.

## CORRELAZIONI TROVATE
- (nessuna correlazione identificata)

## TASK PROPOSTI DA HORUS
| Titolo | Priorita | Problema | Azione |
|--------|----------|---------|--------|
| $KNOWN_TASK | alta | Backend irraggiungibile | Alert push |
EOF

info "File sintetico creato: $SYNTHETIC_FILE"

# ─── Helper: esegui il dry-run e cattura stdout ─────────────────────────────
# --only-internal salta GitHub/Sentry/repo-tree (più veloci, no token ext).
# HORUS_TOKEN_BUDGET=999999999: disabilita il trim automatico per testare solo
#   la logica di collectPreviousHorusReport() senza che la sezione venga rimossa
#   per superamento del budget (il bundle normale è ~111k token > soglia 28k).
# 2>&1 unifica stderr in stdout per cattura completa.
run_dry_run() {
  HORUS_TOKEN_BUDGET=999999999 \
    npx tsx "$PROJECT_ROOT/scripts/log-analysis-horus.ts" \
    --dry-run --only-internal 2>&1 \
    || true   # exit code non ci interessa (dry-run può uscire con 0)
}

# ─── CASO A: HORUS_LOG_DIR=/tmp → TRIAGE PRECEDENTE atteso ──────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  CASO A: HORUS_LOG_DIR=/tmp (report sintetico atteso)"
echo "══════════════════════════════════════════════════════"

OUTPUT_A="$(HORUS_LOG_DIR=/tmp run_dry_run)"

# A1: la sezione compare nel bundle
if echo "$OUTPUT_A" | grep -q "TRIAGE PRECEDENTE"; then
  pass "A1: '## TRIAGE PRECEDENTE' presente nel bundle dry-run"
else
  fail "A1: '## TRIAGE PRECEDENTE' ASSENTE nel bundle dry-run (regressione collectPreviousHorusReport)"
fi

# A2: il percorso /tmp è citato come fonte
if echo "$OUTPUT_A" | grep -q "/tmp/horus-log-analysis"; then
  pass "A2: percorso /tmp citato nella sezione TRIAGE PRECEDENTE"
else
  fail "A2: percorso /tmp NON citato (la funzione non trova il file in /tmp)"
fi

# A3: il testo estratto dai PROBLEMI TROVATI del round precedente è incluso
if echo "$OUTPUT_A" | grep -qF "$KNOWN_PROBLEM"; then
  pass "A3: testo estratto da '## PROBLEMI TROVATI' del round precedente incluso nel bundle"
else
  fail "A3: testo del round precedente NON incluso (le sezioni non vengono estratte correttamente)"
fi

# A4: il testo estratto dai TASK PROPOSTI del round precedente è incluso
if echo "$OUTPUT_A" | grep -qF "$KNOWN_TASK"; then
  pass "A4: testo estratto da '## TASK PROPOSTI' del round precedente incluso nel bundle"
else
  fail "A4: task del round precedente NON incluso nel bundle"
fi

# ─── CASO B: HORUS_LOG_DIR non impostato — senza il file sintetico ───────────
#
# La funzione scansiona [logs/, /tmp] quando HORUS_LOG_DIR non è impostato.
# Il file sintetico viene rimosso, poi si verifica il comportamento reale:
#   - Se esistono candidati in logs/ o /tmp   → TRIAGE PRECEDENTE DEVE comparire
#     (verifica che il fallback su logs/ funzioni anche senza HORUS_LOG_DIR)
#   - Se non esistono candidati da nessuna parte → sezione DEVE essere assente
#     (verifica che non ci siano falsi positivi)
# Entrambi i rami eseguono un'asserzione reale; non c'è skip condizionale.
echo ""
echo "══════════════════════════════════════════════════════"
echo "  CASO B: HORUS_LOG_DIR unset — verifica comportamento senza file sintetico"
echo "══════════════════════════════════════════════════════"

rm -f "$SYNTHETIC_FILE"

# Raccogli tutti i candidati reali nelle directory scansionate dalla funzione
# (logs/ e /tmp — nessun HORUS_LOG_DIR set qui).
LOGS_DIR="$PROJECT_ROOT/logs"
ANY_CANDIDATES=()
if [[ -d "$LOGS_DIR" ]]; then
  while IFS= read -r -d '' f; do
    ANY_CANDIDATES+=("$f")
  done < <(find "$LOGS_DIR" -maxdepth 1 -name "horus-log-analysis-*.md" \
             -not -name "*-architect*" -print0 2>/dev/null)
fi
while IFS= read -r -d '' f; do
  ANY_CANDIDATES+=("$f")
done < <(find /tmp -maxdepth 1 -name "horus-log-analysis-*.md" \
           -not -name "*-architect*" -print0 2>/dev/null)

OUTPUT_B="$(run_dry_run)"

if [[ ${#ANY_CANDIDATES[@]} -gt 0 ]]; then
  # Candidati reali presenti → la sezione DEVE comparire
  info "Ambiente con ${#ANY_CANDIDATES[@]} report precedente(i) reale(i)"
  info "File: ${ANY_CANDIDATES[*]}"
  info "Asserzione B1 (positiva): verifica che la sezione compaia da quei report"
  if echo "$OUTPUT_B" | grep -q "TRIAGE PRECEDENTE"; then
    pass "B1: '## TRIAGE PRECEDENTE' presente quando esistono report reali (nessuna regressione fallback)"
  else
    fail "B1: '## TRIAGE PRECEDENTE' ASSENTE nonostante ${#ANY_CANDIDATES[@]} report candidati in logs/ o /tmp"
  fi
else
  # Ambiente davvero vuoto → la sezione DEVE essere assente
  info "Ambiente senza report precedenti — verifica assenza sezione (guard negativa)"
  if echo "$OUTPUT_B" | grep -q "TRIAGE PRECEDENTE"; then
    fail "B1: '## TRIAGE PRECEDENTE' compare senza alcun file candidato (falso positivo)"
  else
    pass "B1: '## TRIAGE PRECEDENTE' assente quando non esistono report precedenti"
  fi
fi

# ─── Riepilogo ────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  RIEPILOGO"
echo "══════════════════════════════════════════════════════"
echo -e "  ${GREEN}Passed: $PASS${NC}  ${RED}Failed: $FAIL${NC}"
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}  Falliti:${NC}"
  for e in "${ERRORS[@]}"; do
    echo -e "${RED}    - $e${NC}"
  done
fi
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
