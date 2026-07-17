#!/bin/bash
# check-tc-admin-card-tests.test.sh
#
# Regression test per il gate check-tc-admin-card-tests.sh.
#
# Verifica che il gate:
#   (a) esca con codice 1 quando un NUOVO componente admin usa
#       /api/admin/thinkcentre-* senza render test NÉ pragma
#   (b) esca con codice 0 quando il componente ha il pragma
#       'check-tc-admin-card-tests: invalidate-only'
#   (c) esca con codice 0 quando esiste il render test atteso
#   (d) esca con codice 0 quando non ci sono candidati (nessun file TC)
#   (e) il gate sia eseguibile (permessi +x)
#
# Pattern modellato su scripts/__tests__/metro-cache-flag.test.sh
# Eseguibile in CI/post-merge come gate. Exit 0 = tutto verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-tc-admin-card-tests.sh"

# Cartelle reali usate dal gate
REAL_ADMIN_DIR="$PROJECT_ROOT/components/admin"
REAL_TESTS_DIR="$PROJECT_ROOT/components/__tests__"

TMP="$(mktemp -d /tmp/tc-card-gate-test.XXXXXX)"

PASS=0
FAIL=0

cleanup() {
  rm -rf "$TMP" 2>/dev/null || true
  # Rimuovi eventuali file temporanei lasciati nelle dir reali
  rm -f "$REAL_ADMIN_DIR/__TCTestDummy.tsx" 2>/dev/null || true
  rm -f "$REAL_TESTS_DIR/__TCTestDummy.render.test.ts" 2>/dev/null || true
}
trap cleanup EXIT

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-tc-admin-card-tests.sh"
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
  ok "check-tc-admin-card-tests.sh è eseguibile"
else
  nok "check-tc-admin-card-tests.sh NON è eseguibile (chmod +x mancante)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (a): nuovo componente TC senza render test né pragma → exit 1"
# ──────────────────────────────────────────────────────────────────────────────
# Crea un componente fittizio che usa /api/admin/thinkcentre-* ma non ha
# render test e non è nell'allowlist KNOWN_GAPS del gate.
DUMMY_COMPONENT="$REAL_ADMIN_DIR/__TCTestDummy.tsx"
cat > "$DUMMY_COMPONENT" <<'EOF'
// Componente dummy creato dal regression test — NON committare
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export default function __TCTestDummy() {
  const { data } = useQuery({
    queryKey: ["/api/admin/thinkcentre-dummy-endpoint"],
    queryFn: () => fetch("/api/admin/thinkcentre-dummy-endpoint").then(r => r.json()),
  });
  return null;
}
EOF

# Il test corrispondente NON esiste — il gate deve fallire
GATE_EXIT_A=0
bash "$GATE_SCRIPT" > /dev/null 2>&1 || GATE_EXIT_A=$?

# Pulizia componente dummy
rm -f "$DUMMY_COMPONENT"

if [ "$GATE_EXIT_A" -eq 1 ]; then
  ok "exit 1 con nuovo componente TC senza render test (comportamento corretto)"
else
  nok "exit $GATE_EXIT_A invece di 1 — il gate NON rileva il nuovo componente senza test (REGRESSIONE)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (b): pragma 'invalidate-only' → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
DUMMY_PRAGMA="$REAL_ADMIN_DIR/__TCTestDummy.tsx"
cat > "$DUMMY_PRAGMA" <<'EOF'
// Componente dummy creato dal regression test — NON committare
// check-tc-admin-card-tests: invalidate-only
import React from 'react';
import { useQueryClient } from '@tanstack/react-query';

export default function __TCTestDummyInvalidateOnly() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/thinkcentre-dummy-endpoint"] });
  return null;
}
EOF

GATE_EXIT_B=0
bash "$GATE_SCRIPT" > /dev/null 2>&1 || GATE_EXIT_B=$?

rm -f "$DUMMY_PRAGMA"

if [ "$GATE_EXIT_B" -eq 0 ]; then
  ok "exit 0 con pragma 'invalidate-only' presente (comportamento corretto)"
else
  nok "exit $GATE_EXIT_B invece di 0 — il pragma 'invalidate-only' non viene riconosciuto (REGRESSIONE)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (c): render test presente → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
DUMMY_WITH_TEST="$REAL_ADMIN_DIR/__TCTestDummy.tsx"
cat > "$DUMMY_WITH_TEST" <<'EOF'
// Componente dummy creato dal regression test — NON committare
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export default function __TCTestDummy() {
  const { data } = useQuery({
    queryKey: ["/api/admin/thinkcentre-dummy-endpoint"],
    queryFn: () => fetch("/api/admin/thinkcentre-dummy-endpoint").then(r => r.json()),
  });
  return null;
}
EOF

# Crea anche il render test atteso
DUMMY_TEST="$REAL_TESTS_DIR/__TCTestDummy.render.test.ts"
cat > "$DUMMY_TEST" <<'EOF'
// Render test dummy creato dal regression test — NON committare
describe('__TCTestDummy (regression test dummy)', () => {
  it('placeholder', () => { expect(true).toBe(true); });
});
EOF

GATE_EXIT_C=0
bash "$GATE_SCRIPT" > /dev/null 2>&1 || GATE_EXIT_C=$?

rm -f "$DUMMY_WITH_TEST" "$DUMMY_TEST"

if [ "$GATE_EXIT_C" -eq 0 ]; then
  ok "exit 0 quando il render test esiste (comportamento corretto)"
else
  nok "exit $GATE_EXIT_C invece di 0 — il gate rifiuta un componente con render test presente (REGRESSIONE)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (d): nessun candidato TC → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
# Questo si verifica semplicemente eseguendo il gate quando NON esistono
# componenti dummy (già rimossi sopra) — purché i candidati reali abbiano
# tutti il render test o siano nell'allowlist. Eseguiamo il gate ora.
GATE_EXIT_D=0
bash "$GATE_SCRIPT" > /dev/null 2>&1 || GATE_EXIT_D=$?

if [ "$GATE_EXIT_D" -eq 0 ]; then
  ok "exit 0 sullo stato reale del repo (nessun nuovo componente TC senza test)"
else
  nok "exit $GATE_EXIT_D — lo stato reale del repo farebbe fallire il gate (componente TC non coperto?)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-tc-admin-card-tests FALLITO."
  exit 1
fi
echo "✅ Regression test check-tc-admin-card-tests: tutte le asserzioni superate."
exit 0
