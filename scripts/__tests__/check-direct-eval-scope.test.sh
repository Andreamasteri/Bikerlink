#!/bin/bash
# check-direct-eval-scope.test.sh
#
# Regression test per il gate check-direct-eval-scope.sh.
#
# Verifica che il gate:
#   (a) esca con codice 1 quando un NUOVO file server/*.ts usa eval()
#       fuori dall'unico file autorizzato
#   (b) esca con codice 0 sullo stato reale del repo (solo il file autorizzato)
#   (e) il gate sia eseguibile (permessi +x)
#   (f) ALLOWED_FILE sia esattamente "server/ai/db-integrity/registry.ts"
#
# Protezione anti-bypass: ALLOWED_FILE è l'unico file autorizzato a usare eval().
# Cambiare il valore della variabile nel gate permetterebbe di silenziare
# silenziosamente la protezione per un file diverso (es. uno malevolo).
# Qualsiasi modifica richiede una modifica esplicita anche a questo test.
#
# Pattern modellato su scripts/__tests__/check-tc-admin-card-tests.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-direct-eval-scope.sh"

DUMMY_SERVER_FILE="$PROJECT_ROOT/server/__eval_scope_test_dummy__.ts"

PASS=0
FAIL=0

cleanup() {
  rm -f "$DUMMY_SERVER_FILE" 2>/dev/null || true
}
trap cleanup EXIT

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-direct-eval-scope.sh"
echo "════════════════════════════════════════════════════════════"

if [ ! -f "$GATE_SCRIPT" ]; then
  echo "ERRORE: gate script mancante: $GATE_SCRIPT"
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (e): il gate è eseguibile"
# ──────────────────────────────────────────────────────────────────────────────
if [ -x "$GATE_SCRIPT" ]; then
  ok "check-direct-eval-scope.sh è eseguibile"
else
  nok "check-direct-eval-scope.sh NON è eseguibile (chmod +x mancante)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (a): file non autorizzato con eval() → exit 1"
# ──────────────────────────────────────────────────────────────────────────────
# Crea un file dummy in server/ che usa eval() ma non è il file autorizzato.
# Il gate deve rilevarlo e uscire con codice 1.
cat > "$DUMMY_SERVER_FILE" <<'EOF'
// Dummy creato dal regression test — NON committare
export function badEval(expr: string): unknown {
  return eval(expr);
}
EOF

GATE_EXIT_A=0
(cd "$PROJECT_ROOT" && bash "$GATE_SCRIPT") > /dev/null 2>&1 || GATE_EXIT_A=$?
rm -f "$DUMMY_SERVER_FILE"

if [ "$GATE_EXIT_A" -eq 1 ]; then
  ok "exit 1 con file non autorizzato che usa eval() (comportamento corretto)"
else
  nok "exit $GATE_EXIT_A invece di 1 — il gate NON rileva eval() nel file non autorizzato (REGRESSIONE)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (b): stato reale del repo → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
# Esegue il gate sullo stato reale del repo (senza file dummy).
# Deve passare: solo il file autorizzato usa eval().
GATE_EXIT_B=0
(cd "$PROJECT_ROOT" && bash "$GATE_SCRIPT") > /dev/null 2>&1 || GATE_EXIT_B=$?

if [ "$GATE_EXIT_B" -eq 0 ]; then
  ok "exit 0 sullo stato reale del repo (solo il file autorizzato usa eval)"
else
  nok "exit $GATE_EXIT_B — lo stato reale del repo farebbe fallire il gate (eval() in un file non autorizzato?)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (f): ALLOWED_FILE è esattamente 'server/ai/db-integrity/registry.ts'"
# ──────────────────────────────────────────────────────────────────────────────
# Protezione anti-bypass: un agente futuro potrebbe cambiare ALLOWED_FILE per
# silenziare il gate su un file diverso da quello autorizzato.
# Qualsiasi modifica richiede una modifica esplicita anche a questo test.

EXPECTED_ALLOWED_FILE="server/ai/db-integrity/registry.ts"
ACTUAL_ALLOWED_FILE=""

while IFS= read -r line; do
  if [[ "$line" =~ ^ALLOWED_FILE=\"([^\"]+)\" ]]; then
    ACTUAL_ALLOWED_FILE="${BASH_REMATCH[1]}"
    break
  fi
done < "$GATE_SCRIPT"

if [ "$ACTUAL_ALLOWED_FILE" = "$EXPECTED_ALLOWED_FILE" ]; then
  ok "ALLOWED_FILE è esattamente '$EXPECTED_ALLOWED_FILE' (nessun bypass silenzioso)"
else
  nok "ALLOWED_FILE: trovato '${ACTUAL_ALLOWED_FILE:-<non trovato>}', atteso '$EXPECTED_ALLOWED_FILE' — possibile bypass silenzioso!"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-direct-eval-scope FALLITO."
  exit 1
fi
echo "✅ Regression test check-direct-eval-scope: tutte le asserzioni superate."
exit 0
