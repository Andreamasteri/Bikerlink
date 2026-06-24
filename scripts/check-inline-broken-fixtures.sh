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
#   1. _BROKEN"  o  _BROKEN'  o  _BROKEN`  — marcatore broken come suffisso di un valore stringa
#   2. "BROKEN_FIXTURE"        — sentinel usato come stringa letterale double-quote
#   3. 'BROKEN_FIXTURE'        — sentinel usato come stringa letterale single-quote
#   4. `BROKEN_FIXTURE`        — sentinel usato come template literal backtick
#
# Soppressione consapevole (aggiungere sopra la riga che triggera il check):
#   // check-inline-broken-fixtures: safe — <motivazione>
#
# Vedi: server/__tests__/helpers/route-fixtures.ts

set -euo pipefail

FAIL=0
VIOLATIONS=()
# Tracks file:linenum pairs already added to VIOLATIONS to prevent duplicate
# entries when a single line matches more than one pattern.
declare -A SEEN_VIOLATIONS

TEST_DIR="server/__tests__"
HELPERS_DIR="server/__tests__/helpers"
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

# Self-check 4: _BROKEN` deve essere rilevato con backtick
_SC4=$(printf '%s\n' 'const x = `FOO_BROKEN`;' | grep -F '_BROKEN`' || true)
if [ -z "$_SC4" ]; then
  echo "⚠️  Self-check 4 FALLITO — grep -F '_BROKEN\`' non rileva il caso positivo."
  FAIL=1
fi

# Self-check 5: `BROKEN_FIXTURE` come template literal
_SC5=$(printf '%s\n' 'expect(x).toBe(`BROKEN_FIXTURE`)' | grep -F '`BROKEN_FIXTURE`' || true)
if [ -z "$_SC5" ]; then
  echo "⚠️  Self-check 5 FALLITO — grep -F '\`BROKEN_FIXTURE\`' non rileva il caso positivo."
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

# Self-check negativo 3: identifier senza quote non deve matchare il backtick pattern
_SC_NEG3=$(printf '%s\n' 'const BROKEN_FIXTURE_VALUE = 42;' | grep -F '`BROKEN_FIXTURE`' || true)
if [ -n "$_SC_NEG3" ]; then
  echo "⚠️  Self-check negativo 3 FALLITO — identifier puro triggera il pattern backtick."
  FAIL=1
fi

# ── Helper: scansiona un file per un pattern fisso, con soppressione ─────────
# Deduplication: se file:linenum è già in SEEN_VIOLATIONS la riga viene saltata,
# così una riga che matcha più pattern appare una sola volta nel report.
scan_file() {
  local _file="$1"
  local _pattern="$2"
  local _label="$3"
  local _linenum _prev _prev_content _key

  while IFS= read -r _linenum; do
    [ -z "$_linenum" ] && continue

    # Deduplication: salta se questa coppia file:riga è già stata segnalata
    _key="$_file:$_linenum"
    if [ -n "${SEEN_VIOLATIONS[$_key]+x}" ]; then
      continue
    fi

    # Soppressione: commento sulla riga immediatamente precedente
    _prev=$(( _linenum - 1 ))
    _prev_content=""
    [ "$_prev" -ge 1 ] && _prev_content=$(sed -n "${_prev}p" "$_file" 2>/dev/null || true)
    if printf '%s' "$_prev_content" | grep -q 'check-inline-broken-fixtures: safe'; then
      continue
    fi

    SEEN_VIOLATIONS[$_key]=1
    VIOLATIONS+=("$_file:$_linenum  [$_label]")
    FAIL=1
  done < <(grep -nF "$_pattern" "$_file" 2>/dev/null | cut -d: -f1 || true)
}

# Self-check 6: deduplication — una riga che matcha due pattern appare solo una volta
_SC6_DEDUP_FILE=$(mktemp --suffix=.ts)
printf "%s\n" "const x = 'SOME_BROKEN'; const y = 'BROKEN_FIXTURE';" > "$_SC6_DEDUP_FILE"
_sc6_before_v=${#VIOLATIONS[@]}
_sc6_before_f=$FAIL
scan_file "$_SC6_DEDUP_FILE" "_BROKEN'"        'SC6-dedup-a'
scan_file "$_SC6_DEDUP_FILE" "'BROKEN_FIXTURE'" 'SC6-dedup-b'
_sc6_added=$(( ${#VIOLATIONS[@]} - _sc6_before_v ))
# Ripristina VIOLATIONS rimuovendo le entry di test
VIOLATIONS=("${VIOLATIONS[@]:0:$_sc6_before_v}")
# Ripristina SEEN_VIOLATIONS per il file di test
unset "SEEN_VIOLATIONS[${_SC6_DEDUP_FILE}:1]" 2>/dev/null || true
# Ripristina FAIL al valore pre-test, poi imposta 1 solo se il check fallisce
FAIL=$_sc6_before_f
rm -f "$_SC6_DEDUP_FILE"
if [ "$_sc6_added" -ne 1 ]; then
  echo "⚠️  Self-check 6 FALLITO — deduplication: riga multi-pattern segnalata $_sc6_added volte (atteso 1)."
  FAIL=1
fi

# Esci subito se i self-check hanno fallito (gate non affidabile)
if [ $FAIL -eq 1 ]; then
  echo ""
  echo "💥 check-inline-broken-fixtures FALLITO (self-check interni)"
  exit 1
fi

# ── Scan dei file di test ─────────────────────────────────────────────────────
while IFS= read -r _file; do
  # Salta la fixtures file stessa (è la sorgente autorevole — ci definisce i pattern)
  [ "$_file" = "$FIXTURES_FILE" ] && continue

  # Pattern 1a — _BROKEN" come chiusura di un valore stringa double-quote
  scan_file "$_file" '_BROKEN"' '_BROKEN come suffisso in stringa doppi apici'

  # Pattern 1b — _BROKEN' come chiusura di un valore stringa single-quote
  scan_file "$_file" "_BROKEN'" '_BROKEN come suffisso in stringa apici singoli'

  # Pattern 1c — _BROKEN` come chiusura di un template literal
  scan_file "$_file" '_BROKEN`' '_BROKEN come suffisso in template literal'

  # Pattern 2a — "BROKEN_FIXTURE" come stringa letterale double-quote
  scan_file "$_file" '"BROKEN_FIXTURE"' '"BROKEN_FIXTURE" come stringa letterale'

  # Pattern 2b — 'BROKEN_FIXTURE' come stringa letterale single-quote
  scan_file "$_file" "'BROKEN_FIXTURE'" "'BROKEN_FIXTURE' come stringa letterale"

  # Pattern 3 — `BROKEN_FIXTURE` come template literal backtick
  scan_file "$_file" '`BROKEN_FIXTURE`' '`BROKEN_FIXTURE` come template literal'

done < <(find "$TEST_DIR" -type f -name '*.ts' ! -name '*.tsx' 2>/dev/null)

# ── Check export broken-fixture da file helper non autorizzati ───────────────
#
# Solo route-fixtures.ts può ESPORTARE stringhe broken-fixture. Qualsiasi altro
# file in server/__tests__/helpers/ che esportasse tali stringhe diventerebbe
# una sorgente alternativa di fixture, vanificando la centralizzazione.
#
# Questo check scansiona i file helper (escluso route-fixtures.ts) cercando
# pattern broken che compaiano su righe con `export` oppure nelle 5 righe
# successive a un `export` (copertura best-effort per export multi-riga).
#
# Soppressione: aggiungere sopra la riga che triggera il check:
#   // check-inline-broken-fixtures: safe — <motivazione>

HELPER_EXPORT_VIOLATIONS=()
# Tracks file:linenum pairs already added to HELPER_EXPORT_VIOLATIONS.
declare -A SEEN_HELPER_EXPORT_VIOLATIONS

scan_helper_export() {
  local _file="$1"
  local _pattern="$2"
  local _label="$3"
  local _linenum _prev _prev_content _start _context _key

  while IFS= read -r _linenum; do
    [ -z "$_linenum" ] && continue

    # Deduplication: salta se questa coppia file:riga è già stata segnalata
    _key="$_file:$_linenum"
    if [ -n "${SEEN_HELPER_EXPORT_VIOLATIONS[$_key]+x}" ]; then
      continue
    fi

    # Soppressione: commento sulla riga immediatamente precedente
    _prev=$(( _linenum - 1 ))
    _prev_content=""
    [ "$_prev" -ge 1 ] && _prev_content=$(sed -n "${_prev}p" "$_file" 2>/dev/null || true)
    if printf '%s' "$_prev_content" | grep -q 'check-inline-broken-fixtures: safe'; then
      continue
    fi

    # Verifica: il pattern cade su una riga con `export` oppure nelle 5 righe
    # che seguono un `export` (gestisce dichiarazioni multi-riga).
    _start=$(( _linenum - 5 ))
    [ "$_start" -lt 1 ] && _start=1
    _context=$(sed -n "${_start},${_linenum}p" "$_file" 2>/dev/null || true)
    if ! printf '%s' "$_context" | grep -qE '\bexport\b'; then
      continue  # Non è parte di un export — il check generico copre già gli usi interni
    fi

    SEEN_HELPER_EXPORT_VIOLATIONS[$_key]=1
    HELPER_EXPORT_VIOLATIONS+=("$_file:$_linenum  [$_label]")
    FAIL=1
  done < <(grep -nF "$_pattern" "$_file" 2>/dev/null | cut -d: -f1 || true)
}

echo ""
echo "🔍 Controllo export broken-fixture da helper non autorizzati in $HELPERS_DIR/..."

while IFS= read -r _hfile; do
  [ "$_hfile" = "$FIXTURES_FILE" ] && continue

  scan_helper_export "$_hfile" '_BROKEN"'        '_BROKEN suffisso — export da helper'
  scan_helper_export "$_hfile" "_BROKEN'"        "_BROKEN suffisso — export da helper"
  scan_helper_export "$_hfile" '"BROKEN_FIXTURE"' '"BROKEN_FIXTURE" — export da helper'
  scan_helper_export "$_hfile" "'BROKEN_FIXTURE'" "'BROKEN_FIXTURE' — export da helper"

# Nessun -maxdepth: ricerca ricorsiva in helpers/ e tutte le sottocartelle
# (es. helpers/streams/, helpers/factories/), così i file nidificati non
# sfuggono al gate.  Il controllo si ferma comunque solo su .ts, non .tsx.
done < <(find "$HELPERS_DIR" -type f -name '*.ts' ! -name '*.tsx' 2>/dev/null)

if [ ${#HELPER_EXPORT_VIOLATIONS[@]} -gt 0 ]; then
  echo ""
  echo "❌ FILE HELPER esportano broken-fixture strings (NON autorizzato):"
  for _v in "${HELPER_EXPORT_VIOLATIONS[@]}"; do
    echo "   ⚠️  $_v"
  done
  echo ""
  echo "   Azione richiesta:"
  echo "   Spostare la stringa broken in server/__tests__/helpers/route-fixtures.ts"
  echo "   (sorgente autorevole unica). I test la importano da lì:"
  echo ""
  echo "     import { ROUTE_JSON_TRUNCATED_MID, BROKEN_STREAM_SENTINEL }"
  echo "       from './helpers/route-fixtures';"
  echo ""
  echo "   Se l'export è intenzionale e non duplica route-fixtures.ts, aggiungere"
  echo "   sopra la riga che triggera il check:"
  echo "     // check-inline-broken-fixtures: safe — <motivazione>"
  echo ""
fi

# ── Report finale ─────────────────────────────────────────────────────────────
if [ $FAIL -ne 0 ]; then
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
  fi
  echo "💥 check-inline-broken-fixtures FALLITO"
  exit 1
else
  echo "✅ Nessuna broken fixture inline rilevata nei file di test."
  echo "✅ Nessun export broken-fixture non autorizzato nei file helper."
fi
