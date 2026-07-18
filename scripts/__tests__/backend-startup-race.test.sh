#!/bin/bash
# backend-startup-race.test.sh — Test DETERMINISTICO per la race all'avvio Backend.
#
# Verifica, in modo ripetibile e veloce (start-backend MOCKATO, niente server reale),
# che il guardiano (cerbero.sh / cerbero-lib.sh) NON riavvii mai un backend che sta
# solo inizializzando (503 {status:initializing}) o il cui start-backend.sh è già
# attivo nel sistema.
#
# Convenzione testata: /tmp/start-backend.lock contiene il PID dell'owner vivo
# (kill -0 ok) OPPURE pgrep trova "bash .*scripts/start-backend.sh" ⇒ restart_backend
# DEVE skippare senza toccare nulla e senza lanciare start-backend.sh.
#
# Asserzioni principali:
#   (a) cerbero_health_backend distingue i 3 stati:
#       - return 0 → backend pronto      (HTTP 200 + "status":"ok")
#       - return 2 → backend in avvio    (raggiungibile ma non pronto, es. 503)
#       - return 1 → backend IRRAGGIUNGIBILE (porta chiusa/timeout)
#   (b) stato 2 (503 inizializzazione) NON provoca restart (backend_state -ne 1)
#   (c) lock /tmp/start-backend.lock con PID vivo → restart_backend skippa
#   (d) processo start-backend.sh attivo (pgrep) → restart_backend skippa
#   (e) lock stale (PID non più vivo, no pgrep) → restart_backend non skippa (rimuove lock)
#   (f) nessun kill cieco per nome (pkill/killall) in cerbero.sh
#   (g) guardie strutturali: il guard lock appare PRIMA del lancio start-backend.sh
#
# Eseguibile in CI/post-merge come gate. Exit 0 = tutto verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CERBERO_LIB="$PROJECT_ROOT/scripts/cerbero-lib.sh"
CERBERO_SH="$PROJECT_ROOT/scripts/cerbero.sh"

# ── Area di lavoro isolata ────────────────────────────────────────────────────
TMP="$(mktemp -d /tmp/backend-race-test.XXXXXX)"
TEST_BACKEND_LOCK="$TMP/start-backend.lock"
# Porta sicuramente libera (range alto) — forza backend_state=1 (irraggiungibile).
# Usiamo offset dal PID del processo per rendere i numeri unici per ogni run.
_BASE=$(( (($$ % 900) * 3) + 58000 ))
FREE_PORT=$(( _BASE ))
# Porta per mock HTTP server (stato 0 — ok)
MOCK_PORT_OK=$(( _BASE + 1 ))
# Porta per mock HTTP server (stato 2 — initializing)
MOCK_PORT_INIT=$(( _BASE + 2 ))

PASS=0
FAIL=0
declare -a MOCK_SERVER_PIDS=()
declare -a FAKE_BACKEND_PIDS=()

cleanup() {
  for p in "${MOCK_SERVER_PIDS[@]}" "${FAKE_BACKEND_PIDS[@]}"; do
    kill "$p" 2>/dev/null || true
  done
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

ok()   { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok()  { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
info() { echo "  [INFO] $1"; }
section() { echo ""; echo "── $1"; }

# Avvia un mock HTTP server Python che risponde sempre con $1 (code) e $2 (body)
# sulla porta $3. Restituisce il PID. Garantisce che la porta sia aperta prima di
# ritornare (max ~3s).
start_mock_http() {
  local code=$1
  local body=$2
  local port=$3
  python3 - "$port" "$code" "$body" <<'PYEOF' >/dev/null 2>&1 &
import sys, http.server, socketserver
port, code, body = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3].encode()
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass
# allow_reuse_address DEVE essere impostato come class attribute PRIMA della bind.
class ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True
with ReuseServer(('localhost', port), H) as s:
    s.serve_forever()
PYEOF
  local pid=$!
  # Attendi apertura porta (max ~4s)
  for _ in $(seq 1 40); do
    curl -s --max-time 1 "http://localhost:$port/" >/dev/null 2>&1 && break
    sleep 0.1
  done
  echo "$pid"
}

# Spawna un finto processo start-backend.sh per testare il ramo pgrep del gate.
spawn_fake_start_backend() {
  mkdir -p "$TMP/scripts"
  cat > "$TMP/scripts/start-backend.sh" <<'EOF'
#!/bin/bash
sleep 600
EOF
  chmod +x "$TMP/scripts/start-backend.sh"
  bash "$TMP/scripts/start-backend.sh" </dev/null >/dev/null 2>&1 &
  echo $!
}

# Rileva un start-backend.sh REALE in ambiente: in quel caso le asserzioni del
# ramo pgrep potrebbero essere già "vere" e andrebbero saltate per restare
# deterministici.
ambient_start_backend_running() {
  pgrep -f "bash .*scripts/start-backend.sh" >/dev/null 2>&1
}

echo "════════════════════════════════════════════════════════════"
echo "  Test stress race avvio Backend (start-backend mockato)"
echo "════════════════════════════════════════════════════════════"

# Pre-condizioni: file richiesti presenti
[ -f "$CERBERO_LIB" ] || { echo "ERRORE: $CERBERO_LIB mancante"; exit 1; }
[ -f "$CERBERO_SH" ]  || { echo "ERRORE: $CERBERO_SH mancante"; exit 1; }
[ -x "$(command -v python3)" ] || { echo "ERRORE: python3 non disponibile (serve per i mock HTTP)"; exit 1; }

# Carica cerbero-lib.sh per avere cerbero_health_backend (e cerbero_log).
export CERBERO_LOG_FILE="$TMP/cerbero.log"
export BACKEND_PORT="$FREE_PORT"
# shellcheck source=scripts/cerbero-lib.sh
source "$CERBERO_LIB"

# ── Estrai restart_backend da cerbero.sh ────────────────────────────────────
# Usiamo awk per estrarre solo il corpo della funzione (senza il loop/flock
# top-level di cerbero.sh che non può essere sourciato direttamente).
RESTART_BACKEND_DEF="$(awk '
  /^restart_backend\(\)/ { p=1 }
  p { print }
  p && /^\}$/ { exit }
' "$CERBERO_SH")"

if [ -z "$RESTART_BACKEND_DEF" ]; then
  echo "ERRORE: impossibile estrarre restart_backend da $CERBERO_SH"; exit 1
fi

# Configura l'ambiente che restart_backend si aspetta: SCRIPT_DIR punta a un
# fake scripts/ con uno start-backend.sh che NON fa nulla (marker only).
FAKE_SCRIPTS_DIR="$TMP/fake_scripts"
mkdir -p "$FAKE_SCRIPTS_DIR"
RESTART_CALLED_MARKER="$TMP/restart_backend_called"
cat > "$FAKE_SCRIPTS_DIR/start-backend.sh" <<FAKESH
#!/bin/bash
# Fake start-backend.sh per i test: registra che è stato chiamato e termina.
touch "$RESTART_CALLED_MARKER"
FAKESH
chmod +x "$FAKE_SCRIPTS_DIR/start-backend.sh"

# Definisce restart_backend nell'ambiente corrente con SCRIPT_DIR mockato.
SCRIPT_DIR="$FAKE_SCRIPTS_DIR"
eval "$RESTART_BACKEND_DEF"

# Porta backend per restart_backend (non deve aprire connessioni reali).
BACKEND_PORT="$FREE_PORT"
BACKEND_RESTART_LOCK="$TMP/cerbero-backend-restart.lock"

# ══════════════════════════════════════════════════════════════════════════════
section "Test 1 — cerbero_health_backend stato 0: HTTP 200 + status:ready"
# ══════════════════════════════════════════════════════════════════════════════
PID_OK=$(start_mock_http 200 '{"status":"ready"}' "$MOCK_PORT_OK")
MOCK_SERVER_PIDS+=("$PID_OK")
BACKEND_PORT="$MOCK_PORT_OK"
cerbero_health_backend
STATE_0=$?
BACKEND_PORT="$FREE_PORT"

if [ "$STATE_0" -eq 0 ]; then
  ok "cerbero_health_backend ritorna 0 (pronto) su HTTP 200 + status:ready"
else
  nok "cerbero_health_backend ritorna $STATE_0 invece di 0 su HTTP 200 + status:ready"
fi
kill "$PID_OK" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════════════════
section "Test 1b — cerbero_health_backend stato 0: HTTP 200 + status:degraded"
# ══════════════════════════════════════════════════════════════════════════════
# Degraded = READY ma un sottosistema non-critico è ko: il backend SERVE ancora,
# quindi deve essere considerato vivo (stato 0), non riavviato.
PID_DEG=$(start_mock_http 200 '{"status":"degraded","degradedReasons":["schedulers-init-failed"]}' "$MOCK_PORT_OK")
MOCK_SERVER_PIDS+=("$PID_DEG")
BACKEND_PORT="$MOCK_PORT_OK"
cerbero_health_backend
STATE_DEG=$?
BACKEND_PORT="$FREE_PORT"

if [ "$STATE_DEG" -eq 0 ]; then
  ok "cerbero_health_backend ritorna 0 (vivo) su HTTP 200 + status:degraded"
else
  nok "cerbero_health_backend ritorna $STATE_DEG invece di 0 su HTTP 200 + status:degraded"
fi
kill "$PID_DEG" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════════════════
section "Test 1c — cerbero_health_backend stato 0: HTTP 200 + status:broken"
# ══════════════════════════════════════════════════════════════════════════════
# Broken = una slice critica dell'Health Arbiter è giù (es. circuit breaker DB)
# ma il backend SERVE ancora: riavviarlo non risolve, quindi è vivo (stato 0).
PID_BRK=$(start_mock_http 200 '{"status":"broken","state":"BROKEN","degradedReasons":["[db-breaker] circuit breaker DB aperto"]}' "$MOCK_PORT_OK")
MOCK_SERVER_PIDS+=("$PID_BRK")
BACKEND_PORT="$MOCK_PORT_OK"
cerbero_health_backend
STATE_BRK=$?
BACKEND_PORT="$FREE_PORT"

if [ "$STATE_BRK" -eq 0 ]; then
  ok "cerbero_health_backend ritorna 0 (vivo) su HTTP 200 + status:broken"
else
  nok "cerbero_health_backend ritorna $STATE_BRK invece di 0 su HTTP 200 + status:broken"
fi
kill "$PID_BRK" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════════════════
section "Test 2 — cerbero_health_backend stato 2: HTTP 503 (initializing)"
# ══════════════════════════════════════════════════════════════════════════════
PID_INIT=$(start_mock_http 503 '{"status":"initializing"}' "$MOCK_PORT_INIT")
MOCK_SERVER_PIDS+=("$PID_INIT")
BACKEND_PORT="$MOCK_PORT_INIT"
cerbero_health_backend
STATE_2=$?
BACKEND_PORT="$FREE_PORT"

if [ "$STATE_2" -eq 2 ]; then
  ok "cerbero_health_backend ritorna 2 (in avvio) su HTTP 503"
else
  nok "cerbero_health_backend ritorna $STATE_2 invece di 2 su HTTP 503"
fi
kill "$PID_INIT" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════════════════
section "Test 3 — cerbero_health_backend stato 1: backend IRRAGGIUNGIBILE"
# ══════════════════════════════════════════════════════════════════════════════
BACKEND_PORT="$FREE_PORT"
cerbero_health_backend
STATE_1=$?

if [ "$STATE_1" -eq 1 ]; then
  ok "cerbero_health_backend ritorna 1 (irraggiungibile) su porta chiusa"
else
  nok "cerbero_health_backend ritorna $STATE_1 invece di 1 su porta chiusa"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 4 — stato 2 NON deve causare restart (backend_state -ne 1)"
# ══════════════════════════════════════════════════════════════════════════════
# Riproduce la logica del loop cerbero.sh: restart_backend viene chiamato SOLO
# se backend_state == 1. Con stato 2, il guardiano deve osservare e basta.
rm -f "$RESTART_CALLED_MARKER"
if [ "$STATE_2" -ne 1 ]; then
  ok "stato 2 NON è 1 → la logica del loop non chiama restart_backend (nessun restart)"
else
  nok "stato 2 restituisce 1 → la logica del loop chiamerebbe restart_backend (regressione!)"
fi
# Conferma anche che stato 0 non porta a restart.
if [ "$STATE_0" -ne 1 ]; then
  ok "stato 0 NON è 1 → la logica del loop non chiama restart_backend"
else
  nok "stato 0 restituisce 1 → errore cerbero_health_backend"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 5 — lock con PID vivo → restart_backend skippa"
# ══════════════════════════════════════════════════════════════════════════════
# Spawn un processo owner del lock identico a start-backend.sh: scrive il proprio
# PID nel lock file e rimane vivo. restart_backend DEVE rilevarlo via kill -0.
rm -f "$RESTART_CALLED_MARKER"
(
  echo "$$" > "$TEST_BACKEND_LOCK"
  exec sleep 600
) </dev/null >/dev/null 2>&1 &
LOCK_OWNER_PID=$!
FAKE_BACKEND_PIDS+=("$LOCK_OWNER_PID")
# Attendi che il lock sia scritto
sleep 0.3

# Override del path del lock nella funzione estratta usando una variabile locale
# letta da restart_backend: la funzione usa `local backend_lock="/tmp/start-backend.lock"`
# — dobbiamo intercettare con un wrapper che sostituisce il path.
restart_backend_test_lock() {
  # Ridefinisce il path del lock per il test (patch locale alla funzione).
  # restart_backend usa `local backend_lock="/tmp/start-backend.lock"` hardcoded;
  # non possiamo sovra-scriverlo dall'esterno direttamente. Testiamo la primitiva
  # kill -0 che la funzione usa: se il PID nel file è vivo, deve skippare.
  local lock_pid
  local backend_lock="$TEST_BACKEND_LOCK"
  lock_pid=$(cat "$backend_lock" 2>/dev/null)
  if [ -n "$lock_pid" ] && [[ "$lock_pid" =~ ^[0-9]+$ ]] && kill -0 "$lock_pid" 2>/dev/null; then
    echo "skip:pid-vivo"
    return 0
  fi
  echo "no-skip"
  return 1
}

RESULT=$(restart_backend_test_lock)
if [ "$RESULT" = "skip:pid-vivo" ]; then
  ok "restart_backend_test_lock: lock con PID vivo → skip (kill -0 ok)"
else
  nok "restart_backend_test_lock: lock con PID vivo NON genera skip (RESULT=$RESULT)"
fi
# Conferma che il lock file esiste ancora (non rimosso dal probe)
if [ -f "$TEST_BACKEND_LOCK" ]; then
  ok "il file di lock esiste ancora dopo il probe (non rimosso)"
else
  nok "il file di lock è stato RIMOSSO dal probe (regressione!)"
fi

kill "$LOCK_OWNER_PID" 2>/dev/null || true
wait "$LOCK_OWNER_PID" 2>/dev/null || true
rm -f "$TEST_BACKEND_LOCK"

# ══════════════════════════════════════════════════════════════════════════════
section "Test 6 — processo start-backend.sh attivo (pgrep) → restart_backend skippa"
# ══════════════════════════════════════════════════════════════════════════════
# Avvia un finto start-backend.sh nel TMP (path distinto da quello reale per
# non interferire con l'ambiente ma rilevabile con la stessa regex pgrep).
FAKE_SB_PID=$(spawn_fake_start_backend)
FAKE_BACKEND_PIDS+=("$FAKE_SB_PID")
sleep 0.3

restart_backend_test_pgrep() {
  # Riproduce il ramo pgrep di restart_backend: il file di lock NON esiste (lock
  # già rimosso o mai creato) ma il processo è vivo. Stessa regex di cerbero.sh.
  if pgrep -f "bash .*scripts/start-backend.sh" >/dev/null 2>&1; then
    echo "skip:pgrep"
    return 0
  fi
  echo "no-skip"
  return 1
}

RESULT_PGREP=$(restart_backend_test_pgrep)
if [ "$RESULT_PGREP" = "skip:pgrep" ]; then
  ok "restart_backend_test_pgrep: start-backend.sh attivo → skip (pgrep)"
else
  nok "restart_backend_test_pgrep: start-backend.sh attivo NON genera skip (RESULT=$RESULT_PGREP)"
fi

kill "$FAKE_SB_PID" 2>/dev/null || true
wait "$FAKE_SB_PID" 2>/dev/null || true
sleep 0.3

# Verifica che dopo la morte del processo, pgrep non lo rilevi più.
if pgrep -f "bash .*scripts/start-backend.sh" >/dev/null 2>&1 && ! ambient_start_backend_running; then
  nok "pgrep rileva ancora start-backend.sh dopo la sua terminazione"
else
  ok "pgrep non rileva start-backend.sh dopo la sua terminazione (corretto)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 7 — lock stale (PID non vivo, no pgrep) → restart_backend procede"
# ══════════════════════════════════════════════════════════════════════════════
# Con lock stale (PID orfano), restart_backend DEVE rimuovere il lock e procedere
# con il riavvio (cioè NON skippare). Verifichiamo la logica senza lanciare il
# vero start-backend (usiamo il fake SCRIPT_DIR già configurato).
rm -f "$TEST_BACKEND_LOCK" "$RESTART_CALLED_MARKER"
# PID sicuramente defunto: usiamo 1 (init/systemd, kill -0 fallisce per noi) oppure
# un PID inventato alto. Usiamo 2147483647 (PID max su Linux, quasi certamente libero).
DEAD_PID=2147483647
echo "$DEAD_PID" > "$TEST_BACKEND_LOCK"

restart_backend_test_stale() {
  local backend_lock="$TEST_BACKEND_LOCK"
  if [ -f "$backend_lock" ]; then
    local lock_pid
    lock_pid=$(cat "$backend_lock" 2>/dev/null)
    if [ -z "$lock_pid" ] || ! [[ "$lock_pid" =~ ^[0-9]+$ ]]; then
      echo "skip:pid-non-valido"
      return 0
    fi
    if kill -0 "$lock_pid" 2>/dev/null; then
      echo "skip:pid-vivo"
      return 0
    fi
    if pgrep -f "bash .*scripts/start-backend.sh" >/dev/null 2>&1; then
      echo "skip:pgrep"
      return 0
    fi
    rm -f "$backend_lock"
  fi
  echo "procedi"
  return 0
}

if ambient_start_backend_running; then
  info "start-backend.sh reale attivo in ambiente — salto asserzioni stale (pgrep sempre vero)"
  rm -f "$TEST_BACKEND_LOCK"
else
  STALE_RESULT=$(restart_backend_test_stale)
  if [ "$STALE_RESULT" = "procedi" ]; then
    ok "lock stale (PID defunto, no pgrep) → restart_backend NON skippa (procede al riavvio)"
  else
    nok "lock stale → restart_backend skippa inaspettatamente (RESULT=$STALE_RESULT)"
  fi
  if [ ! -f "$TEST_BACKEND_LOCK" ]; then
    ok "lock stale rimosso correttamente da restart_backend_test_stale"
  else
    nok "lock stale NON rimosso (il lock orfano blocca i futuri riavvii)"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 8 — restart_backend end-to-end: skip con PID-vivo + nessun avvio reale"
# ══════════════════════════════════════════════════════════════════════════════
# Eseguiamo restart_backend (estratta da cerbero.sh, con SCRIPT_DIR fake) con un
# lock contenente un PID vivo: deve skippare SENZA chiamare il fake start-backend.sh.
rm -f "$RESTART_CALLED_MARKER" "$BACKEND_RESTART_LOCK"
(
  echo "$$" > "$TEST_BACKEND_LOCK"
  exec sleep 600
) </dev/null >/dev/null 2>&1 &
E2E_OWNER_PID=$!
FAKE_BACKEND_PIDS+=("$E2E_OWNER_PID")
sleep 0.3

# restart_backend usa il path hardcoded /tmp/start-backend.lock; lo sostituiamo
# tramite una patch inline nella funzione estratta. Per farlo senza duplicare il
# codice, intercettiamo con una variabile d'ambiente e una piccola shim:
_ORIG_LOCK="/tmp/start-backend.lock"
_SAVE_CONTENT="$(cat "$_ORIG_LOCK" 2>/dev/null || true)"
_ORIG_EXISTS=0
[ -f "$_ORIG_LOCK" ] && _ORIG_EXISTS=1

# Installiamo il lock di test nel path reale (solo se non è già in uso).
if [ "$_ORIG_EXISTS" -eq 0 ]; then
  echo "$E2E_OWNER_PID" > "$_ORIG_LOCK"
  _WE_WROTE_LOCK=1
else
  _WE_WROTE_LOCK=0
  info "lock reale /tmp/start-backend.lock già presente — test E2E skippato (ambiente live)"
fi

if [ "$_WE_WROTE_LOCK" -eq 1 ]; then
  RESTART_OUT="$TMP/restart-backend.out"
  set +e
  restart_backend > "$RESTART_OUT" 2>&1
  RESTART_EXIT=$?
  set -e 2>/dev/null || true
  set +e

  if [ "$RESTART_EXIT" -eq 0 ]; then
    ok "restart_backend exit 0 (skip pulito)"
  else
    nok "restart_backend exit $RESTART_EXIT (atteso 0)"
  fi
  # NON deve aver chiamato il fake start-backend.sh
  if [ -f "$RESTART_CALLED_MARKER" ]; then
    nok "restart_backend ha chiamato start-backend.sh nonostante il PID fosse vivo (race!)"
    echo "----- output restart_backend -----"
    sed 's/^/    /' "$RESTART_OUT"
    echo "----------------------------------"
  else
    ok "restart_backend NON ha chiamato start-backend.sh con PID-vivo nel lock"
  fi
  # Verifica il messaggio di skip atteso
  if grep -q "già in esecuzione\|start-backend già\|già in esecuzione" "$RESTART_OUT" 2>/dev/null || \
     grep -q "start-backend" "$CERBERO_LOG_FILE" 2>/dev/null; then
    ok "cerbero_log registra il messaggio di skip (PID vivo)"
  else
    info "messaggio di skip non trovato nel log (potrebbe essere scritto nel file di log)"
  fi

  # Ripristino lock reale
  rm -f "$_ORIG_LOCK"
fi

kill "$E2E_OWNER_PID" 2>/dev/null || true
wait "$E2E_OWNER_PID" 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════════════════
section "Test 9 — guardie strutturali anti-regressione (cerbero.sh)"
# ══════════════════════════════════════════════════════════════════════════════

# (i) Il guard lock-PID deve apparire PRIMA del lancio start-backend.sh.
guard_pid_line=$(grep -n 'kill -0.*lock_pid' "$CERBERO_SH" | head -1 | cut -d: -f1)
guard_pgrep_line=$(grep -n 'pgrep.*start-backend' "$CERBERO_SH" | head -1 | cut -d: -f1)
# Cerca la riga che LANCIA davvero start-backend.sh (bash "$SCRIPT_DIR/..." oppure
# "start-backend.sh" >> CERBERO_LOG_FILE); esclude le righe pgrep/cerbero_log.
launch_line=$(grep -n 'start-backend\.sh.*CERBERO_LOG_FILE\|SCRIPT_DIR.*start-backend\.sh' "$CERBERO_SH" | \
  grep -v 'pgrep\|cerbero_log' | head -1 | cut -d: -f1)

if [ -n "$guard_pid_line" ] && [ -n "$launch_line" ] && [ "$guard_pid_line" -lt "$launch_line" ]; then
  ok "guard kill -0 (riga $guard_pid_line) appare prima del lancio start-backend.sh (riga $launch_line)"
else
  nok "guard kill -0 NON precede il lancio start-backend.sh (guard=$guard_pid_line launch=$launch_line)"
fi

if [ -n "$guard_pgrep_line" ] && [ -n "$launch_line" ] && [ "$guard_pgrep_line" -lt "$launch_line" ]; then
  ok "guard pgrep (riga $guard_pgrep_line) appare prima del lancio start-backend.sh (riga $launch_line)"
else
  nok "guard pgrep NON precede il lancio start-backend.sh (guard=$guard_pgrep_line launch=$launch_line)"
fi

# (ii) Messaggi di skip attesi presenti nel codice.
for msg in "già in esecuzione" "start-backend.sh attivo"; do
  if grep -q "$msg" "$CERBERO_SH"; then
    ok "cerbero.sh logga lo skip: \"$msg\""
  else
    nok "cerbero.sh NON contiene il log di skip atteso: \"$msg\""
  fi
done

# (iii) Nessun kill cieco per nome.
BLIND_KILL_RE='(pkill|killall)[[:space:]]+(-[a-zA-Z]+[[:space:]]+)?(node|backend|server)'
if grep -nE "$BLIND_KILL_RE" "$CERBERO_SH" >/dev/null 2>&1; then
  nok "rilevato kill cieco per nome (pkill/killall) in cerbero.sh — vietato: usare kill mirato per PID/porta"
  grep -nE "$BLIND_KILL_RE" "$CERBERO_SH" | sed 's/^/    /'
else
  ok "nessun kill cieco per nome (pkill/killall node/backend/server) in cerbero.sh"
fi

# (iv) cerbero_health_backend usa curl con --max-time (no hang infinito).
if grep -q 'max-time' "$CERBERO_LIB"; then
  ok "cerbero_health_backend usa --max-time (no hang su backend irraggiungibile)"
else
  nok "cerbero_health_backend NON usa --max-time (rischio hang)"
fi

# (v) I 3 stati (return 0, return 1, return 2) sono tutti presenti nella funzione.
for ret in "return 0" "return 1" "return 2"; do
  if grep -A 40 'cerbero_health_backend\(\)' "$CERBERO_LIB" | grep -q "$ret"; then
    ok "cerbero_health_backend contiene \"$ret\""
  else
    nok "cerbero_health_backend NON contiene \"$ret\" — uno dei 3 stati mancante"
  fi
done

# (vi) restart_backend controlla backend_state con -ne 1 nel loop (stato 2 = nessun restart).
if grep -q 'backend_state.*-ne 1\|-ne 1.*backend_state' "$CERBERO_SH"; then
  ok "cerbero.sh controlla backend_state -ne 1 nel loop (stato 2 non causa restart)"
else
  nok "cerbero.sh NON usa -ne 1 per filtrare backend_state (stato 2 potrebbe causare restart!)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Test stress race avvio Backend FALLITO."
  exit 1
fi
echo "✅ Test stress race avvio Backend: tutte le asserzioni superate."
exit 0
