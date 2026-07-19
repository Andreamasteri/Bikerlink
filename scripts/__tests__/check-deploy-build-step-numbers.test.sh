#!/bin/bash
# check-deploy-build-step-numbers.test.sh
#
# Regression test per il gate check-deploy-build-step-numbers.sh.
#
# Verifica che il gate:
#   (a) esca con codice 1 e messaggio chiaro quando il TOTAL è stantio
#       (le label dichiarano [N/15] ma ci sono 16 step reali)
#   (b) esca con codice 1 e messaggio chiaro quando c'è un numero step duplicato
#   (c) esca con codice 1 e messaggio chiaro quando la sequenza non inizia da 1
#       o ha gap (out-of-order)
#   (d) esca con codice 1 quando deploy-build.sh usa source/. per delegare
#       a file esterni (scatterebbe le label su file multipli)
#   (e) il gate sia eseguibile (permessi +x)
#   (f) esca con codice 0 sullo stato reale del repo (nessuna violazione)
#
# Strategia fixture: il gate legge sempre il path relativo "scripts/deploy-build.sh".
# Per isolare i test usiamo una directory temporanea con una sottodirectory
# "scripts/" in cui depositiamo il gate reale e la fixture da testare.
# Il gate viene eseguito da quella directory — nessuna modifica ai file reali.
#
# Pattern modellato su scripts/__tests__/check-ai-direct-generateobject.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-deploy-build-step-numbers.sh"

PASS=0
FAIL=0

# ── Funzione helper: crea una sandbox con una fixture deploy-build.sh ─────────
# Uso: make_sandbox <fixture_content_heredoc_file>
# Ritorna il path della sandbox in SANDBOX_DIR (variabile globale)
SANDBOX_DIR=""
make_sandbox() {
  SANDBOX_DIR="$(mktemp -d /tmp/step-num-gate-test.XXXXXX)"
  mkdir -p "$SANDBOX_DIR/scripts"
  # Il gate è sempre lo script reale; la fixture va in scripts/deploy-build.sh
  cp "$GATE_SCRIPT" "$SANDBOX_DIR/scripts/check-deploy-build-step-numbers.sh"
}

cleanup() {
  [ -n "${SANDBOX_DIR:-}" ] && rm -rf "$SANDBOX_DIR" 2>/dev/null || true
}
trap cleanup EXIT

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-deploy-build-step-numbers.sh"
echo "════════════════════════════════════════════════════════════"

# Pre-condizione: il gate esiste
if [ ! -f "$GATE_SCRIPT" ]; then
  echo "ERRORE: gate script mancante: $GATE_SCRIPT"
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (e): il gate è eseguibile"
# ──────────────────────────────────────────────────────────────────────────────
if [ -x "$GATE_SCRIPT" ]; then
  ok "check-deploy-build-step-numbers.sh è eseguibile"
else
  nok "check-deploy-build-step-numbers.sh NON è eseguibile (chmod +x mancante)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (a): TOTAL stantio → exit 1 + messaggio 'TOTAL is X but Y step labels exist'"
# ──────────────────────────────────────────────────────────────────────────────
# Fixture: 3 label reali ma tutte dichiarano TOTAL=2 (stantio).
make_sandbox
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — NON committare
log() { echo "$*"; }
log "=== [1/2] Step uno — desc"
log "=== [2/2] Step due — desc"
log "=== [3/2] Step tre — TOTAL stantio (dichiara 2 ma ne esistono 3)"
FIXTURE

EXIT_A=0
OUTPUT_A=$(cd "$SANDBOX_DIR" && bash scripts/check-deploy-build-step-numbers.sh 2>&1) || EXIT_A=$?

if [ "$EXIT_A" -eq 1 ]; then
  ok "exit 1 con TOTAL stantio (atteso)"
else
  nok "exit $EXIT_A invece di 1 — TOTAL stantio non rilevato (REGRESSIONE)"
fi

# Verifica che il messaggio contenga la parola chiave della violazione
if echo "$OUTPUT_A" | grep -q "TOTAL is"; then
  ok "output contiene 'TOTAL is' — messaggio di violazione presente"
else
  nok "output NON contiene 'TOTAL is' — messaggio di violazione mancante o cambiato"
  echo "     Output del gate:"
  echo "$OUTPUT_A" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (b): numero step duplicato → exit 1 + messaggio 'duplicate step number'"
# ──────────────────────────────────────────────────────────────────────────────
# Fixture: step [2/3] appare due volte.
make_sandbox
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — NON committare
log() { echo "$*"; }
log "=== [1/3] Step uno"
log "=== [2/3] Step due — prima occorrenza"
log "=== [2/3] Step due — DUPLICATO (stesso numero, TOTAL corretto=3)"
FIXTURE

EXIT_B=0
OUTPUT_B=$(cd "$SANDBOX_DIR" && bash scripts/check-deploy-build-step-numbers.sh 2>&1) || EXIT_B=$?

if [ "$EXIT_B" -eq 1 ]; then
  ok "exit 1 con numero step duplicato (atteso)"
else
  nok "exit $EXIT_B invece di 1 — numero step duplicato non rilevato (REGRESSIONE)"
fi

if echo "$OUTPUT_B" | grep -q "duplicate step number"; then
  ok "output contiene 'duplicate step number' — messaggio di violazione presente"
else
  nok "output NON contiene 'duplicate step number' — messaggio di violazione mancante o cambiato"
  echo "     Output del gate:"
  echo "$OUTPUT_B" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (c): step fuori sequenza (gap) → exit 1 + messaggio 'expected step number'"
# ──────────────────────────────────────────────────────────────────────────────
# Fixture: step numerati 1, 3, 4 — manca il 2 (gap).
make_sandbox
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — NON committare
log() { echo "$*"; }
log "=== [1/3] Step uno"
log "=== [3/3] Step tre — gap: manca il 2"
log "=== [4/3] Step quattro — TOTAL stantio e fuori sequenza"
FIXTURE

EXIT_C=0
OUTPUT_C=$(cd "$SANDBOX_DIR" && bash scripts/check-deploy-build-step-numbers.sh 2>&1) || EXIT_C=$?

if [ "$EXIT_C" -eq 1 ]; then
  ok "exit 1 con step fuori sequenza (atteso)"
else
  nok "exit $EXIT_C invece di 1 — step fuori sequenza non rilevato (REGRESSIONE)"
fi

if echo "$OUTPUT_C" | grep -q "expected step number\|TOTAL is"; then
  ok "output contiene parola chiave di violazione sequenza/TOTAL — messaggio presente"
else
  nok "output NON contiene 'expected step number' né 'TOTAL is' — messaggio di violazione mancante o cambiato"
  echo "     Output del gate:"
  echo "$OUTPUT_C" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (d): source delegation → exit 1 + blocco SOURCE DELEGATION"
# ──────────────────────────────────────────────────────────────────────────────
# Fixture: contiene 'source ./part-one.sh' che scatterebbe le label su file
# multipli rendendo il conteggio TOTAL silenziosamente sbagliato.
make_sandbox
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — NON committare
log() { echo "$*"; }
log "=== [1/1] Step uno"
source ./scripts/part-one.sh
FIXTURE

EXIT_D=0
OUTPUT_D=$(cd "$SANDBOX_DIR" && bash scripts/check-deploy-build-step-numbers.sh 2>&1) || EXIT_D=$?

if [ "$EXIT_D" -eq 1 ]; then
  ok "exit 1 con source delegation (atteso)"
else
  nok "exit $EXIT_D invece di 1 — source delegation non rilevata (REGRESSIONE)"
fi

if echo "$OUTPUT_D" | grep -qi "SOURCE DELEGATION\|source.*delegation\|DELEGAZIONE"; then
  ok "output contiene riferimento a SOURCE DELEGATION — messaggio di blocco presente"
else
  nok "output NON contiene 'SOURCE DELEGATION' — messaggio di blocco mancante o cambiato"
  echo "     Output del gate:"
  echo "$OUTPUT_D" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (f): stato reale del repo → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
# Il gate deve passare sul deploy-build.sh reale senza modifiche.
EXIT_F=0
OUTPUT_F=$(cd "$PROJECT_ROOT" && bash "$GATE_SCRIPT" 2>&1) || EXIT_F=$?

if [ "$EXIT_F" -eq 0 ]; then
  ok "exit 0 sullo stato reale del repo (nessuna violazione di step numbering)"
else
  nok "exit $EXIT_F — lo stato reale del repo fa fallire il gate (numerazione step rotta?)"
  echo "     Output del gate:"
  echo "$OUTPUT_F" | sed 's/^/       /'
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-deploy-build-step-numbers FALLITO."
  exit 1
fi
echo "✅ Regression test check-deploy-build-step-numbers: tutte le asserzioni superate."
exit 0
