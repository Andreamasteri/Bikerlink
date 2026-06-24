#!/usr/bin/env bash
# check-inline-broken-fixtures.sh
#
# Blocca l'introduzione di stringhe "broken fixture" inline nei file di test
# sotto server/__tests__/. Le fixture condivise centralizzate vivono in:
#
#   server/__tests__/helpers/route-fixtures.ts
#
# I file di test DEVONO importare da lì invece di ridefinire ad-hoc stringhe
# come '{"title":"FOO_BROKEN"' o "BROKEN_FIXTURE". Un cambiamento a routeSchema
# aggiorna il file di fixture in un unico posto; fixture duplicate nei test
# restano silenziosamente in drift.
#
# Pattern rilevati (nei file .ts sotto server/__tests__/, esclusa la fixtures):
#   1. _BROKEN"  o  _BROKEN'   — marcatore broken come suffisso di un valore stringa
#   2. "BROKEN_FIXTURE"        — sentinel usato come stringa letterale double-quote
#   3. 'BROKEN_FIXTURE'        — sentinel usato come stringa letterale single-quote
#
# Soppressione consapevole (aggiungere sopra la riga che triggera il check):
#   // check-inline-broken-fixtures: safe — <motivazione>
#
# Vedi: server/__tests__/helpers/route-fixtures.ts

set -euo pipefail

FAIL=0
VIOLATIONS=()

TEST_DIR="server/__tests__"
FIXTURES_FILE="server/__tests__/helpers/route-fixtures.ts"

# ── Self-check: la fixtures file deve esistere ───────────────────────────────
if [ ! -f "$FIXTURES_FILE" ]; then
  echo "⚠️  check-inline-broken-fixtures self-check FALLITO:"
  echo "   $FIXTURES_FILE non trovato."
  echo "   Il gate non può essere eseguito — ripristinare il file."
  exit 1
fi

echo "🔍 Controllo inline broken-fixture strings in $TEST_DIR/..."

# ── Self-checks ───────────────────────────────────────────────────────────────

# Self-check 1: _BROKEN" deve essere rilevato in un valore stringa tipico
_SC1=$(printf '%s\n' '{"title":"FOO_BROKEN"}' | grep -F '_BROKEN"' || true)
if [ -z "$_SC1" ]; then
  echo "⚠️  Self-check 1 FALLITO — grep -F '_BROKEN\"' non rileva il caso positivo."
  FAIL=1
fi

# Self-check 2: _BROKEN' deve essere rilevato con apici singoli
_SC2=$(printf "%s\n" "const x = 'FOO_BROKEN';" | grep -F "_BROKEN'" || true)
if [ -z "$_SC2" ]; then
  echo "⚠️  Self-check 2 FALLITO — grep -F \"_BROKEN'\" non rileva il caso positivo."
  FAIL=1
fi

# Self-check 3: "BROKEN_FIXTURE" come stringa letterale
_SC3=$(printf '%s\n' 'expect(x).toBe("BROKEN_FIXTURE")' | grep -F '"BROKEN_FIXTURE"' || true)
if [ -z "$_SC3" ]; then
  echo "⚠️  Self-check 3 FALLITO — grep -F '\"BROKEN_FIXTURE\"' non rileva il caso positivo."
  FAIL=1
fi

# Self-check negativo: un identifier puro non deve matchare
_SC_NEG1=$(printf '%s\n' 'const x = BROKEN_STREAM_SENTINEL;' | grep -F '_BROKEN"' || true)
if [ -n "$_SC_NEG1" ]; then
  echo "⚠️  Self-check negativo 1 FALLITO — identifier puro triggera il pattern."
  FAIL=1
fi

_SC_NEG2=$(printf '%s\n' 'const BROKEN_FIXTURE_VALUE = 42;' | grep -F '"BROKEN_FIXTURE"' || true)
if [ -n "$_SC_NEG2" ]; then
  echo "⚠️  Self-check negativo 2 FALLITO — identifier triggera il pattern string literal."
  FAIL=1
fi

# Esci subito se i self-check hanno fallito (gate non affidabile)
if [ $FAIL -eq 1 ]; then
  echo ""
  echo "💥 check-inline-broken-fixtures FALLITO (self-check interni)"
  exit 1
fi

# ── Helper: scansiona un file per un pattern fisso, con soppressione ─────────
scan_file() {
  local _file="$1"
  local _pattern="$2"
  local _label="$3"
  local _linenum _prev _prev_content

  while IFS= read -r _linenum; do
    [ -z "$_linenum" ] && continue
    # Soppressione: commento sulla riga immediatamente precedente
    _prev=$(( _linenum - 1 ))
    _prev_content=""
    [ "$_prev" -ge 1 ] && _prev_content=$(sed -n "${_prev}p" "$_file" 2>/dev/null || true)
    if printf '%s' "$_prev_content" | grep -q 'check-inline-broken-fixtures: safe'; then
      continue
    fi
    VIOLATIONS+=("$_file:$_linenum  [$_label]")
    FAIL=1
  done < <(grep -nF "$_pattern" "$_file" 2>/dev/null | cut -d: -f1 || true)
}

# ── Scan dei file di test ─────────────────────────────────────────────────────
while IFS= read -r _file; do
  # Salta la fixtures file stessa (è la sorgente autorevole — ci definisce i pattern)
  [ "$_file" = "$FIXTURES_FILE" ] && continue

  # Pattern 1a — _BROKEN" come chiusura di un valore stringa double-quote
  scan_file "$_file" '_BROKEN"' '_BROKEN come suffisso in stringa doppi apici'

  # Pattern 1b — _BROKEN' come chiusura di un valore stringa single-quote
  scan_file "$_file" "_BROKEN'" '_BROKEN come suffisso in stringa apici singoli'

  # Pattern 2a — "BROKEN_FIXTURE" come stringa letterale double-quote
  scan_file "$_file" '"BROKEN_FIXTURE"' '"BROKEN_FIXTURE" come stringa letterale'

  # Pattern 2b — 'BROKEN_FIXTURE' come stringa letterale single-quote
  scan_file "$_file" "'BROKEN_FIXTURE'" "'BROKEN_FIXTURE' come stringa letterale"

done < <(find "$TEST_DIR" -type f -name '*.ts' ! -name '*.tsx' 2>/dev/null)

# ── Report ────────────────────────────────────────────────────────────────────
if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo ""
  echo "❌ TROVATE fixture broken inline nei file di test:"
  for _v in "${VIOLATIONS[@]}"; do
    echo "   ⚠️  $_v"
  done
  echo ""
  echo "   Azione richiesta:"
  echo "   Importare i fixture condivisi da server/__tests__/helpers/route-fixtures.ts"
  echo "   invece di definire stringhe broken inline:"
  echo ""
  echo "     import { ROUTE_JSON_TRUNCATED_MID, BROKEN_STREAM_SENTINEL }"
  echo "       from './helpers/route-fixtures';"
  echo ""
  echo "   Se la fixture inline è intenzionale e non sostituisce una condivisa,"
  echo "   aggiungere sopra la riga:"
  echo "     // check-inline-broken-fixtures: safe — <motivazione>"
  echo ""
  echo "💥 check-inline-broken-fixtures FALLITO"
  exit 1
else
  echo "✅ Nessuna broken fixture inline rilevata nei file di test."
fi
