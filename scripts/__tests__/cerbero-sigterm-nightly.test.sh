#!/bin/bash
# cerbero-sigterm-nightly.test.sh — Verifica che SIGTERM (via graceful_shutdown)
# fermi sia il produttore (metro-cache-nightly.sh) sia il consumatore
# (while-loop di prefissazione) della pipeline notturna entro ~2s.
#
# Motivazione: graceful_shutdown() in cerbero.sh invia SIGTERM a:
#   1. $NIGHTLY_PID  — il PID del consumatore (lato destro della pipeline)
#   2. $(cat NIGHTLY_PRODUCER_PID_FILE) — il produttore (metro-cache-nightly.sh)
# Questa path non era mai stata testata. Se il PID file subisce una race o
# il produttore ignora SIGTERM, il job diventa orfano a ogni restart di Cerbero.
#
# Strategia: si replica solo il blocco della pipeline notturna (righe 95-103
# di cerbero.sh) in isolamento, senza avviare il resto di Cerbero. Il test
# usa la versione originale di metro-cache-nightly.sh (che dorme fino alle
# 01:00 UTC), quindi il produttore è sempre in fase di sleep quando riceve
# SIGTERM — condizione peggiore (sleep interrompibile) e migliore (RUNNING=0
# interrompe il wait).
#
# Asserzioni:
#   A — Il PID file del produttore viene scritto entro 3s dall'avvio
#   B — Il produttore (BASHPID del subshell) è vivo prima di SIGTERM
#   C — Il consumatore (pipeline PID) è vivo prima di SIGTERM
#   D — Il produttore è sparito entro 2s dopo SIGTERM
#   E — Il consumatore è sparito entro 2s dopo SIGTERM
#   F — Nessun processo residuo "metro-cache-nightly.sh" sopravvive con il
#       nostro PROJECT_ROOT come argomento (orphan-detection)
#
# Exit 0 = tutto verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NIGHTLY_SCRIPT="$PROJECT_ROOT/scripts/metro-cache-nightly.sh"

TMP="$(mktemp -d /tmp/cerbero-sigterm-test.XXXXXX)"

PASS=0
FAIL=0

cleanup() {
  # Pulizia processi rimasti (es. se il test stesso fallisce prima del SIGTERM).
  local _pid
  for _pid in "$TMP/producer.pid" "$TMP/consumer.pid"; do
    [ -f "$_pid" ] && {
      local p
      p=$(cat "$_pid" 2>/dev/null || true)
      [ -n "$p" ] && kill -9 "$p" 2>/dev/null || true
    }
  done
  # Uccidi qualsiasi metro-cache-nightly ancora in giro per questo tmp dir.
  pkill -9 -f "metro-cache-nightly.sh" 2>/dev/null || true
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

ok()      { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok()     { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
info()    { echo "  [INFO] $1"; }
section() { echo ""; echo "── $1"; }

echo "════════════════════════════════════════════════════════════"
echo "  Test SIGTERM → graceful_shutdown (pipeline notturna)"
echo "════════════════════════════════════════════════════════════"

# Pre-condizione: gli script devono esistere ed essere eseguibili.
[ -f "$NIGHTLY_SCRIPT" ] || { echo "ERRORE: $NIGHTLY_SCRIPT mancante"; exit 1; }
[ -x "$NIGHTLY_SCRIPT" ] || { echo "ERRORE: $NIGHTLY_SCRIPT non eseguibile"; exit 1; }

# ── Variabili di ambiente isolate per il job notturno ────────────────────────
ISOLATED_LOCK="$TMP/nonexistent-metro.lock"   # Lock inesistente → purge_safe() = true, ma
                                               # il job dorme comunque fino alle 01:00.
ISOLATED_PURGE_FLAG="$TMP/metro-cache-purged"
ISOLATED_LOG="$TMP/cerbero.log"
PRODUCER_PID_FILE="$TMP/producer.pid"
CONSUMER_PID_FILE="$TMP/consumer.pid"

mkdir -p "$TMP/logs"

# ══════════════════════════════════════════════════════════════════════════════
section "Fase 1 — avvio pipeline (replica righe 95-103 di cerbero.sh)"
# ══════════════════════════════════════════════════════════════════════════════

# Replica ESATTA della pipeline in cerbero.sh:
#   { echo $BASHPID > PID_FILE; exec bash metro-cache-nightly.sh } 2>&1 |
#   while IFS= read -r line; do printf '[TS] [TESTA 2 NIGHTLY] %s\n' "$line" >> log; done &
# Il PID del subshell produttore viene scritto in $PRODUCER_PID_FILE tramite
# $BASHPID (come in cerbero.sh); $! cattura il consumatore.

export METRO_LOCK_FILE="$ISOLATED_LOCK"
export METRO_CACHE_PURGE_FLAG="$ISOLATED_PURGE_FLAG"
export CERBERO_LOG_FILE="$ISOLATED_LOG"

{
  echo $BASHPID > "$PRODUCER_PID_FILE"
  exec bash "$NIGHTLY_SCRIPT"
} 2>&1 | \
  while IFS= read -r _cerbero_nightly_line; do
    printf '[%s] [TESTA 2 NIGHTLY] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" \
      "$_cerbero_nightly_line" >> "$ISOLATED_LOG"
  done &
NIGHTLY_CONSUMER_PID=$!
echo "$NIGHTLY_CONSUMER_PID" > "$CONSUMER_PID_FILE"

# Attendi che il PID file del produttore sia scritto (max 3s).
WAIT=0
while [ ! -s "$PRODUCER_PID_FILE" ] && [ "$WAIT" -lt 30 ]; do
  sleep 0.1
  WAIT=$((WAIT + 1))
done

PRODUCER_PID=$(cat "$PRODUCER_PID_FILE" 2>/dev/null || true)

# ══════════════════════════════════════════════════════════════════════════════
section "Fase 2 — asserzioni pre-SIGTERM"
# ══════════════════════════════════════════════════════════════════════════════

# A — PID file del produttore scritto entro 3s
if [ -n "$PRODUCER_PID" ] && [[ "$PRODUCER_PID" =~ ^[0-9]+$ ]]; then
  ok "PID file produttore scritto (PID: $PRODUCER_PID)"
else
  nok "PID file produttore NON scritto entro 3s (valore: '${PRODUCER_PID:-vuoto}')"
  info "Impossibile procedere senza il PID del produttore."
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  Risultato: $PASS PASS, $FAIL FAIL"
  echo "════════════════════════════════════════════════════════════"
  echo "❌ Test SIGTERM FALLITO."
  exit 1
fi

# B — Produttore vivo prima del SIGTERM
if kill -0 "$PRODUCER_PID" 2>/dev/null; then
  ok "produttore (PID $PRODUCER_PID) è vivo prima di SIGTERM"
else
  nok "produttore (PID $PRODUCER_PID) è già morto prima di SIGTERM (exit prematuro?)"
fi

# C — Consumatore vivo prima del SIGTERM
if kill -0 "$NIGHTLY_CONSUMER_PID" 2>/dev/null; then
  ok "consumatore (PID $NIGHTLY_CONSUMER_PID) è vivo prima di SIGTERM"
else
  nok "consumatore (PID $NIGHTLY_CONSUMER_PID) è già morto prima di SIGTERM"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Fase 3 — invio SIGTERM (replica graceful_shutdown di cerbero.sh)"
# ══════════════════════════════════════════════════════════════════════════════

info "Invio SIGTERM al consumatore ($NIGHTLY_CONSUMER_PID) e al produttore ($PRODUCER_PID)..."

# Replica esatta di graceful_shutdown():
#   kill -TERM $NIGHTLY_PID
#   kill -TERM $(cat NIGHTLY_PRODUCER_PID_FILE)
if kill -0 "$NIGHTLY_CONSUMER_PID" 2>/dev/null; then
  kill -TERM "$NIGHTLY_CONSUMER_PID" 2>/dev/null || true
fi
if kill -0 "$PRODUCER_PID" 2>/dev/null; then
  kill -TERM "$PRODUCER_PID" 2>/dev/null || true
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Fase 4 — asserzioni post-SIGTERM (deadline 2s)"
# ══════════════════════════════════════════════════════════════════════════════

# Attendi fino a 2s che il produttore esca.
DEADLINE=20  # × 0.1s = 2.0s
ELAPSED=0
while kill -0 "$PRODUCER_PID" 2>/dev/null && [ "$ELAPSED" -lt "$DEADLINE" ]; do
  sleep 0.1
  ELAPSED=$((ELAPSED + 1))
done

# D — Produttore sparito entro 2s
if ! kill -0 "$PRODUCER_PID" 2>/dev/null; then
  ELAPSED_MS=$((ELAPSED * 100))
  ok "produttore (PID $PRODUCER_PID) sparito entro ${ELAPSED_MS}ms da SIGTERM"
else
  nok "produttore (PID $PRODUCER_PID) ancora vivo dopo 2s da SIGTERM (orfano!)"
  # Termina forzatamente per non lasciare zombie nel sistema.
  kill -9 "$PRODUCER_PID" 2>/dev/null || true
fi

# Attendi fino a 2s aggiuntivi che il consumatore esca (il while-loop finisce
# quando il produttore chiude stdout, che avviene poco dopo SIGTERM).
ELAPSED2=0
while kill -0 "$NIGHTLY_CONSUMER_PID" 2>/dev/null && [ "$ELAPSED2" -lt "$DEADLINE" ]; do
  sleep 0.1
  ELAPSED2=$((ELAPSED2 + 1))
done

# E — Consumatore sparito entro 2s
if ! kill -0 "$NIGHTLY_CONSUMER_PID" 2>/dev/null; then
  ELAPSED2_MS=$((ELAPSED2 * 100))
  ok "consumatore (PID $NIGHTLY_CONSUMER_PID) sparito entro ${ELAPSED2_MS}ms da SIGTERM"
else
  nok "consumatore (PID $NIGHTLY_CONSUMER_PID) ancora vivo dopo 2s da SIGTERM"
  kill -9 "$NIGHTLY_CONSUMER_PID" 2>/dev/null || true
fi

wait "$NIGHTLY_CONSUMER_PID" 2>/dev/null || true

# F — Orphan detection: nessun processo residuo metro-cache-nightly.sh
# Cerchiamo processi che abbiano nel cmdline lo script con il nostro tmp dir o
# con il PROJECT_ROOT come directory di lavoro (pgrep -f cerca nell'intera
# cmdline inclusi gli argomenti).
ORPHAN_PIDS=$(pgrep -f "metro-cache-nightly.sh" 2>/dev/null || true)
if [ -z "$ORPHAN_PIDS" ]; then
  ok "nessun processo orfano metro-cache-nightly.sh rimasto dopo SIGTERM"
else
  # Verifica che non siano istanze precedenti al test (es. lanciate da Cerbero
  # reale): controlla che il PID corrisponda a quello che abbiamo avviato noi.
  REAL_ORPHAN=0
  for _opid in $ORPHAN_PIDS; do
    if [ "$_opid" = "$PRODUCER_PID" ]; then
      REAL_ORPHAN=$((REAL_ORPHAN + 1))
    fi
  done
  if [ "$REAL_ORPHAN" -eq 0 ]; then
    ok "processo metro-cache-nightly.sh trovato ma NON corrisponde al nostro produttore (istanza esterna — ok)"
    info "PID trovati da pgrep: $ORPHAN_PIDS (nostro produttore era $PRODUCER_PID)"
  else
    nok "$REAL_ORPHAN orfano/i metro-cache-nightly.sh trovato/i dopo SIGTERM (PID: $ORPHAN_PIDS)"
    kill -9 $ORPHAN_PIDS 2>/dev/null || true
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Fase 5 — verifica strutturale graceful_shutdown in cerbero.sh"
# ══════════════════════════════════════════════════════════════════════════════
CERBERO_SH="$PROJECT_ROOT/scripts/cerbero.sh"

# graceful_shutdown deve inviare SIGTERM al consumatore ($NIGHTLY_PID)
if grep -A20 'graceful_shutdown()' "$CERBERO_SH" | grep -q 'kill -TERM.*NIGHTLY_PID'; then
  ok "graceful_shutdown() invia SIGTERM al consumatore (\$NIGHTLY_PID)"
else
  nok "graceful_shutdown() NON invia SIGTERM al consumatore (\$NIGHTLY_PID)"
fi

# graceful_shutdown deve leggere il PID file e inviare SIGTERM al produttore
if grep -A20 'graceful_shutdown()' "$CERBERO_SH" | grep -q 'NIGHTLY_PRODUCER_PID_FILE'; then
  ok "graceful_shutdown() legge il PID file del produttore (NIGHTLY_PRODUCER_PID_FILE)"
else
  nok "graceful_shutdown() NON legge il PID file del produttore"
fi

if grep -A20 'graceful_shutdown()' "$CERBERO_SH" | grep -q 'kill -TERM.*_npid'; then
  ok "graceful_shutdown() invia SIGTERM al produttore tramite PID letto dal file"
else
  nok "graceful_shutdown() NON invia SIGTERM al produttore (orfano garantito!)"
fi

# metro-cache-nightly.sh deve avere trap per SIGTERM
if grep -q "trap.*SIGTERM" "$NIGHTLY_SCRIPT"; then
  ok "metro-cache-nightly.sh ha trap SIGTERM (RUNNING=0)"
else
  nok "metro-cache-nightly.sh NON ha trap SIGTERM (ignora il segnale!)"
fi

# Il PID file viene rimosso/ri-inizializzato all'avvio (evita stale di istanze SIGKILL)
if grep -q "rm -f.*NIGHTLY_PRODUCER_PID_FILE" "$CERBERO_SH"; then
  ok "cerbero.sh rimuove il PID file stale all'avvio (protezione SIGKILL)"
else
  nok "cerbero.sh NON rimuove il PID file stale all'avvio (race con restart SIGKILL)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Test SIGTERM pipeline notturna FALLITO."
  exit 1
fi
echo "✅ Test SIGTERM pipeline notturna: tutte le asserzioni superate."
exit 0
