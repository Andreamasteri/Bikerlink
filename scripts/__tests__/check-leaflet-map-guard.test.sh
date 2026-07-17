#!/bin/bash
# check-leaflet-map-guard.test.sh
#
# Regression test per il gate check-leaflet-map-guard.sh.
#
# Verifica che il gate:
#   (b) esca con codice 0 sullo stato reale del repo (nessun simbolo vietato)
#   (e) il gate sia eseguibile (permessi +x)
#   (f-p) PROTECTED contenga esattamente i 5 file Leaflet blindati originali
#   (f-f) FORBIDDEN contenga esattamente i 7 pattern vietati originali
#
# Protezione anti-bypass — due vettori distinti:
#
#   1. Rimuovere un file da PROTECTED: quel file non viene più controllato
#      per simboli di rotazione/bussola → una reintroduzione passa inosservata
#      (la "mappa nera" del ramo 55.x non verrebbe rilevata).
#
#   2. Rimuovere un pattern da FORBIDDEN: quel simbolo (es. bearing, MapNorthCompass)
#      non viene più bloccato nei file protetti → la causa della mappa nera
#      può rientrare silenziosamente nel codebase.
#
# Qualsiasi modifica a PROTECTED o FORBIDDEN richiede una modifica esplicita
# anche a questo test.
#
# Pattern modellato su scripts/__tests__/check-tc-admin-card-tests.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GATE_SCRIPT="$PROJECT_ROOT/scripts/check-leaflet-map-guard.sh"

PASS=0
FAIL=0

ok()  { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Regression test — check-leaflet-map-guard.sh"
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
  ok "check-leaflet-map-guard.sh è eseguibile"
else
  nok "check-leaflet-map-guard.sh NON è eseguibile (chmod +x mancante)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (b): stato reale del repo → exit 0"
# ──────────────────────────────────────────────────────────────────────────────
GATE_EXIT_B=0
(cd "$PROJECT_ROOT" && bash "$GATE_SCRIPT") > /dev/null 2>&1 || GATE_EXIT_B=$?

if [ "$GATE_EXIT_B" -eq 0 ]; then
  ok "exit 0 sullo stato reale del repo (nessun simbolo vietato nei file Leaflet)"
else
  nok "exit $GATE_EXIT_B — lo stato reale del repo farebbe fallire il gate (simbolo di rotazione/bearing in un file Leaflet?)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (f-p): PROTECTED contiene esattamente i 5 file Leaflet blindati originali"
# ──────────────────────────────────────────────────────────────────────────────
# Rimuovere un file da PROTECTED significa che non viene più controllato:
# simboli vietati potrebbero rientrare senza che il gate li rilevi.

EXPECTED_PROTECTED=(
  "components/InteractiveMap.tsx"
  "lib/leaflet-map-html.ts"
  "lib/leaflet-tracking-map-html.ts"
  "lib/leaflet-picker-map-html.ts"
  "components/map/createMapMessageHandler.ts"
)

# Estrai gli entry di PROTECTED dallo script del gate (tra "PROTECTED=(" e ")")
ACTUAL_PROTECTED=()
in_protected=false
while IFS= read -r line; do
  if [[ "$line" =~ ^PROTECTED=\( ]]; then
    in_protected=true
    continue
  fi
  if $in_protected; then
    if [[ "$line" =~ ^\) ]]; then
      break
    fi
    if [[ "$line" =~ \"([^\"]+)\" ]]; then
      ACTUAL_PROTECTED+=("${BASH_REMATCH[1]}")
    fi
  fi
done < "$GATE_SCRIPT"

PROTECTED_OK=true

if [ "${#ACTUAL_PROTECTED[@]}" -ne "${#EXPECTED_PROTECTED[@]}" ]; then
  nok "PROTECTED ha ${#ACTUAL_PROTECTED[@]} entry invece di ${#EXPECTED_PROTECTED[@]} — aggiunta o rimozione non autorizzata!"
  echo "     Entry trovati: ${ACTUAL_PROTECTED[*]:-<nessuno>}"
  echo "     Entry attesi:  ${EXPECTED_PROTECTED[*]}"
  PROTECTED_OK=false
else
  for i in "${!EXPECTED_PROTECTED[@]}"; do
    if [ "${ACTUAL_PROTECTED[$i]:-}" != "${EXPECTED_PROTECTED[$i]}" ]; then
      nok "PROTECTED[$i]: trovato '${ACTUAL_PROTECTED[$i]:-<vuoto>}', atteso '${EXPECTED_PROTECTED[$i]}'"
      PROTECTED_OK=false
    fi
  done
fi

if $PROTECTED_OK; then
  ok "PROTECTED contiene esattamente i 5 file blindati originali (nessun indebolimento silenzioso)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Test (f-f): FORBIDDEN contiene esattamente i 7 pattern vietati originali"
# ──────────────────────────────────────────────────────────────────────────────
# Rimuovere un pattern da FORBIDDEN significa che quel simbolo non viene più
# bloccato: la causa della mappa nera (es. bearing, MapNorthCompass) potrebbe
# rientrare nel path Leaflet senza essere rilevata.

EXPECTED_FORBIDDEN=(
  "leaflet-rotate"
  "leaflet_rotate"
  "MapNorthCompass"
  "resetBearing"
  "getMapBearing"
  "rotateend"
  "(^|[^A-Za-z0-9_])bearing([^A-Za-z0-9_]|\$)"
)

# Estrai gli entry di FORBIDDEN dallo script del gate (tra "FORBIDDEN=(" e ")")
ACTUAL_FORBIDDEN=()
in_forbidden=false
while IFS= read -r line; do
  if [[ "$line" =~ ^FORBIDDEN=\( ]]; then
    in_forbidden=true
    continue
  fi
  if $in_forbidden; then
    if [[ "$line" =~ ^\) ]]; then
      break
    fi
    if [[ "$line" =~ \"([^\"]+)\" ]]; then
      ACTUAL_FORBIDDEN+=("${BASH_REMATCH[1]}")
    fi
  fi
done < "$GATE_SCRIPT"

FORBIDDEN_OK=true

if [ "${#ACTUAL_FORBIDDEN[@]}" -ne "${#EXPECTED_FORBIDDEN[@]}" ]; then
  nok "FORBIDDEN ha ${#ACTUAL_FORBIDDEN[@]} entry invece di ${#EXPECTED_FORBIDDEN[@]} — aggiunta o rimozione non autorizzata!"
  echo "     Entry trovati: ${ACTUAL_FORBIDDEN[*]:-<nessuno>}"
  echo "     Entry attesi:  ${EXPECTED_FORBIDDEN[*]}"
  FORBIDDEN_OK=false
else
  for i in "${!EXPECTED_FORBIDDEN[@]}"; do
    if [ "${ACTUAL_FORBIDDEN[$i]:-}" != "${EXPECTED_FORBIDDEN[$i]}" ]; then
      nok "FORBIDDEN[$i]: trovato '${ACTUAL_FORBIDDEN[$i]:-<vuoto>}', atteso '${EXPECTED_FORBIDDEN[$i]}'"
      FORBIDDEN_OK=false
    fi
  done
fi

if $FORBIDDEN_OK; then
  ok "FORBIDDEN contiene esattamente i 7 pattern vietati originali (nessun indebolimento silenzioso)"
fi

# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Regression test check-leaflet-map-guard FALLITO."
  exit 1
fi
echo "✅ Regression test check-leaflet-map-guard: tutte le asserzioni superate."
exit 0
