#!/bin/bash
# check-ai-direct-generateobject.test.sh
#
# Regression test per il gate check-ai-direct-generateobject.sh (Check 1).
#
# Verifica che il gate:
#   (a) esca con codice 1 quando un NUOVO file server/*.ts usa generateObject
#       con schema: fuori dalla WHITELIST
#   (b) esca con codice 0 sullo stato reale del repo
#   (e) il gate sia eseguibile (permessi +x)
#   (f) la WHITELIST (embedded nel Python heredoc del gate) contenga
#       esattamente 'server/ai/moderation/provider.ts'
#
# Protezione anti-bypass: aggiungere un file alla WHITELIST nel Python heredoc
# permetterebbe di silenziare silenziosamente il Check 1 per quel file,
# consentendo l'uso di generateObject con schema al di fuori del gateway
# approvato (generateStructured). Qualsiasi aggiunta richiede una modifica
# esplicita anche a questo test.
#
# Pattern modellato su scripts/__tests__/check-tc-admin-card-tests.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-ai-direct-generateobject.sh"

DUMMY_SERVER_FILE="$PROJECT_ROOT/server/__ai_generateobj_test_dummy__.ts"

PASS=0
FAIL=0

cleanup() {
  rm -f "$DUMMY_SERVER_FILE" 2>/dev/null || true
}
trap cleanup EXIT

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-ai-direct-generateobject.sh"
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
  ok "check-ai-direct-generateobject.sh è eseguibile"
else
  nok "check-ai-direct-generateobject.sh NON è eseguibile (chmod +x mancante)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (a): nuovo file con generateObject + schema fuori whitelist → exit 1"
# ──────────────────────────────────────────────────────────────────────────────
# Crea un file dummy che usa generateObject con schema: fuori dalla WHITELIST.
# Il gate (Check 1) deve rilevarlo e uscire con codice 1.
cat > "$DUMMY_SERVER_FILE" <<'EOF'
// Dummy creato dal regression test — NON committare
import { generateObject } from 'ai';
import { z } from 'zod';

const mySchema = z.object({ name: z.string() });

async function badDirectGenerateObject(model: unknown): Promise<unknown> {
  const result = await generateObject({
    model: model as any,
    schema: mySchema,
    prompt: 'test prompt',
  });
  return result.object;
}
EOF

GATE_EXIT_A=0
(cd "$PROJECT_ROOT" && bash "$GATE_SCRIPT") > /dev/null 2>&1 || GATE_EXIT_A=$?
rm -f "$DUMMY_SERVER_FILE"

if [ "$GATE_EXIT_A" -eq 1 ]; then
  ok "exit 1 con nuovo file che usa generateObject + schema fuori whitelist (comportamento corretto)"
else
  nok "exit $GATE_EXIT_A invece di 1 — il gate NON rileva generateObject con schema nel file non autorizzato (REGRESSIONE)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (b): stato reale del repo → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
GATE_EXIT_B=0
(cd "$PROJECT_ROOT" && bash "$GATE_SCRIPT") > /dev/null 2>&1 || GATE_EXIT_B=$?

if [ "$GATE_EXIT_B" -eq 0 ]; then
  ok "exit 0 sullo stato reale del repo (nessuna violazione generateObject + schema)"
else
  nok "exit $GATE_EXIT_B — lo stato reale del repo farebbe fallire il gate (generateObject non autorizzato?)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (f): WHITELIST (Check 1) contiene esattamente 'server/ai/moderation/provider.ts'"
# ──────────────────────────────────────────────────────────────────────────────
# Protezione anti-bypass: aggiungere un path alla WHITELIST nel Python heredoc
# del gate esenterebbe quel file dal Check 1, permettendo a chiunque di usare
# generateObject con schema diretto senza passare per generateStructured.
# Qualsiasi aggiunta richiede una modifica esplicita anche a questo test.

EXPECTED_WHITELIST=("server/ai/moderation/provider.ts")

# Estrai le entry della WHITELIST dal Python heredoc del gate.
# La struttura attesa nel gate è:
#   WHITELIST = {
#       'server/ai/moderation/provider.ts',
#   }
ACTUAL_WHITELIST=()
in_whitelist=false
while IFS= read -r line; do
  # Inizia a collezionare dopo "WHITELIST = {"
  if [[ "$line" =~ WHITELIST[[:space:]]*=[[:space:]]*\{ ]]; then
    in_whitelist=true
    continue
  fi
  if $in_whitelist; then
    # Fine del blocco WHITELIST: riga che inizia con "}"
    if [[ "$line" =~ ^\} ]]; then
      break
    fi
    # Estrai il path dalla stringa Python (delimitatore ' o ")
    if [[ "$line" =~ [\'\"](server/[^\'\",]+)[\'\"] ]]; then
      ACTUAL_WHITELIST+=("${BASH_REMATCH[1]}")
    fi
  fi
done < "$GATE_SCRIPT"

WHITELIST_OK=true

if [ "${#ACTUAL_WHITELIST[@]}" -ne "${#EXPECTED_WHITELIST[@]}" ]; then
  nok "WHITELIST ha ${#ACTUAL_WHITELIST[@]} entry invece di ${#EXPECTED_WHITELIST[@]} — aggiunta o rimozione non autorizzata!"
  echo "     Entry trovati: ${ACTUAL_WHITELIST[*]:-<nessuno>}"
  echo "     Entry attesi:  ${EXPECTED_WHITELIST[*]}"
  WHITELIST_OK=false
else
  for i in "${!EXPECTED_WHITELIST[@]}"; do
    if [ "${ACTUAL_WHITELIST[$i]:-}" != "${EXPECTED_WHITELIST[$i]}" ]; then
      nok "WHITELIST[$i]: trovato '${ACTUAL_WHITELIST[$i]:-<vuoto>}', atteso '${EXPECTED_WHITELIST[$i]}'"
      WHITELIST_OK=false
    fi
  done
fi

if $WHITELIST_OK; then
  ok "WHITELIST contiene esattamente '${EXPECTED_WHITELIST[0]}' (nessun bypass silenzioso)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (g): IGNORE_DIRS (Check 1) contiene esattamente {'.local', '.agents', 'node_modules', 'scripts'}"
# ──────────────────────────────────────────────────────────────────────────────
# Protezione anti-bypass: aggiungere una directory a IGNORE_DIRS nel Python
# heredoc del Check 1 escluderebbe quella directory dalla scansione, permettendo
# a qualsiasi file al suo interno di bypassare silenziosamente il gate.
# Qualsiasi modifica richiede una modifica esplicita anche a questo test.

EXPECTED_IGNORE_DIRS_1=('.local' '.agents' 'node_modules' 'scripts')

# Il gate ha due heredoc Python distinti. IGNORE_DIRS appare su riga singola:
#   IGNORE_DIRS = {'.local', '.agents', 'node_modules', 'scripts'}
# Prendiamo la PRIMA occorrenza (Check 1).
IGNORE_DIRS_LINE_1=$(grep -E "IGNORE_DIRS[[:space:]]*=[[:space:]]*\{" "$GATE_SCRIPT" | sed -n '1p')
ACTUAL_IGNORE_DIRS_1=()
while IFS= read -r entry; do
  # Strip surrounding single quotes
  entry="${entry//\'/}"
  [ -n "$entry" ] && ACTUAL_IGNORE_DIRS_1+=("$entry")
done < <(echo "$IGNORE_DIRS_LINE_1" | grep -oP "'[^']+'")

IGNORE_DIRS_1_OK=true
if [ "${#ACTUAL_IGNORE_DIRS_1[@]}" -ne "${#EXPECTED_IGNORE_DIRS_1[@]}" ]; then
  nok "IGNORE_DIRS (Check 1) ha ${#ACTUAL_IGNORE_DIRS_1[@]} entry invece di ${#EXPECTED_IGNORE_DIRS_1[@]} — bypass silenzioso potenziale!"
  echo "     Entry trovati: ${ACTUAL_IGNORE_DIRS_1[*]:-<nessuno>}"
  echo "     Entry attesi:  ${EXPECTED_IGNORE_DIRS_1[*]}"
  IGNORE_DIRS_1_OK=false
else
  for i in "${!EXPECTED_IGNORE_DIRS_1[@]}"; do
    if [ "${ACTUAL_IGNORE_DIRS_1[$i]:-}" != "${EXPECTED_IGNORE_DIRS_1[$i]}" ]; then
      nok "IGNORE_DIRS (Check 1) [$i]: trovato '${ACTUAL_IGNORE_DIRS_1[$i]:-<vuoto>}', atteso '${EXPECTED_IGNORE_DIRS_1[$i]}'"
      IGNORE_DIRS_1_OK=false
    fi
  done
fi
if $IGNORE_DIRS_1_OK; then
  ok "IGNORE_DIRS (Check 1) contiene esattamente {.local, .agents, node_modules, scripts} (nessun bypass silenzioso)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (h): IGNORE_DIRS (Check 2) contiene esattamente {'.local', '.agents', 'node_modules', 'scripts'}"
# ──────────────────────────────────────────────────────────────────────────────
# Stessa protezione anti-bypass per il secondo heredoc Python (Check 2 —
# Ollama think:false). Ogni heredoc ha il proprio IGNORE_DIRS separato;
# ognuno va congelato indipendentemente.

EXPECTED_IGNORE_DIRS_2=('.local' '.agents' 'node_modules' 'scripts')

# Prendiamo la SECONDA occorrenza (Check 2).
IGNORE_DIRS_LINE_2=$(grep -E "IGNORE_DIRS[[:space:]]*=[[:space:]]*\{" "$GATE_SCRIPT" | sed -n '2p')
ACTUAL_IGNORE_DIRS_2=()
while IFS= read -r entry; do
  # Strip surrounding single quotes
  entry="${entry//\'/}"
  [ -n "$entry" ] && ACTUAL_IGNORE_DIRS_2+=("$entry")
done < <(echo "$IGNORE_DIRS_LINE_2" | grep -oP "'[^']+'")

IGNORE_DIRS_2_OK=true
if [ "${#ACTUAL_IGNORE_DIRS_2[@]}" -ne "${#EXPECTED_IGNORE_DIRS_2[@]}" ]; then
  nok "IGNORE_DIRS (Check 2) ha ${#ACTUAL_IGNORE_DIRS_2[@]} entry invece di ${#EXPECTED_IGNORE_DIRS_2[@]} — bypass silenzioso potenziale!"
  echo "     Entry trovati: ${ACTUAL_IGNORE_DIRS_2[*]:-<nessuno>}"
  echo "     Entry attesi:  ${EXPECTED_IGNORE_DIRS_2[*]}"
  IGNORE_DIRS_2_OK=false
else
  for i in "${!EXPECTED_IGNORE_DIRS_2[@]}"; do
    if [ "${ACTUAL_IGNORE_DIRS_2[$i]:-}" != "${EXPECTED_IGNORE_DIRS_2[$i]}" ]; then
      nok "IGNORE_DIRS (Check 2) [$i]: trovato '${ACTUAL_IGNORE_DIRS_2[$i]:-<vuoto>}', atteso '${EXPECTED_IGNORE_DIRS_2[$i]}'"
      IGNORE_DIRS_2_OK=false
    fi
  done
fi
if $IGNORE_DIRS_2_OK; then
  ok "IGNORE_DIRS (Check 2) contiene esattamente {.local, .agents, node_modules, scripts} (nessun bypass silenzioso)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-ai-direct-generateobject FALLITO."
  exit 1
fi
echo "✅ Regression test check-ai-direct-generateobject: tutte le asserzioni superate."
exit 0
