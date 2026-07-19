#!/usr/bin/env bash
# check-pre-commit-hook-wiring.test.sh
#
# Regression test per il gate check-pre-commit-hook-wiring.sh.
#
# Verifica che il gate:
#   (a) esca con codice 1 quando .git/hooks/pre-commit è mancante
#   (b) esca con codice 1 quando .git/hooks/pre-commit non è eseguibile
#   (c) esca con codice 1 quando .git/hooks/pre-commit è stale
#       (non contiene check-deploy-build-step-numbers.sh)
#   (d) esca con codice 0 (happy path) quando il hook è presente,
#       eseguibile e contiene entrambi i GATE_MARKER
#   (e) il gate sia eseguibile (permessi +x)
#   (f) esca con codice 1 quando .git/hooks/pre-commit è stale
#       (contiene check-deploy-build-step-numbers.sh ma NON
#       check-large-files-limit-sync.sh)
#
# Tecnica: ogni caso di test usa un git repo temporaneo isolato
# (`git init` in /tmp) così il gate trova REPO_ROOT via
# `git rev-parse --show-toplevel` senza toccare mai il vero
# .git/hooks/ del workspace Replit.
#
# Pattern modellato su scripts/__tests__/check-ai-direct-generateobject.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-pre-commit-hook-wiring.sh"
GATE_MARKER="check-deploy-build-step-numbers.sh"
GATE_MARKER_2="check-large-files-limit-sync.sh"

PASS=0
FAIL=0

# ── Helper: crea un git repo temporaneo isolato ───────────────────────────────
make_temp_repo() {
  local tmpdir
  tmpdir="$(mktemp -d /tmp/hook-wiring-test.XXXXXX)"
  git init --quiet "$tmpdir" 2>/dev/null
  echo "$tmpdir"
}

cleanup_all() {
  # I tmpdir sono rimossi esplicitamente da ogni test; questa è una rete di sicurezza.
  : # noop — cleanup avviene inline per chiarezza
}
trap cleanup_all EXIT

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-pre-commit-hook-wiring.sh"
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
  ok "check-pre-commit-hook-wiring.sh è eseguibile"
else
  nok "check-pre-commit-hook-wiring.sh NON è eseguibile (chmod +x mancante)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (a): hook mancante → exit 1 con messaggio PRE-COMMIT HOOK NOT INSTALLED"
# ──────────────────────────────────────────────────────────────────────────────
TMPDIR_A="$(make_temp_repo)"
# Non creiamo nulla in .git/hooks/ → hook assente
EXIT_A=0
OUTPUT_A="$(cd "$TMPDIR_A" && bash "$GATE_SCRIPT" 2>&1)" || EXIT_A=$?
rm -rf "$TMPDIR_A"

if [ "$EXIT_A" -eq 1 ]; then
  ok "hook mancante: exit 1 (corretto)"
else
  nok "hook mancante: exit $EXIT_A invece di 1 — il gate non ha rilevato il hook mancante"
fi

if echo "$OUTPUT_A" | grep -q "PRE-COMMIT HOOK NOT INSTALLED"; then
  ok "hook mancante: messaggio 'PRE-COMMIT HOOK NOT INSTALLED' presente"
else
  nok "hook mancante: messaggio 'PRE-COMMIT HOOK NOT INSTALLED' assente nell'output"
  echo "     Output ricevuto: $(echo "$OUTPUT_A" | head -5)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (b): hook non eseguibile → exit 1 con messaggio PRE-COMMIT HOOK NOT EXECUTABLE"
# ──────────────────────────────────────────────────────────────────────────────
TMPDIR_B="$(make_temp_repo)"
mkdir -p "$TMPDIR_B/.git/hooks"
# Crea il hook con contenuto valido ma SENZA permesso +x
printf '#!/usr/bin/env bash\nbash scripts/%s\n' "$GATE_MARKER" > "$TMPDIR_B/.git/hooks/pre-commit"
chmod -x "$TMPDIR_B/.git/hooks/pre-commit"

EXIT_B=0
OUTPUT_B="$(cd "$TMPDIR_B" && bash "$GATE_SCRIPT" 2>&1)" || EXIT_B=$?
rm -rf "$TMPDIR_B"

if [ "$EXIT_B" -eq 1 ]; then
  ok "hook non eseguibile: exit 1 (corretto)"
else
  nok "hook non eseguibile: exit $EXIT_B invece di 1 — il gate non ha rilevato i permessi mancanti"
fi

if echo "$OUTPUT_B" | grep -q "PRE-COMMIT HOOK NOT EXECUTABLE"; then
  ok "hook non eseguibile: messaggio 'PRE-COMMIT HOOK NOT EXECUTABLE' presente"
else
  nok "hook non eseguibile: messaggio 'PRE-COMMIT HOOK NOT EXECUTABLE' assente nell'output"
  echo "     Output ricevuto: $(echo "$OUTPUT_B" | head -5)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (c): hook stale (senza $GATE_MARKER) → exit 1 con messaggio STALE"
# ──────────────────────────────────────────────────────────────────────────────
TMPDIR_C="$(make_temp_repo)"
mkdir -p "$TMPDIR_C/.git/hooks"
# Hook presente ed eseguibile ma NON contiene il GATE_MARKER
printf '#!/usr/bin/env bash\n# Hook stale — non include il gate step-numbering\necho "commit consentito"\n' \
  > "$TMPDIR_C/.git/hooks/pre-commit"
chmod +x "$TMPDIR_C/.git/hooks/pre-commit"

EXIT_C=0
OUTPUT_C="$(cd "$TMPDIR_C" && bash "$GATE_SCRIPT" 2>&1)" || EXIT_C=$?
rm -rf "$TMPDIR_C"

if [ "$EXIT_C" -eq 1 ]; then
  ok "hook stale: exit 1 (corretto)"
else
  nok "hook stale: exit $EXIT_C invece di 1 — il gate non ha rilevato il hook stale"
fi

if echo "$OUTPUT_C" | grep -q "STALE"; then
  ok "hook stale: messaggio 'STALE' presente nell'output"
else
  nok "hook stale: messaggio 'STALE' assente nell'output"
  echo "     Output ricevuto: $(echo "$OUTPUT_C" | head -5)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (d): happy path — hook presente, eseguibile e con entrambi i GATE_MARKER → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
TMPDIR_D="$(make_temp_repo)"
mkdir -p "$TMPDIR_D/.git/hooks"
# Hook presente, eseguibile e contiene entrambi i GATE_MARKER
printf '#!/usr/bin/env bash\nbash scripts/%s\nbash scripts/%s\n' "$GATE_MARKER" "$GATE_MARKER_2" > "$TMPDIR_D/.git/hooks/pre-commit"
chmod +x "$TMPDIR_D/.git/hooks/pre-commit"

EXIT_D=0
OUTPUT_D="$(cd "$TMPDIR_D" && bash "$GATE_SCRIPT" 2>&1)" || EXIT_D=$?
rm -rf "$TMPDIR_D"

if [ "$EXIT_D" -eq 0 ]; then
  ok "happy path: exit 0 (corretto)"
else
  nok "happy path: exit $EXIT_D invece di 0 — il gate ha fallito su un hook valido"
  echo "     Output ricevuto: $(echo "$OUTPUT_D" | head -5)"
fi

if echo "$OUTPUT_D" | grep -q "PASSATO"; then
  ok "happy path: messaggio di successo 'PASSATO' presente"
else
  nok "happy path: messaggio di successo 'PASSATO' assente nell'output"
  echo "     Output ricevuto: $(echo "$OUTPUT_D" | head -5)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (f): hook stale — ha $GATE_MARKER ma manca $GATE_MARKER_2 → exit 1 con messaggio STALE"
# ──────────────────────────────────────────────────────────────────────────────
TMPDIR_F="$(make_temp_repo)"
mkdir -p "$TMPDIR_F/.git/hooks"
# Hook presente ed eseguibile, ha il gate step-numbering ma NON il gate limit-sync
printf '#!/usr/bin/env bash\n# Hook stale — include il gate step-numbering ma non il gate limit-sync\nbash scripts/%s\n' \
  "$GATE_MARKER" > "$TMPDIR_F/.git/hooks/pre-commit"
chmod +x "$TMPDIR_F/.git/hooks/pre-commit"

EXIT_F=0
OUTPUT_F="$(cd "$TMPDIR_F" && bash "$GATE_SCRIPT" 2>&1)" || EXIT_F=$?
rm -rf "$TMPDIR_F"

if [ "$EXIT_F" -eq 1 ]; then
  ok "hook stale (limit-sync mancante): exit 1 (corretto)"
else
  nok "hook stale (limit-sync mancante): exit $EXIT_F invece di 1 — il gate non ha rilevato il limit-sync mancante"
fi

if echo "$OUTPUT_F" | grep -q "STALE"; then
  ok "hook stale (limit-sync mancante): messaggio 'STALE' presente nell'output"
else
  nok "hook stale (limit-sync mancante): messaggio 'STALE' assente nell'output"
  echo "     Output ricevuto: $(echo "$OUTPUT_F" | head -5)"
fi

if echo "$OUTPUT_F" | grep -q "LIMIT-SYNC"; then
  ok "hook stale (limit-sync mancante): messaggio specifica 'LIMIT-SYNC' presente nell'output"
else
  nok "hook stale (limit-sync mancante): messaggio 'LIMIT-SYNC' assente nell'output"
  echo "     Output ricevuto: $(echo "$OUTPUT_F" | head -5)"
fi

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
