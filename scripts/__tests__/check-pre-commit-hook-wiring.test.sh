#!/bin/bash
# check-pre-commit-hook-wiring.test.sh
#
# Regression test per il wiring del pre-commit hook con il gate
# check-deploy-build-step-numbers.sh.
#
# Verifica che:
#   (1) scripts/pre-commit contenga una chiamata esplicita a
#       check-deploy-build-step-numbers.sh (gate wired).
#   (2) Il pre-commit hook — eseguito in un repo git temporaneo con
#       scripts/deploy-build.sh staged a TOTAL stantio — esegua il gate
#       e blocchi il commit (exit 1).
#   (3) Il pre-commit hook NON blocchi il commit quando deploy-build.sh è
#       numerato correttamente (exit 0).
#
# Strategia sandbox:
#   Tutto avviene in directory temporanee; il repo reale (.git/) non viene
#   mai toccato.  Le dipendenze del hook che non riguardano lo step-numbering
#   (detect-secrets-hook, check-large-files-ratchet.sh,
#   check-ai-direct-generateobject.sh) vengono stubbed con script che escono
#   sempre con 0 in modo che il flusso raggiunga il gate in esame.
#   Il gate check-deploy-build-step-numbers.sh è sempre quello REALE copiato
#   dal repo corrente.
#
# Pattern modellato su scripts/__tests__/check-deploy-build-step-numbers.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRE_COMMIT_SRC="$PROJECT_ROOT/scripts/pre-commit"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-deploy-build-step-numbers.sh"

PASS=0
FAIL=0

SANDBOX_DIR=""
cleanup() {
  [ -n "${SANDBOX_DIR:-}" ] && rm -rf "$SANDBOX_DIR" 2>/dev/null || true
}
trap cleanup EXIT

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-pre-commit-hook-wiring"
echo "  (hook esegue check-deploy-build-step-numbers.sh)"
echo "════════════════════════════════════════════════════════════"

# Pre-condizioni: i file sorgente devono esistere
if [ ! -f "$PRE_COMMIT_SRC" ]; then
  echo "ERRORE: scripts/pre-commit non trovato: $PRE_COMMIT_SRC"
  exit 1
fi
if [ ! -f "$GATE_SCRIPT" ]; then
  echo "ERRORE: gate script non trovato: $GATE_SCRIPT"
  exit 1
fi

# ── Helper: crea un repo sandbox completo ────────────────────────────────────
# Uso: make_sandbox
# Risultato: SANDBOX_DIR inizializzato con git repo + hook + stub script.
# Il chiamante aggiunge il fixture scripts/deploy-build.sh e lo staga.
make_sandbox() {
  SANDBOX_DIR="$(mktemp -d /tmp/hook-wiring-test.XXXXXX)"

  # ── Init repo git minimale ────────────────────────────────────────────────
  cd "$SANDBOX_DIR"
  git init -q
  git config user.email "test@test.com"
  git config user.name "Test"
  # Commit iniziale: necessario affinché git diff --cached funzioni
  echo "# BikerLink test sandbox" > README.md
  git add README.md
  git commit -q -m "init"

  # ── Fake binaries: detect-secrets-hook e detect-secrets ──────────────────
  # Queste dipendenze non testano il gate in esame; le stubbiamo con exit 0
  # per permettere al flusso del hook di raggiungere check-deploy-build-step-numbers.sh.
  mkdir -p "$SANDBOX_DIR/bin"

  cat > "$SANDBOX_DIR/bin/detect-secrets-hook" << 'STUB'
#!/bin/bash
# Stub per detect-secrets-hook — sempre OK (non testate qui)
exit 0
STUB
  chmod +x "$SANDBOX_DIR/bin/detect-secrets-hook"

  cat > "$SANDBOX_DIR/bin/detect-secrets" << 'STUB'
#!/bin/bash
# Stub per detect-secrets — emette baseline vuota
echo '{"version":"1.5.0","plugins_used":[],"filters_used":[],"results":{},"generated_at":"2024-01-01T00:00:00Z"}'
exit 0
STUB
  chmod +x "$SANDBOX_DIR/bin/detect-secrets"

  # Baseline presente: evita la logica "crea baseline" che complicherebbe il test
  echo '{"version":"1.5.0","plugins_used":[],"filters_used":[],"results":{},"generated_at":"2024-01-01T00:00:00Z"}' \
    > "$SANDBOX_DIR/.secrets.baseline"

  # ── Struttura scripts/ ────────────────────────────────────────────────────
  mkdir -p "$SANDBOX_DIR/scripts"

  # Gate REALE: check-deploy-build-step-numbers.sh
  cp "$GATE_SCRIPT" "$SANDBOX_DIR/scripts/check-deploy-build-step-numbers.sh"

  # Stub: check-large-files-ratchet.sh (gate non in esame → passa sempre)
  cat > "$SANDBOX_DIR/scripts/check-large-files-ratchet.sh" << 'STUB'
#!/bin/bash
exit 0
STUB
  chmod +x "$SANDBOX_DIR/scripts/check-large-files-ratchet.sh"

  # Stub: check-ai-direct-generateobject.sh (gate non in esame → passa sempre)
  cat > "$SANDBOX_DIR/scripts/check-ai-direct-generateobject.sh" << 'STUB'
#!/bin/bash
exit 0
STUB
  chmod +x "$SANDBOX_DIR/scripts/check-ai-direct-generateobject.sh"

  # ── Installa il hook reale ────────────────────────────────────────────────
  cp "$PRE_COMMIT_SRC" "$SANDBOX_DIR/.git/hooks/pre-commit"
  chmod +x "$SANDBOX_DIR/.git/hooks/pre-commit"
}

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (1): scripts/pre-commit contiene la chiamata a check-deploy-build-step-numbers.sh"
# ──────────────────────────────────────────────────────────────────────────────
if grep -qF "check-deploy-build-step-numbers.sh" "$PRE_COMMIT_SRC"; then
  ok "scripts/pre-commit contiene la chiamata al gate step-numbering"
else
  nok "scripts/pre-commit NON contiene 'check-deploy-build-step-numbers.sh' — gate non wired"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (2): hook blocca il commit quando deploy-build.sh ha TOTAL stantio → exit 1"
# ──────────────────────────────────────────────────────────────────────────────
make_sandbox

# Fixture: 3 step reali ma tutte dichiarano TOTAL=2 (stantio)
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — TOTAL stantio: dichiara [N/2] ma ci sono 3 step reali
log() { echo "$*"; }
log "=== [1/2] Step uno — desc"
log "=== [2/2] Step due — desc"
log "=== [3/2] Step tre — step aggiunto senza rinumerare il TOTAL"
FIXTURE

cd "$SANDBOX_DIR"
git add scripts/deploy-build.sh

EXIT_STALE=0
OUTPUT_STALE=$(PATH="$SANDBOX_DIR/bin:$PATH" bash .git/hooks/pre-commit 2>&1) || EXIT_STALE=$?

if [ "$EXIT_STALE" -eq 1 ]; then
  ok "hook esce con exit 1 — commit bloccato su TOTAL stantio"
else
  nok "hook esce con exit $EXIT_STALE invece di 1 — TOTAL stantio non ha bloccato il commit (REGRESSIONE)"
  echo "     Output del hook:"
  echo "$OUTPUT_STALE" | sed 's/^/       /'
fi

# Verifica che l'output menzioni esplicitamente il gate o la violazione step
if echo "$OUTPUT_STALE" | grep -qi "step\|TOTAL\|numbering\|deploy-build"; then
  ok "output hook menziona il gate step-numbering — gate raggiunto ed eseguito"
else
  nok "output hook non menziona 'step/TOTAL/numbering/deploy-build' — gate potrebbe non essere stato eseguito"
  echo "     Output del hook:"
  echo "$OUTPUT_STALE" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (3): hook lascia passare il commit quando deploy-build.sh è numerato correttamente → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
make_sandbox

# Fixture corretta: 3 step con TOTAL=3
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — numerazione corretta
log() { echo "$*"; }
log "=== [1/3] Step uno — desc"
log "=== [2/3] Step due — desc"
log "=== [3/3] Step tre — desc"
FIXTURE

cd "$SANDBOX_DIR"
git add scripts/deploy-build.sh

EXIT_OK=0
OUTPUT_OK=$(PATH="$SANDBOX_DIR/bin:$PATH" bash .git/hooks/pre-commit 2>&1) || EXIT_OK=$?

if [ "$EXIT_OK" -eq 0 ]; then
  ok "hook esce con exit 0 — numerazione corretta non blocca il commit"
else
  nok "hook esce con exit $EXIT_OK invece di 0 — commit bloccato ingiustamente (REGRESSIONE)"
  echo "     Output del hook:"
  echo "$OUTPUT_OK" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-pre-commit-hook-wiring FALLITO."
  exit 1
fi
echo "✅ Regression test check-pre-commit-hook-wiring: tutte le asserzioni superate."
exit 0
