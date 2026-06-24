#!/usr/bin/env bash
# test-check-inline-default-memo-deps.sh
#
# Regression test per scripts/check-inline-default-memo-deps.sh
#
# Crea snippet .tsx sintetici, esegue il gate su ognuno e verifica:
#   - exit code atteso (0=OK / 1=FAIL)
#   - che le linee violanti (o assenza di violazioni) siano riportate
#     correttamente nell'output del gate
#
# Modalità coperte:
#   Mode A  — useMemo/useCallback single-liner con [] o {} nei deps
#   Mode B  — deps array su propria riga, [] dentro
#   Mode C1 — hook + ", [" sulla stessa riga, [] su linea interna
#   Mode C2 — hook su riga propria, "," + "[" su riga propria, [] interno
#   Safe    — soppressione inline / riga precedente
#   Guard   — tipo `string[]` non deve fare scattare il gate
#   Guard   — deps vuoti `[]` non devono fare scattare il gate

set -uo pipefail

GATE="$(cd "$(dirname "$0")" && pwd)/check-inline-default-memo-deps.sh"

if [ ! -f "$GATE" ]; then
  echo "❌ Gate script non trovato: $GATE"
  exit 1
fi

PASS=0
FAIL=0
declare -a RESULTS

WORK_DIR=$(mktemp -d)
SNIPPET="$WORK_DIR/snippet.tsx"
trap 'rm -rf "$WORK_DIR"' EXIT

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

run_case() {
  local desc="$1"
  local expect_exit="$2"   # 0 = gate passes, 1 = gate fails
  local content="$3"
  local expected_grep="${4:-}"   # stringa da cercare nell'output (facoltativo)

  printf '%s' "$content" > "$SNIPPET"

  local actual_exit=0
  local output
  output=$(cd "$WORK_DIR" && bash "$GATE" 2>&1) || actual_exit=$?

  local ok=true

  # Verifica exit code
  if [ "$actual_exit" -ne "$expect_exit" ]; then
    ok=false
    RESULTS+=("❌ FAIL [$desc] exit atteso=$expect_exit ottenuto=$actual_exit")
  fi

  # Se richiesto, verifica che l'output contenga la stringa attesa
  if [ -n "$expected_grep" ]; then
    if ! echo "$output" | grep -qF "$expected_grep"; then
      ok=false
      RESULTS+=("❌ FAIL [$desc] output non contiene '$expected_grep'")
      RESULTS+=("   Output effettivo: $(echo "$output" | head -8 | sed 's/^/   /')")
    fi
  fi

  if $ok; then
    RESULTS+=("✅ PASS [$desc]")
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# VERI POSITIVI — il gate DEVE segnalare una violazione (exit 1)
# ─────────────────────────────────────────────────────────────────────────────

# Mode A: useMemo single-liner con [] nei deps
run_case \
  "Mode A — useMemo [] nei deps (single-line)" \
  1 \
  'const x = useMemo(() => data?.items ?? [], [data?.items ?? []]);' \
  "data?.items ?? []"

# Mode A: useMemo single-liner con {} nei deps
run_case \
  "Mode A — useMemo {} nei deps (single-line)" \
  1 \
  'const x = useMemo(() => opts ?? {}, [opts ?? {}]);' \
  "opts ?? {}"

# Mode A: useCallback single-liner con [] nei deps
run_case \
  "Mode A — useCallback [] nei deps (single-line)" \
  1 \
  'const cb = useCallback(() => doStuff(), [items ?? []]);' \
  "items ?? []"

# Mode A: [] nudo (non come fallback) nei deps
run_case \
  "Mode A — [] nudo nei deps (single-line)" \
  1 \
  'const x = useMemo(() => compute(), [a, [], b]);' \
  "a, [], b"

# Mode B: deps array su propria riga con [] dentro
run_case \
  "Mode B — deps su propria riga con [] dentro" \
  1 \
  'const x = useMemo(
  () => compute(),
  [dep ?? []]
);' \
  "dep ?? []"

# Mode B: useCallback deps su propria riga con {} dentro
run_case \
  "Mode B — useCallback deps su propria riga con {} dentro" \
  1 \
  'const cb = useCallback(
  () => doStuff(),
  [cfg ?? {}]
);' \
  "cfg ?? {}"

# Mode C1: hook + ", [" sulla stessa riga, [] su linea interna
run_case \
  "Mode C1 — apertura deps sulla stessa riga del hook, [] su linea interna" \
  1 \
  'const x = useMemo(() => compute(), [
  dep1,
  dep2 ?? [],
  dep3,
]);' \
  "dep2 ?? []"

# Mode C1: useCallback, {} su linea interna
run_case \
  "Mode C1 — useCallback, {} su linea interna" \
  1 \
  'const cb = useCallback(() => fn(), [
  a,
  b ?? {},
]);' \
  "b ?? {}"

# Mode C2: forma a tre righe, [] su linea interna
run_case \
  "Mode C2 — tre righe (hook / callback / '[') con [] interno" \
  1 \
  'const x = useMemo(
  () => compute(),
  [
    depA,
    depB ?? [],
    depC,
  ]
);' \
  "depB ?? []"

# Mode C2: useCallback tre righe con {} interno
run_case \
  "Mode C2 — useCallback tre righe con {} interno" \
  1 \
  'const cb = useCallback(
  () => fn(),
  [
    alpha,
    beta ?? {},
  ]
);' \
  "beta ?? {}"

# ─────────────────────────────────────────────────────────────────────────────
# FALSI POSITIVI — il gate NON deve segnalare violazioni (exit 0)
# ─────────────────────────────────────────────────────────────────────────────

# Soppressione inline sulla stessa riga
run_case \
  "Safe — soppressione inline (stessa riga)" \
  0 \
  'const x = useMemo(() => x ?? [], [x ?? []]); // check-inline-default-memo-deps: safe — stabile'

# Soppressione sulla riga precedente
run_case \
  "Safe — soppressione su riga precedente" \
  0 \
  'const x = useMemo(
  () => compute(),
  // check-inline-default-memo-deps: safe — il ricalcolo non ha side-effect
  [dep ?? []]
);'

# Soppressione Mode C1 su linea interna
run_case \
  "Safe — soppressione su riga interna Mode C1" \
  0 \
  'const x = useMemo(() => compute(), [
  dep1,
  // check-inline-default-memo-deps: safe — valore sempre stabile
  dep2 ?? [],
]);'

# Annotazione di tipo: string[] nei deps NON deve scattare (lookbehind (?<!\w))
run_case \
  "Guard — annotazione tipo string[] non deve scattare (Mode C interior)" \
  0 \
  'const x = useMemo(
  () => compute(),
  [
    (items as string[]),
  ]
);'

# Deps con scalare primitivo — nessun [] o {} nel bracket, nessuna violazione
run_case \
  "Guard — deps con scalare primitivo non scattano" \
  0 \
  'const x = useMemo(() => compute(), [dep]);'

# Deps vuoti [] — non contengono [] dentro, nessuna violazione
run_case \
  "Guard — deps vuoti [] non devono scattare" \
  0 \
  'const x = useMemo(() => compute(), []);'

# Codice pulito senza useMemo/useCallback — nessuna violazione
run_case \
  "Guard — file senza useMemo/useCallback è pulito" \
  0 \
  'export const value = [a ?? [], b ?? {}];'

# useMemo con deps normali (nessun [] o {} dentro) — nessuna violazione
run_case \
  "Guard — useMemo con deps normali non scatta" \
  0 \
  'const x = useMemo(() => items ?? [], [items]);'

# [] nel CORPO del callback (non nei deps) — nessuna violazione Mode A
run_case \
  "Guard — [] nel corpo del callback (non nei deps)" \
  0 \
  'const x = useMemo(() => data?.items ?? [], [data?.items]);'

# Forma Mode C2 ma con [] nel corpo prima della virgola (non in deps position)
run_case \
  "Guard — Mode C2 con array nel corpo, deps privi di [] interno" \
  0 \
  'const x = useMemo(
  () => {
    const arr = items ?? [];
    return arr;
  },
  [items]
);'

# ─────────────────────────────────────────────────────────────────────────────
# Riepilogo
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Risultati test: check-inline-default-memo-deps"
echo "═══════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "  Totale: $((PASS + FAIL))  ✅ Passati: $PASS  ❌ Falliti: $FAIL"
echo "═══════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "💥 test-check-inline-default-memo-deps FALLITO ($FAIL test falliti)"
  exit 1
fi

echo "✅ Tutti i test passati."
exit 0
