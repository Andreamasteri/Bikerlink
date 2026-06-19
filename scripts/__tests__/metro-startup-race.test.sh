#!/bin/bash
# metro-startup-race.test.sh — Test di stress DETERMINISTICO per la race all'avvio Metro.
#
# Verifica, in modo ripetibile e veloce (start-expo MOCKATO, niente Metro reale),
# che il guardiano (cerbero.sh / cerbero-lib.sh) e clean-metro-restart.sh NON
# uccidano mai un Metro in fase di avvio e NON rimuovano mai un lock attivo.
#
# Convenzione lock testata: /tmp/start-metro.lock tenuto su flock (fd 9 in
# start-expo.sh) OPPURE processo scripts/start-expo.sh attivo (pgrep) ⇒ qualsiasi
# componente che gestisce la porta 8081 DEVE osservare, mai killare.
# Vedi .agents/memory/metro-startup-race.md.
#
# Asserzioni principali:
#   (a) il lock attivo NON viene MAI rimosso mentre un owner lo detiene;
#   (b) nessun secondo "expo start" parte in concorrenza (clean-metro skippa
#       prima di exec start-expo.sh);
#   (c) nei log compaiono i messaggi di skip ("avvio in corso", "lock acquisito
#       durante il restart", "skip, nessun kill") e MAI "METRO CRASH".
#
# Eseguibile in CI/post-merge come gate. Exit 0 = tutto verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CERBERO_LIB="$PROJECT_ROOT/scripts/cerbero-lib.sh"
CERBERO_SH="$PROJECT_ROOT/scripts/cerbero.sh"
CLEAN_METRO="$PROJECT_ROOT/scripts/clean-metro-restart.sh"

# ── Area di lavoro isolata ────────────────────────────────────────────────────
TMP="$(mktemp -d /tmp/metro-race-test.XXXXXX)"
TEST_LOCK="$TMP/start-metro.lock"
# Porta sicuramente libera (range alto improbabile) per forzare metro_port_healthy=false
FREE_PORT=59137

PASS=0
FAIL=0
declare -a HOLDER_PIDS=()
declare -a FAKE_EXPO_PIDS=()

cleanup() {
  for p in "${HOLDER_PIDS[@]}" "${FAKE_EXPO_PIDS[@]}"; do
    kill "$p" 2>/dev/null || true
  done
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

ok()   { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok()  { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
info() { echo "  [INFO] $1"; }
section() { echo ""; echo "── $1"; }

# Spawna un finto "owner" del lock identico a start-expo.sh: apre fd 9 sul lock,
# acquisisce flock -n esclusivo, scrive il PID, poi resta vivo (lock detenuto).
# Restituisce il PID dell'owner; il lock è garantito acquisito al ritorno.
spawn_lock_holder() {
  local lockfile="$1"
  local ready="$lockfile.ready"
  rm -f "$ready"
  (
    exec 9>"$lockfile"
    flock -n 9 || exit 1
    echo "$$" >&9
    touch "$ready"
    exec sleep 600
  ) </dev/null >/dev/null 2>&1 &
  local pid=$!
  # Attendi acquisizione (max ~3s)
  for _ in $(seq 1 30); do
    [ -f "$ready" ] && break
    sleep 0.1
  done
  echo "$pid"
}

# Spawna un finto processo start-expo.sh per testare il ramo pgrep del gate.
spawn_fake_start_expo() {
  mkdir -p "$TMP/scripts"
  cat > "$TMP/scripts/start-expo.sh" <<'EOF'
#!/bin/bash
sleep 600
EOF
  chmod +x "$TMP/scripts/start-expo.sh"
  bash "$TMP/scripts/start-expo.sh" </dev/null >/dev/null 2>&1 &
  echo $!
}

# Rileva un start-expo.sh REALE in ambiente (es. workflow Start App attivo): in
# quel caso il gate riporterà SEMPRE "in avvio" e le asserzioni negative
# (gate=non-in-avvio) vanno saltate per restare deterministici.
ambient_start_expo_running() {
  pgrep -f "scripts/start-expo.sh" 2>/dev/null | grep -qv "$TMP" && return 0
  # pgrep -f può non includere il path TMP nel match: ricontrolla escludendo i ns
  local pids
  pids=$(pgrep -f "scripts/start-expo.sh" 2>/dev/null || true)
  [ -n "$pids" ]
}

echo "════════════════════════════════════════════════════════════"
echo "  Test stress race avvio Metro (start-expo mockato)"
echo "  Lock di test: $TEST_LOCK"
echo "════════════════════════════════════════════════════════════"

# Pre-condizioni: file richiesti presenti
[ -f "$CERBERO_LIB" ] || { echo "ERRORE: $CERBERO_LIB mancante"; exit 1; }
[ -f "$CERBERO_SH" ]  || { echo "ERRORE: $CERBERO_SH mancante"; exit 1; }
[ -f "$CLEAN_METRO" ] || { echo "ERRORE: $CLEAN_METRO mancante"; exit 1; }

# Carica il gate REALE (funzione condivisa usata sia da cerbero.sh che,
# byte-identica, da clean-metro-restart.sh).
export METRO_LOCK_FILE="$TEST_LOCK"
export CERBERO_LOG_FILE="$TMP/cerbero.log"
# shellcheck source=scripts/cerbero-lib.sh
source "$CERBERO_LIB"

# ══════════════════════════════════════════════════════════════════════════════
section "Test 1 — gate: lock DETENUTO ⇒ cerbero_metro_starting = in-avvio"
# ══════════════════════════════════════════════════════════════════════════════
HOLDER=$(spawn_lock_holder "$TEST_LOCK")
HOLDER_PIDS+=("$HOLDER")
if kill -0 "$HOLDER" 2>/dev/null && [ -f "$TEST_LOCK.ready" ]; then
  ok "owner del lock avviato (PID $HOLDER) e lock acquisito"
else
  nok "impossibile avviare l'owner del lock"
fi

METRO_LOCK_FILE="$TEST_LOCK"
if cerbero_metro_starting; then
  ok "cerbero_metro_starting riporta 'in avvio' mentre il lock è detenuto"
else
  nok "cerbero_metro_starting NON rileva il lock detenuto (race!)"
fi

# (a) il probe NON deve aver rimosso/rilasciato il lock
if [ -f "$TEST_LOCK" ]; then
  ok "il file di lock esiste ancora dopo il probe"
else
  nok "il file di lock è stato RIMOSSO dal probe (regressione!)"
fi
# Il lock deve restare effettivamente DETENUTO: un flock -n esterno deve fallire.
if ( exec 201>"$TEST_LOCK"; ! flock -n 201 ); then
  ok "il lock è ancora DETENUTO dall'owner dopo molteplici probe"
else
  nok "il lock NON è più detenuto dopo il probe (regressione!)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 2 — gate: processo start-expo.sh attivo ⇒ in-avvio (ramo pgrep)"
# ══════════════════════════════════════════════════════════════════════════════
# Rilascia il lock per isolare il ramo pgrep: il gate deve scattare comunque.
kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true
rm -f "$TEST_LOCK" "$TEST_LOCK.ready"

FAKE_EXPO=$(spawn_fake_start_expo)
FAKE_EXPO_PIDS+=("$FAKE_EXPO")
sleep 0.3
METRO_LOCK_FILE="$TMP/nonexistent.lock"   # nessun lock: deve contare solo pgrep
if cerbero_metro_starting; then
  ok "cerbero_metro_starting riporta 'in avvio' con start-expo.sh attivo (pgrep)"
else
  nok "cerbero_metro_starting NON rileva start-expo.sh attivo (race!)"
fi
kill "$FAKE_EXPO" 2>/dev/null || true
wait "$FAKE_EXPO" 2>/dev/null || true
sleep 0.3

# ══════════════════════════════════════════════════════════════════════════════
section "Test 3 — gate: nessun avvio ⇒ NON in-avvio, e il probe non tocca il lock"
# ══════════════════════════════════════════════════════════════════════════════
STALE_LOCK="$TMP/stale.lock"
: > "$STALE_LOCK"   # file presente ma NON detenuto (stale)
METRO_LOCK_FILE="$STALE_LOCK"
if ambient_start_expo_running; then
  info "start-expo.sh reale attivo in ambiente — salto l'asserzione gate=non-in-avvio"
else
  if cerbero_metro_starting; then
    nok "cerbero_metro_starting riporta 'in avvio' su lock stale senza owner"
  else
    ok "cerbero_metro_starting riporta 'NON in avvio' su lock stale (corretto)"
  fi
fi
# In ogni caso, il probe (sola sonda + flock -u) NON deve rimuovere il file stale.
if [ -f "$STALE_LOCK" ]; then
  ok "il probe non rimuove il lock stale (la rimozione spetta a restart_metro)"
else
  nok "il probe ha rimosso il lock stale (regressione: il gate non deve killare)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 4 — clean-metro-restart.sh end-to-end: SKIP con avvio in corso"
# ══════════════════════════════════════════════════════════════════════════════
# Owner del lock attivo + porta libera (metro_port_healthy=false) ⇒ il gate di
# clean-metro-restart DEVE skippare PRIMA di qualsiasi kill o exec start-expo.
HOLDER=$(spawn_lock_holder "$TEST_LOCK")
HOLDER_PIDS+=("$HOLDER")
CLEAN_OUT="$TMP/clean-metro.out"
set +e
METRO_LOCK_FILE="$TEST_LOCK" METRO_PORT="$FREE_PORT" \
  timeout 20 bash "$CLEAN_METRO" > "$CLEAN_OUT" 2>&1
CLEAN_EXIT=$?
set -e 2>/dev/null || true
set +e

if [ "$CLEAN_EXIT" -eq 0 ]; then
  ok "clean-metro-restart è uscito 0 (skip pulito al gate)"
else
  nok "clean-metro-restart è uscito $CLEAN_EXIT (atteso 0 — skip al gate)"
  echo "----- output clean-metro -----"; sed 's/^/    /' "$CLEAN_OUT"; echo "------------------------------"
fi
if grep -q "skip — avvio in corso" "$CLEAN_OUT"; then
  ok "log contiene il messaggio di skip 'avvio in corso'"
else
  nok "log NON contiene 'skip — avvio in corso'"
fi
# (b) NON deve aver tentato kill / restart / exec start-expo
if grep -qE "Terminazione Metro|Riavvio dev server" "$CLEAN_OUT"; then
  nok "clean-metro ha superato il gate (kill/restart) durante l'avvio (race!)"
else
  ok "clean-metro NON ha eseguito kill/restart durante l'avvio"
fi
# (c) MAI "METRO CRASH"
if grep -q "METRO CRASH" "$CLEAN_OUT"; then
  nok "compare 'METRO CRASH' durante l'avvio (regressione!)"
else
  ok "nessun 'METRO CRASH' durante l'avvio"
fi
# (a) il lock dell'owner è ancora detenuto e presente
if [ -f "$TEST_LOCK" ] && ( exec 202>"$TEST_LOCK"; ! flock -n 202 ); then
  ok "il lock dell'owner è ancora detenuto dopo clean-metro (mai rimosso)"
else
  nok "il lock dell'owner è stato rimosso/rilasciato da clean-metro (regressione!)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 5 — stress concorrente: N probe + clean-metro non rompono il lock"
# ══════════════════════════════════════════════════════════════════════════════
# L'owner del Test 4 è ancora vivo e detiene il lock. Bombardiamo con probe del
# gate e un clean-metro in parallelo: il lock deve sopravvivere a tutti.
SECOND_START=0
for i in $(seq 1 20); do
  METRO_LOCK_FILE="$TEST_LOCK" cerbero_metro_starting || SECOND_START=$((SECOND_START + 1)) &
done
wait 2>/dev/null || true
# Un secondo clean-metro concorrente
METRO_LOCK_FILE="$TEST_LOCK" METRO_PORT="$FREE_PORT" \
  timeout 20 bash "$CLEAN_METRO" > "$TMP/clean-metro2.out" 2>&1 || true

if [ -f "$TEST_LOCK" ] && ( exec 203>"$TEST_LOCK"; ! flock -n 203 ); then
  ok "dopo 20 probe + clean-metro concorrente, il lock è ancora detenuto"
else
  nok "il lock è stato perso sotto concorrenza (race!)"
fi
if grep -qE "Terminazione Metro|Riavvio dev server|METRO CRASH" "$TMP/clean-metro2.out"; then
  nok "il clean-metro concorrente ha killato/riavviato durante l'avvio (race!)"
else
  ok "nessun kill/restart/CRASH dal clean-metro concorrente"
fi
# Rilascia l'owner
kill "$HOLDER" 2>/dev/null || true
wait "$HOLDER" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════════════════
section "Test 6 — TOCTOW flock: held ⇒ bail, stale ⇒ rimovibile (primitiva OS)"
# ══════════════════════════════════════════════════════════════════════════════
# Riproduce la logica esatta di restart_metro (fd 200, flock -n): con lock
# detenuto l'acquisizione fallisce (restart_metro deve fare bail, NON rm); con
# lock stale l'acquisizione riesce (rimozione sicura consentita).
HELD="$TMP/held.lock"
HOLDER2=$(spawn_lock_holder "$HELD")
HOLDER_PIDS+=("$HOLDER2")
if ( exec 200>>"$HELD"; flock -n 200 ); then
  nok "flock -n riuscito su lock DETENUTO (restart_metro rimuoverebbe un lock attivo!)"
else
  ok "flock -n fallisce su lock detenuto ⇒ restart_metro fa bail (nessun rm)"
fi
kill "$HOLDER2" 2>/dev/null || true
wait "$HOLDER2" 2>/dev/null || true

STALE2="$TMP/stale2.lock"
: > "$STALE2"
if ( exec 200>>"$STALE2"; flock -n 200 ); then
  ok "flock -n riesce su lock stale ⇒ rimozione sicura consentita"
else
  nok "flock -n fallisce su lock stale (impossibile recuperare un lock orfano)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 7 — guardie strutturali anti-regressione (cerbero.sh / clean-metro)"
# ══════════════════════════════════════════════════════════════════════════════
# restart_metro deve invocare il gate PRIMA di qualunque kill della porta.
guard_line=$(grep -n 'if cerbero_metro_starting; then' "$CERBERO_SH" | head -1 | cut -d: -f1)
kill_line=$(grep -n 'kill_port_pid "\$METRO_PORT"' "$CERBERO_SH" | head -1 | cut -d: -f1)
if [ -n "$guard_line" ] && [ -n "$kill_line" ] && [ "$guard_line" -lt "$kill_line" ]; then
  ok "restart_metro chiama cerbero_metro_starting (riga $guard_line) prima del kill (riga $kill_line)"
else
  nok "restart_metro NON garantisce il gate prima del kill (guard=$guard_line kill=$kill_line)"
fi
# La rimozione del lock in restart_metro è protetta da flock -n 200.
if grep -Pzoq 'flock -n 200[\s\S]{0,80}rm -f "\$METRO_LOCK_FILE"' "$CERBERO_SH"; then
  ok "la rimozione del lock in restart_metro è protetta da flock -n (rimozione solo se stale)"
else
  nok "la rimozione del lock NON è protetta da flock -n in restart_metro"
fi
# Messaggi di skip attesi presenti nel codice.
for msg in "skip, nessun kill" "lock acquisito durante il restart"; do
  if grep -q "$msg" "$CERBERO_SH"; then
    ok "cerbero.sh logga lo skip: \"$msg\""
  else
    nok "cerbero.sh NON contiene il log di skip atteso: \"$msg\""
  fi
done
if grep -q "skip — avvio in corso" "$CLEAN_METRO"; then
  ok "clean-metro-restart.sh logga lo skip 'avvio in corso'"
else
  nok "clean-metro-restart.sh NON contiene il log di skip atteso"
fi
# Nessun kill cieco per nome in nessuno dei due file. Cerca SOLO invocazioni reali
# (pkill/killall con flag o nome processo), NON la parola "pkill" nei commenti/log.
BLIND_KILL_RE='(pkill|killall)[[:space:]]+(-[a-zA-Z]|"?(expo|node|metro))'
if grep -nE "$BLIND_KILL_RE" "$CERBERO_SH" "$CLEAN_METRO" >/dev/null 2>&1; then
  nok "rilevato kill cieco per nome (pkill/killall) — vietato: usare kill mirato per porta"
  grep -nE "$BLIND_KILL_RE" "$CERBERO_SH" "$CLEAN_METRO" | sed 's/^/    /'
else
  ok "nessun kill cieco per nome (pkill/killall) in cerbero.sh / clean-metro-restart.sh"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Test stress race avvio Metro FALLITO."
  exit 1
fi
echo "✅ Test stress race avvio Metro: tutte le asserzioni superate."
exit 0
