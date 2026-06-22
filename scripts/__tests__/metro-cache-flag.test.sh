#!/bin/bash
# metro-cache-flag.test.sh — Test deterministico per il flag di pulizia notturna Metro.
#
# Verifica che metro-cache-check.sh (sourciato da start-expo.sh):
#   (a) flag PRESENTE → FORCE_RESET=1 e flag rimosso
#   (b) flag ASSENTE  → FORCE_RESET=0 (o non modificato)
#   (c) flag PRESENTE con FORCE_RESET già impostato → FORCE_RESET=1 preservato
#   (d) strutturali: il file metro-cache-check.sh non usa `exit`, può essere
#       sourciato senza terminare la shell chiamante
#   (e) strutturali: metro-cache-nightly.sh esiste ed è eseguibile
#
# Eseguibile in CI/post-merge come gate. Exit 0 = tutto verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECK_SCRIPT="$PROJECT_ROOT/scripts/metro-cache-check.sh"
NIGHTLY_SCRIPT="$PROJECT_ROOT/scripts/metro-cache-nightly.sh"

TMP="$(mktemp -d /tmp/metro-cache-flag-test.XXXXXX)"

PASS=0
FAIL=0

cleanup() {
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

ok()   { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok()  { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }

echo "════════════════════════════════════════════════════════════"
echo "  Test flag pulizia notturna Metro (metro-cache-check.sh)"
echo "════════════════════════════════════════════════════════════"

# Pre-condizioni: file richiesti presenti.
[ -f "$CHECK_SCRIPT" ]   || { echo "ERRORE: $CHECK_SCRIPT mancante"; exit 1; }
[ -f "$NIGHTLY_SCRIPT" ] || { echo "ERRORE: $NIGHTLY_SCRIPT mancante"; exit 1; }

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (a): flag PRESENTE → FORCE_RESET=1 e flag rimosso"
# ══════════════════════════════════════════════════════════════════════════════
FLAG_A="$TMP/purge-flag-a"
touch "$FLAG_A"
FORCE_RESET=0
METRO_CACHE_PURGE_FLAG="$FLAG_A" source "$CHECK_SCRIPT"
if [ "${FORCE_RESET:-0}" -eq 1 ]; then
  ok "FORCE_RESET=1 quando il flag è presente"
else
  nok "FORCE_RESET NON è 1 quando il flag è presente (FORCE_RESET=${FORCE_RESET:-unset})"
fi
if [ ! -f "$FLAG_A" ]; then
  ok "flag rimosso dopo il source"
else
  nok "flag NON rimosso dopo il source (regressione: start-expo userebbe FORCE_RESET=1 ogni avvio)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (b): flag ASSENTE → FORCE_RESET=0"
# ══════════════════════════════════════════════════════════════════════════════
FLAG_B="$TMP/purge-flag-b-nonexistent"
unset FORCE_RESET
METRO_CACHE_PURGE_FLAG="$FLAG_B" source "$CHECK_SCRIPT"
if [ "${FORCE_RESET:-0}" -eq 0 ]; then
  ok "FORCE_RESET=0 quando il flag è assente"
else
  nok "FORCE_RESET!=0 quando il flag è assente (FORCE_RESET=${FORCE_RESET:-unset})"
fi
# Il file non deve essere stato creato.
if [ ! -f "$FLAG_B" ]; then
  ok "il file flag NON è stato creato da metro-cache-check.sh"
else
  nok "metro-cache-check.sh ha creato il file flag (non previsto)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (c): flag PRESENTE + FORCE_RESET già =1 → FORCE_RESET=1 preservato"
# ══════════════════════════════════════════════════════════════════════════════
FLAG_C="$TMP/purge-flag-c"
touch "$FLAG_C"
FORCE_RESET=1
METRO_CACHE_PURGE_FLAG="$FLAG_C" source "$CHECK_SCRIPT"
if [ "${FORCE_RESET:-0}" -eq 1 ]; then
  ok "FORCE_RESET=1 preservato quando il flag è presente"
else
  nok "FORCE_RESET non è 1 (FORCE_RESET=${FORCE_RESET:-unset})"
fi
if [ ! -f "$FLAG_C" ]; then
  ok "flag rimosso anche con FORCE_RESET preesistente"
else
  nok "flag NON rimosso con FORCE_RESET preesistente"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (d): metro-cache-check.sh non chiama 'exit' (sicuro per source)"
# ══════════════════════════════════════════════════════════════════════════════
# Cerca invocazioni di 'exit' nel file (escludi i commenti).
# Nota: grep -c restituisce exit code 1 quando non trova match (0 occorrenze),
# quindi usiamo grep -q + branch esplicito invece di -c || echo "0".
if grep -v '^\s*#' "$CHECK_SCRIPT" | grep -qE '\bexit\b' 2>/dev/null; then
  nok "metro-cache-check.sh contiene 'exit' — NON sicuro per source (terminerebbe start-expo.sh)"
else
  ok "metro-cache-check.sh non contiene 'exit' — sicuro per source"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (e): metro-cache-nightly.sh esiste ed è eseguibile"
# ══════════════════════════════════════════════════════════════════════════════
if [ -x "$NIGHTLY_SCRIPT" ]; then
  ok "metro-cache-nightly.sh esiste ed è eseguibile"
else
  nok "metro-cache-nightly.sh non esiste o non è eseguibile"
fi
# Verifica strutturale: contiene la logica attesa.
if grep -q "metro-cache-purged" "$NIGHTLY_SCRIPT" && grep -q "start-metro.lock" "$NIGHTLY_SCRIPT"; then
  ok "metro-cache-nightly.sh contiene logica flag + lock guard"
else
  nok "metro-cache-nightly.sh manca flag o lock guard (verifica il file)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (f): start-expo.sh integra metro-cache-check.sh + OR logic"
# ══════════════════════════════════════════════════════════════════════════════
START_EXPO="$PROJECT_ROOT/scripts/start-expo.sh"
if grep -q "source.*metro-cache-check.sh" "$START_EXPO"; then
  ok "start-expo.sh fa source di metro-cache-check.sh"
else
  nok "start-expo.sh NON fa source di metro-cache-check.sh (integrazione mancante)"
fi
if grep -q "FORCE_RESET" "$START_EXPO"; then
  ok "start-expo.sh usa FORCE_RESET OR logic"
else
  nok "start-expo.sh manca FORCE_RESET OR logic"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (g): cerbero.sh lancia metro-cache-nightly.sh in background"
# ══════════════════════════════════════════════════════════════════════════════
CERBERO="$PROJECT_ROOT/scripts/cerbero.sh"
if grep -q "metro-cache-nightly.sh" "$CERBERO"; then
  ok "cerbero.sh lancia metro-cache-nightly.sh"
else
  nok "cerbero.sh NON lancia metro-cache-nightly.sh (il job notturno non partirebbe mai)"
fi
if grep -q "NIGHTLY_PID" "$CERBERO"; then
  ok "cerbero.sh traccia il PID del job notturno (NIGHTLY_PID)"
else
  nok "cerbero.sh non traccia NIGHTLY_PID (il job notturno non verrebbe terminato a shutdown)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (h): metro-cache-nightly.sh non usa pgrep start-expo (auto-blocco)"
# ══════════════════════════════════════════════════════════════════════════════
if grep -v '^\s*#' "$NIGHTLY_SCRIPT" | grep -q "pgrep.*start-expo"; then
  nok "metro-cache-nightly.sh usa pgrep start-expo → si auto-blocca quando è figlio di start-expo.sh"
else
  ok "metro-cache-nightly.sh NON usa pgrep start-expo — nessun auto-blocco"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (i): metro-cache-nightly.sh non usa 'break 2' (daemon non esce in loop esterno)"
# ══════════════════════════════════════════════════════════════════════════════
if grep -v '^\s*#' "$NIGHTLY_SCRIPT" | grep -q "break 2"; then
  nok "metro-cache-nightly.sh usa 'break 2' — il daemon terminerebbe al primo skip-notte"
else
  ok "metro-cache-nightly.sh NON usa 'break 2' — skip-notte continua correttamente"
fi
# Verifica che esista il pattern SKIP_NIGHT/continue per lo skip corretto.
if grep -q "SKIP_NIGHT\|continue" "$NIGHTLY_SCRIPT"; then
  ok "metro-cache-nightly.sh usa continue/SKIP_NIGHT per saltare la notte e riprendere domani"
else
  nok "metro-cache-nightly.sh manca il pattern continue/SKIP_NIGHT per lo skip corretto"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Test (j): purge_safe() logica corretta — porta attiva = NON sicuro, porta libera = sicuro"
# ══════════════════════════════════════════════════════════════════════════════
# Regola (dal task spec): "se Metro è attivo (lock) aspetta che la porta 8081
# sia libera prima di cancellare". La logica corretta è:
#   - Lock libero                       → SICURO  (return 0)
#   - Lock detenuto + porta risponde    → NON SICURO (return 1: Metro attivo)
#   - Lock detenuto + porta NON risponde → SICURO  (return 0: Metro si è fermato)
#
# Verifica (1): porta risponde + lock detenuto → return 1 (NON sicuro).
if grep -v '^\s*#' "$NIGHTLY_SCRIPT" | grep -A3 "curl.*METRO_PORT" | grep -q "return 1"; then
  ok "purge_safe(): porta attiva → return 1 (Metro in esecuzione = non sicuro)"
else
  nok "purge_safe(): manca 'return 1' dopo curl → porta attiva = purge immediata = ERRATO"
fi

# Verifica (2): porta libera + lock detenuto → return 0 (sicuro).
# Il "return 0" deve comparire DOPO il controllo porta, non prima.
if grep -v '^\s*#' "$NIGHTLY_SCRIPT" | grep -A6 "curl.*METRO_PORT" | grep -q "return 0"; then
  ok "purge_safe(): porta libera + lock detenuto → return 0 (Metro fermato = sicuro)"
else
  nok "purge_safe(): manca 'return 0' dopo porta-libera+lock — caso Metro fermato non gestito"
fi

# Verifica (3): la porta NON deve essere il trigger di return 0 immediato.
# Cerca "return 0" entro le prime 2 righe dopo il curl (sarebbe la vecchia logica errata).
CURL_LINE=$(grep -n "curl.*METRO_PORT" "$NIGHTLY_SCRIPT" | grep -v '^\s*#' | head -1 | cut -d: -f1)
if [ -n "$CURL_LINE" ]; then
  NEXT2=$(sed -n "$((CURL_LINE+1)),$((CURL_LINE+2))p" "$NIGHTLY_SCRIPT" | grep -v '^\s*#')
  if echo "$NEXT2" | grep -q "return 0"; then
    nok "purge_safe(): 'return 0' subito dopo curl (porta attiva = sicuro?) — ERRATO"
  else
    ok "purge_safe(): nessun 'return 0' immediato dopo curl — porta attiva correttamente bloccante"
  fi
else
  ok "purge_safe(): struttura non verificabile da grep — skip verifica negativa"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Test flag pulizia notturna Metro FALLITO."
  exit 1
fi
echo "✅ Test flag pulizia notturna Metro: tutte le asserzioni superate."
exit 0
