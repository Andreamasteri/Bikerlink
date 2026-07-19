#!/bin/bash
# check-setup-hooks-install.test.sh
#
# Regression test — full setup-hooks.sh installation path.
#
# Unlike check-pre-commit-hook-wiring.test.sh (which copies the hook directly),
# this test exercises the full setup-hooks.sh path that a developer actually
# runs on a fresh clone.  If setup-hooks.sh were changed to install a different
# source file, or its post-install wiring check were skipped, the regression
# would not be caught by the wiring test alone.
#
# Verifica che:
#   (1) setup-hooks.sh installa il hook senza errori (exit 0) e il file
#       .git/hooks/pre-commit esiste ed è eseguibile.
#   (2) Il hook installato da setup-hooks.sh blocca il commit quando
#       scripts/deploy-build.sh ha un TOTAL stantio (exit 1).
#   (3) Il hook installato da setup-hooks.sh lascia passare il commit quando
#       scripts/deploy-build.sh è numerato correttamente (exit 0).
#
# Strategia sandbox:
#   Tutto avviene in directory temporanee; il repo reale (.git/) non viene
#   mai toccato.  detect-secrets e detect-secrets-hook vengono stubbed con
#   script che escono con 0.  I gate non in esame (check-large-files-ratchet,
#   check-ai-direct-generateobject) vengono stubbed allo stesso modo.
#   Il gate check-deploy-build-step-numbers.sh è sempre quello REALE copiato
#   dal repo corrente.
#
# Pattern modellato su scripts/__tests__/check-pre-commit-hook-wiring.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

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
echo "  Regression test — setup-hooks.sh install path"
echo "  (fresh-clone: setup-hooks installa un hook funzionante)"
echo "════════════════════════════════════════════════════════════"

# ── Pre-condizioni: file sorgente devono esistere ────────────────────────────
for f in \
  "$PROJECT_ROOT/scripts/setup-hooks.sh" \
  "$PROJECT_ROOT/scripts/pre-commit" \
  "$PROJECT_ROOT/scripts/check-deploy-build-step-numbers.sh" \
  "$PROJECT_ROOT/scripts/check-pre-commit-hook-wiring.sh"; do
  if [ ! -f "$f" ]; then
    echo "ERRORE: file richiesto non trovato: $f"
    exit 1
  fi
done

# ── Helper: crea repo sandbox completo ───────────────────────────────────────
# Risultato: SANDBOX_DIR inizializzato con git repo + tutti gli script
# necessari a setup-hooks.sh, senza ancora un hook installato.
make_sandbox() {
  SANDBOX_DIR="$(mktemp -d /tmp/setup-hooks-install-test.XXXXXX)"

  # ── Init repo git minimale ────────────────────────────────────────────────
  cd "$SANDBOX_DIR"
  git init -q
  git config user.email "test@test.com"
  git config user.name "Test"
  echo "# BikerLink test sandbox" > README.md
  git add README.md
  git commit -q -m "init"

  # ── Stub binaries: detect-secrets-hook e detect-secrets ──────────────────
  # setup-hooks.sh cerca detect-secrets nel PATH; lo stubbiamo con exit 0 in
  # modo che non si lamenti dell'assenza e non tenti di scansionare il baseline.
  mkdir -p "$SANDBOX_DIR/bin"

  cat > "$SANDBOX_DIR/bin/detect-secrets-hook" << 'STUB'
#!/bin/bash
# Stub per detect-secrets-hook — sempre OK
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

  # Baseline presente: evita la logica "crea baseline al volo"
  echo '{"version":"1.5.0","plugins_used":[],"filters_used":[],"results":{},"generated_at":"2024-01-01T00:00:00Z"}' \
    > "$SANDBOX_DIR/.secrets.baseline"

  # ── Struttura scripts/ ────────────────────────────────────────────────────
  mkdir -p "$SANDBOX_DIR/scripts"

  # File reali installati da setup-hooks.sh
  cp "$PROJECT_ROOT/scripts/setup-hooks.sh"                     "$SANDBOX_DIR/scripts/setup-hooks.sh"
  cp "$PROJECT_ROOT/scripts/pre-commit"                         "$SANDBOX_DIR/scripts/pre-commit"
  cp "$PROJECT_ROOT/scripts/check-deploy-build-step-numbers.sh" "$SANDBOX_DIR/scripts/check-deploy-build-step-numbers.sh"
  cp "$PROJECT_ROOT/scripts/check-pre-commit-hook-wiring.sh"    "$SANDBOX_DIR/scripts/check-pre-commit-hook-wiring.sh"

  # Stubs per gate non in esame (devono passare per far arrivare il flusso
  # al gate step-numbering)
  cat > "$SANDBOX_DIR/scripts/check-large-files-ratchet.sh" << 'STUB'
#!/bin/bash
exit 0
STUB
  chmod +x "$SANDBOX_DIR/scripts/check-large-files-ratchet.sh"

  cat > "$SANDBOX_DIR/scripts/check-ai-direct-generateobject.sh" << 'STUB'
#!/bin/bash
exit 0
STUB
  chmod +x "$SANDBOX_DIR/scripts/check-ai-direct-generateobject.sh"
}

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (1): setup-hooks.sh installa il hook senza errori"
# ──────────────────────────────────────────────────────────────────────────────
make_sandbox

cd "$SANDBOX_DIR"
INSTALL_EXIT=0
INSTALL_OUTPUT=$(PATH="$SANDBOX_DIR/bin:$PATH" bash scripts/setup-hooks.sh 2>&1) || INSTALL_EXIT=$?

if [ "$INSTALL_EXIT" -eq 0 ]; then
  ok "setup-hooks.sh esce con exit 0 — installazione riuscita"
else
  nok "setup-hooks.sh esce con exit $INSTALL_EXIT — installazione fallita"
  echo "     Output di setup-hooks.sh:"
  echo "$INSTALL_OUTPUT" | sed 's/^/       /'
fi

if [ -f "$SANDBOX_DIR/.git/hooks/pre-commit" ] && [ -x "$SANDBOX_DIR/.git/hooks/pre-commit" ]; then
  ok ".git/hooks/pre-commit installato ed eseguibile"
else
  nok ".git/hooks/pre-commit NON trovato o NON eseguibile dopo setup-hooks.sh"
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (2): hook installato da setup-hooks.sh blocca TOTAL stantio → exit 1"
# ──────────────────────────────────────────────────────────────────────────────
make_sandbox

cd "$SANDBOX_DIR"
# Installa il hook via setup-hooks.sh (output soppresso — non è il soggetto del test)
PATH="$SANDBOX_DIR/bin:$PATH" bash scripts/setup-hooks.sh > /dev/null 2>&1

# Fixture: 3 step reali ma tutte dichiarano TOTAL=2 (stantio)
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — TOTAL stantio: dichiara [N/2] ma ci sono 3 step reali
log() { echo "$*"; }
log "=== [1/2] Step uno — desc"
log "=== [2/2] Step due — desc"
log "=== [3/2] Step tre — step aggiunto senza rinumerare il TOTAL"
FIXTURE

git add scripts/deploy-build.sh

EXIT_STALE=0
OUTPUT_STALE=$(PATH="$SANDBOX_DIR/bin:$PATH" bash .git/hooks/pre-commit 2>&1) || EXIT_STALE=$?

if [ "$EXIT_STALE" -eq 1 ]; then
  ok "hook installato da setup-hooks.sh esce con exit 1 — commit bloccato su TOTAL stantio"
else
  nok "hook esce con exit $EXIT_STALE invece di 1 — TOTAL stantio non ha bloccato il commit (REGRESSIONE)"
  echo "     Output del hook:"
  echo "$OUTPUT_STALE" | sed 's/^/       /'
fi

if echo "$OUTPUT_STALE" | grep -qi "step\|TOTAL\|numbering\|deploy-build"; then
  ok "output menziona il gate step-numbering — gate raggiunto ed eseguito"
else
  nok "output non menziona 'step/TOTAL/numbering/deploy-build' — gate potrebbe non essere stato eseguito"
  echo "     Output del hook:"
  echo "$OUTPUT_STALE" | sed 's/^/       /'
fi

rm -rf "$SANDBOX_DIR"; SANDBOX_DIR=""

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (3): hook installato da setup-hooks.sh lascia passare numerazione corretta → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
make_sandbox

cd "$SANDBOX_DIR"
PATH="$SANDBOX_DIR/bin:$PATH" bash scripts/setup-hooks.sh > /dev/null 2>&1

# Fixture corretta: 3 step con TOTAL=3
cat > "$SANDBOX_DIR/scripts/deploy-build.sh" << 'FIXTURE'
#!/bin/bash
# Fixture — numerazione corretta
log() { echo "$*"; }
log "=== [1/3] Step uno — desc"
log "=== [2/3] Step due — desc"
log "=== [3/3] Step tre — desc"
FIXTURE

git add scripts/deploy-build.sh

EXIT_OK=0
OUTPUT_OK=$(PATH="$SANDBOX_DIR/bin:$PATH" bash .git/hooks/pre-commit 2>&1) || EXIT_OK=$?

if [ "$EXIT_OK" -eq 0 ]; then
  ok "hook installato da setup-hooks.sh esce con exit 0 — numerazione corretta non blocca il commit"
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
  echo "❌ Regression test check-setup-hooks-install FALLITO."
  exit 1
fi
echo "✅ Regression test check-setup-hooks-install: tutte le asserzioni superate."
exit 0
