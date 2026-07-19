#!/usr/bin/env bash
# check-replit-ports.test.sh
#
# Regression test per il gate check-replit-ports.sh.
#
# Verifica che:
#   (1) La configurazione canonica corrente (.replit reale) passi il gate.
#   (2) Un mapping invertito (5000→8081, 8081→80) venga bloccato.
#   (3) Un mapping parzialmente errato (5000→80 OK, 8081→80 errato) venga bloccato.
#   (4) Un [deployment] run con PORT=8081 venga bloccato.
#   (5) Un [deployment] run senza PORT=5000 venga bloccato.
#   (6) Un file .replit assente produca exit 1.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE="$PROJECT_ROOT/scripts/check-replit-ports.sh"

PASS=0
FAIL=0

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

# Helper: scrive un .replit temporaneo e testa il gate
run_gate() {
  local content="$1"
  local tmp
  tmp="$(mktemp /tmp/replit-ports-test.XXXXXX)"
  printf '%s' "$content" > "$tmp"
  REPLIT_FILE="$tmp" bash "$GATE" 2>&1
  local exit_code=$?
  rm -f "$tmp"
  return $exit_code
}

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-replit-ports.sh"
echo "════════════════════════════════════════════════════════════"

# ── Test (1): configurazione canonica corrente ────────────────────────────────
echo ""
echo "── Test (1): .replit corrente (canonico) → exit 0"
EXIT=0
OUTPUT=$(REPLIT_FILE="$PROJECT_ROOT/.replit" bash "$GATE" 2>&1) || EXIT=$?

if [ "$EXIT" -eq 0 ]; then
  ok ".replit corrente supera il gate (exit 0)"
else
  nok ".replit corrente FALLISCE il gate (exit $EXIT) — REGRESSIONE CRITICA"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi

# ── Test (2): mapping completamente invertito ─────────────────────────────────
echo ""
echo "── Test (2): mapping invertito (5000→8081, 8081→80) → exit 1"
INVERTED_CONTENT='
[[ports]]
localPort = 5000
externalPort = 8081

[[ports]]
localPort = 8081
externalPort = 80

[deployment]
run = ["bash", "-c", "PORT=5000 node server_dist/index.js"]
'

EXIT=0
OUTPUT=$(run_gate "$INVERTED_CONTENT" 2>&1) || EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  ok "mapping invertito bloccato correttamente (exit $EXIT)"
else
  nok "mapping invertito NON bloccato (exit 0) — REGRESSIONE"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi
if echo "$OUTPUT" | grep -q "❌"; then
  ok "output riporta errore con ❌"
else
  nok "output non riporta ❌ — messaggio di errore assente"
fi

# ── Test (3): mapping parzialmente errato (8081 sbagliato) ───────────────────
echo ""
echo "── Test (3): 5000→80 OK ma 8081→80 errato → exit 1"
PARTIAL_CONTENT='
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 8081
externalPort = 80

[deployment]
run = ["bash", "-c", "PORT=5000 node server_dist/index.js"]
'

EXIT=0
OUTPUT=$(run_gate "$PARTIAL_CONTENT" 2>&1) || EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  ok "mapping parziale errato bloccato correttamente (exit $EXIT)"
else
  nok "mapping parziale errato NON bloccato (exit 0) — REGRESSIONE"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi

# ── Test (4): PORT=8081 nel run di deploy ────────────────────────────────────
echo ""
echo "── Test (4): PORT=8081 nel [deployment] run → exit 1"
PORT8081_CONTENT='
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 8081
externalPort = 8081

[deployment]
run = ["bash", "-c", "PORT=8081 node server_dist/index.js"]
'

EXIT=0
OUTPUT=$(run_gate "$PORT8081_CONTENT" 2>&1) || EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  ok "PORT=8081 nel deploy bloccato correttamente (exit $EXIT)"
else
  nok "PORT=8081 nel deploy NON bloccato (exit 0) — REGRESSIONE"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi

# ── Test (5): PORT=5000 assente dal run di deploy ─────────────────────────────
echo ""
echo "── Test (5): PORT=5000 assente dal [deployment] run → exit 1"
NOPORT_CONTENT='
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 8081
externalPort = 8081

[deployment]
run = ["bash", "-c", "node server_dist/index.js"]
'

EXIT=0
OUTPUT=$(run_gate "$NOPORT_CONTENT" 2>&1) || EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  ok "PORT=5000 assente bloccato correttamente (exit $EXIT)"
else
  nok "PORT=5000 assente NON bloccato (exit 0) — REGRESSIONE"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi

# ── Test (6): file .replit assente ───────────────────────────────────────────
echo ""
echo "── Test (6): file .replit assente → exit 1"
MISSING_FILE="/tmp/replit-ports-missing-$$.toml"
rm -f "$MISSING_FILE"

EXIT=0
OUTPUT=$(REPLIT_FILE="$MISSING_FILE" bash "$GATE" 2>&1) || EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  ok "file assente bloccato correttamente (exit $EXIT)"
else
  nok "file assente NON bloccato (exit 0) — REGRESSIONE"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi

# ── Test (7): configurazione corretta completa ────────────────────────────────
echo ""
echo "── Test (7): configurazione completa corretta → exit 0"
CORRECT_CONTENT='
[[ports]]
localPort = 5000
externalPort = 80

[[ports]]
localPort = 8081
externalPort = 8081

[deployment]
run = ["bash", "-c", "PORT=5000 node server_dist/index.js"]
'

EXIT=0
OUTPUT=$(run_gate "$CORRECT_CONTENT" 2>&1) || EXIT=$?

if [ "$EXIT" -eq 0 ]; then
  ok "configurazione corretta supera il gate (exit 0)"
else
  nok "configurazione corretta FALLISCE il gate (exit $EXIT) — REGRESSIONE"
  echo "     Output:"
  echo "$OUTPUT" | sed 's/^/       /'
fi

# ── Risultato finale ──────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-replit-ports FALLITO."
  exit 1
fi
echo "✅ Regression test check-replit-ports: tutte le asserzioni superate."
exit 0
