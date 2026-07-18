#!/bin/bash
# test-cerbero-curl-err-cleanup.sh — Smoke test per la pulizia dei file
# curl-err stale lasciati da un SIGKILL su cerbero.sh.
#
# Verifica:
#   1. STARTUP: il blocco di pulizia all'avvio rimuove i file stale (PID diverso)
#              e logga "STARTUP: rimosso file curl-err stale…"
#   2. RUNTIME: il blocco periodico (ogni ora) rimuove i file stale rilevati
#              dopo lo startup e logga "CLEANUP: rimosso file curl-err stale…"
#   3. STESSO PID: cerbero NON rimuove il file del proprio PID corrente durante
#              lo startup (è in uso dalla probe in volo).
#   4. STESSO PID stale >1h: il blocco periodico rimuove anche il file del PID
#              corrente se ha più di 3600 secondi (probe bloccata).
#
# Non avvia il loop di cerbero.sh: estrae inline i blocchi di cleanup e li
# esegue in un processo con $$ reale, così i controlli PID sono corretti.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Setup log temporaneo ───────────────────────────────────────────────────────
TEST_LOG="$(mktemp /tmp/cerbero-test-log.XXXXXX)"
CERBERO_LOG_FILE="$TEST_LOG"
CERBERO_LOG_MAX_BYTES=1048576
METRO_LOCK_FILE="/tmp/start-metro.lock"
BACKEND_PORT=5000
export CERBERO_LOG_FILE CERBERO_LOG_MAX_BYTES METRO_LOCK_FILE BACKEND_PORT

# shellcheck source=scripts/cerbero-lib.sh
source "$SCRIPT_DIR/cerbero-lib.sh"

PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

cleanup_all() {
  rm -f /tmp/cerbero-health-curl-err.99999 \
         /tmp/cerbero-health-curl-err.88888 \
         /tmp/cerbero-health-curl-err."$$" \
         "$TEST_LOG" 2>/dev/null || true
}
trap cleanup_all EXIT

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ TEST 1: STARTUP — rimozione file stale (PID falso 99999) ══"
# ══════════════════════════════════════════════════════════════════════════════

# Piazza un file finto come se fosse rimasto da una vecchia istanza uccisa con
# SIGKILL (PID 99999 sicuramente non appartiene a questa istanza).
touch /tmp/cerbero-health-curl-err.99999

echo "  [setup] creato /tmp/cerbero-health-curl-err.99999"

# Esegui il blocco di startup identico a cerbero.sh (linee 81-89).
for _stale_f in /tmp/cerbero-health-curl-err.*; do
  [ -f "$_stale_f" ] || continue
  _stale_pid="${_stale_f##*.}"
  if [ "$_stale_pid" != "$$" ]; then
    rm -f "$_stale_f" 2>/dev/null || true
    cerbero_log "STARTUP: rimosso file curl-err stale di istanza precedente: $_stale_f"
  fi
done
unset _stale_f _stale_pid

# Verifica 1a: file rimosso.
if [ ! -f /tmp/cerbero-health-curl-err.99999 ]; then
  pass "file /tmp/cerbero-health-curl-err.99999 rimosso dallo startup cleanup"
else
  fail "file /tmp/cerbero-health-curl-err.99999 ancora presente dopo lo startup cleanup"
fi

# Verifica 1b: log contiene il messaggio atteso.
if grep -q "STARTUP: rimosso file curl-err stale" "$TEST_LOG"; then
  pass "log contiene 'STARTUP: rimosso file curl-err stale'"
else
  fail "log NON contiene 'STARTUP: rimosso file curl-err stale'"
  echo "  [log dump]:"
  cat "$TEST_LOG"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ TEST 2: STARTUP — file del PID corrente NON rimosso ══"
# ══════════════════════════════════════════════════════════════════════════════

# Il file con PID == $$ non deve essere toccato: è la probe in volo di questa
# stessa istanza.
own_file="/tmp/cerbero-health-curl-err.$$"
touch "$own_file"
echo "  [setup] creato $own_file (PID corrente: $$)"

# Re-esegui il blocco startup.
for _stale_f in /tmp/cerbero-health-curl-err.*; do
  [ -f "$_stale_f" ] || continue
  _stale_pid="${_stale_f##*.}"
  if [ "$_stale_pid" != "$$" ]; then
    rm -f "$_stale_f" 2>/dev/null || true
    cerbero_log "STARTUP: rimosso file curl-err stale di istanza precedente: $_stale_f"
  fi
done
unset _stale_f _stale_pid

if [ -f "$own_file" ]; then
  pass "file del PID corrente ($own_file) NON rimosso dallo startup cleanup"
else
  fail "file del PID corrente ($own_file) rimosso erroneamente dallo startup cleanup"
fi

# Pulizia manuale per i test successivi.
rm -f "$own_file"

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ TEST 3: RUNTIME CLEANUP periodico — rimozione file stale (PID 88888) ══"
# ══════════════════════════════════════════════════════════════════════════════

touch /tmp/cerbero-health-curl-err.88888
echo "  [setup] creato /tmp/cerbero-health-curl-err.88888"

now=$(date +%s)
last_tmp_cleanup=0   # Simula che l'ultimo cleanup sia stato "mai" → 3600s+ fa.

# Esegui il blocco periodico identico a cerbero.sh (linee 393-408).
if [ $((now - last_tmp_cleanup)) -ge 3600 ]; then
  for _old_f in /tmp/cerbero-health-curl-err.*; do
    [ -f "$_old_f" ] || continue
    _old_pid="${_old_f##*.}"
    if [ "$_old_pid" != "$$" ]; then
      rm -f "$_old_f" 2>/dev/null || true
      cerbero_log "CLEANUP: rimosso file curl-err stale (PID $$ ≠ $_old_pid): $_old_f"
    elif [ $((now - $(stat -c%Y "$_old_f" 2>/dev/null || echo 0))) -ge 3600 ]; then
      rm -f "$_old_f" 2>/dev/null || true
      cerbero_log "CLEANUP: rimosso file curl-err del PID corrente rimasto >1h: $_old_f"
    fi
  done
  unset _old_f _old_pid
  last_tmp_cleanup=$now
fi

# Verifica 3a: file rimosso.
if [ ! -f /tmp/cerbero-health-curl-err.88888 ]; then
  pass "file /tmp/cerbero-health-curl-err.88888 rimosso dal cleanup periodico"
else
  fail "file /tmp/cerbero-health-curl-err.88888 ancora presente dopo il cleanup periodico"
fi

# Verifica 3b: log contiene il messaggio CLEANUP.
if grep -q "CLEANUP: rimosso file curl-err stale" "$TEST_LOG"; then
  pass "log contiene 'CLEANUP: rimosso file curl-err stale'"
else
  fail "log NON contiene 'CLEANUP: rimosso file curl-err stale'"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ TEST 4: RUNTIME CLEANUP — file PID corrente rimasto >1h ══"
# ══════════════════════════════════════════════════════════════════════════════

# Simula un file del PID corrente più vecchio di 3600s usando touch -d.
own_old_file="/tmp/cerbero-health-curl-err.$$"
touch -d "2 hours ago" "$own_old_file" 2>/dev/null || touch "$own_old_file"
echo "  [setup] creato $own_old_file (PID corrente, mtime artificialmente vecchio)"

now=$(date +%s)
last_tmp_cleanup=0

if [ $((now - last_tmp_cleanup)) -ge 3600 ]; then
  for _old_f in /tmp/cerbero-health-curl-err.*; do
    [ -f "$_old_f" ] || continue
    _old_pid="${_old_f##*.}"
    if [ "$_old_pid" != "$$" ]; then
      rm -f "$_old_f" 2>/dev/null || true
      cerbero_log "CLEANUP: rimosso file curl-err stale (PID $$ ≠ $_old_pid): $_old_f"
    elif [ $((now - $(stat -c%Y "$_old_f" 2>/dev/null || echo 0))) -ge 3600 ]; then
      rm -f "$_old_f" 2>/dev/null || true
      cerbero_log "CLEANUP: rimosso file curl-err del PID corrente rimasto >1h: $_old_f"
    fi
  done
  unset _old_f _old_pid
  last_tmp_cleanup=$now
fi

# Verifica 4a: file rimosso.
if [ ! -f "$own_old_file" ]; then
  pass "file PID corrente rimasto >1h rimosso dal cleanup periodico"
else
  fail "file PID corrente rimasto >1h NON rimosso dal cleanup periodico"
fi

# Verifica 4b: log contiene il messaggio per il PID corrente.
if grep -q "rimasto >1h" "$TEST_LOG"; then
  pass "log contiene 'rimasto >1h' per il file del PID corrente anomalo"
else
  fail "log NON contiene 'rimasto >1h'"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ TEST 5: nessun file stale residuo dopo i due cleanup ══"
# ══════════════════════════════════════════════════════════════════════════════

residui=$(find /tmp -maxdepth 1 -name 'cerbero-health-curl-err.*' 2>/dev/null | wc -l)
if [ "$residui" -eq 0 ]; then
  pass "nessun file curl-err stale residuo in /tmp"
else
  fail "$residui file curl-err ancora presenti in /tmp:"
  find /tmp -maxdepth 1 -name 'cerbero-health-curl-err.*' 2>/dev/null || true
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "══ RISULTATO FINALE ══"
echo "  Passati: $PASS"
echo "  Falliti: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "FAIL — $FAIL test falliti."
  echo ""
  echo "Log completo:"
  cat "$TEST_LOG"
  exit 1
else
  echo "PASS — tutti i $PASS test superati."
  exit 0
fi
