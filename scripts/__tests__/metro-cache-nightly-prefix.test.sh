#!/bin/bash
# metro-cache-nightly-prefix.test.sh — Test di integrazione per la pipeline
# [TESTA 2 NIGHTLY] di cerbero.sh.
#
# Verifica che, quando metro-cache-nightly.sh viene lanciato attraverso la
# pipeline di cerbero.sh (righe 95-101), ogni riga di output venga prefissata
# con "[YYYY-MM-DD HH:MM:SS] [TESTA 2 NIGHTLY]" e scritta in cerbero.log.
#
# Tecnica: si crea una copia patchata di metro-cache-nightly.sh che:
#   - override seconds_until_0100_utc() → echo 0 (trigger immediato, nessun sleep)
#   - esce dopo UN solo ciclo di purge (RUNNING=0 prima di ridormare)
# La pipeline di prefissazione è copiata lettera per lettera da cerbero.sh.
#
# Asserzioni:
#   (a) Il ciclo di purge produce almeno una riga [TESTA 2 NIGHTLY] in cerbero.log
#   (b) Tutte le righe [TESTA 2 NIGHTLY] rispettano il formato atteso
#   (c) La riga di avvio daemon è prefissata
#   (d) La riga di purge completata (OK o INFO) è prefissata
#   (e) Un errore di rimozione (chmod 000 .metro-cache/) produce una riga WARN prefissata
#   (f) La riga di arresto daemon è prefissata
#   (g) Nessuna riga [metro-cache-nightly] appare NON prefissata in cerbero.log
#
# Exit 0 = tutto verde, !=0 = regressione.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
NIGHTLY_SCRIPT="$PROJECT_ROOT/scripts/metro-cache-nightly.sh"
CERBERO_SH="$PROJECT_ROOT/scripts/cerbero.sh"

TMP="$(mktemp -d /tmp/nightly-prefix-test.XXXXXX)"

PASS=0
FAIL=0

cleanup() {
  chmod -R u+rwx "$TMP" 2>/dev/null || true
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

ok()      { echo "  [PASS] $1"; PASS=$((PASS + 1)); }
nok()     { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
info()    { echo "  [INFO] $1"; }
section() { echo ""; echo "── $1"; }

echo "════════════════════════════════════════════════════════════"
echo "  Test pipeline [TESTA 2 NIGHTLY] (metro-cache-nightly)"
echo "════════════════════════════════════════════════════════════"

# Pre-condizioni
[ -f "$NIGHTLY_SCRIPT" ] || { echo "ERRORE: $NIGHTLY_SCRIPT mancante"; exit 1; }
[ -x "$NIGHTLY_SCRIPT" ] || { echo "ERRORE: $NIGHTLY_SCRIPT mancante o non eseguibile"; exit 1; }
[ -f "$CERBERO_SH"     ] || { echo "ERRORE: $CERBERO_SH mancante"; exit 1; }

# Rileva i numeri di riga chiave nel sorgente originale.
# Questi vengono usati per patchare il file con sed (in ordine decrescente
# per evitare che le righe inserite spostino i riferimenti successivi).
FUNC_START=$(grep -n "^seconds_until_0100_utc() {" "$NIGHTLY_SCRIPT" | head -1 | cut -d: -f1)
FUNC_END=$(awk "NR>$FUNC_START && /^\}/ {print NR; exit}" "$NIGHTLY_SCRIPT")
CACHE_DIR_LINE=$(grep -n "^METRO_CACHE_DIR=" "$NIGHTLY_SCRIPT" | head -1 | cut -d: -f1)
FLAG_LOG_LINE=$(grep -n 'log "Flag scritto:' "$NIGHTLY_SCRIPT" | head -1 | cut -d: -f1)
WARN_LINE=$(grep -n 'log "WARN: errore durante la rimozione' "$NIGHTLY_SCRIPT" | head -1 | cut -d: -f1)

if [ -z "$FUNC_START" ] || [ -z "$FUNC_END" ] || [ -z "$CACHE_DIR_LINE" ]; then
  echo "ERRORE: struttura di metro-cache-nightly.sh cambiata — aggiorna il test"
  exit 1
fi

# ── Funzione helper: costruisce la copia patchata ────────────────────────────
# Applica le patch in ordine decrescente di numero di riga per preservare i
# riferimenti alle righe inferiori.
#
# Patch applicate:
#   P1 — Inserisce RUNNING=0 dopo "Flag scritto" (esci dopo purge OK, 1 ciclo)
#   P2 — Inserisce RUNNING=0 prima del ramo WARN+continue (esci dopo errore)
#   P3 — Sostituisce seconds_until_0100_utc() con mock che ritorna 0
#   P4 — Sovrascrive METRO_CACHE_DIR con la directory di test isolata
make_patched_nightly() {
  local root="$1"
  local out="$2"
  local mode="${3:-normal}"

  mkdir -p "$root/.metro-cache"
  if [ "$mode" = "error" ]; then
    # Rende la directory PARENT di .metro-cache non scrivibile: rm -rf non può
    # scollegare la sottodirectory dal parent → rm -rf ritorna 1 in modo affidabile
    # anche senza root (chmod 000 sul target funziona solo con root, che può ignorarlo).
    chmod a-w "$root"
  fi

  # Patching via Python (disponibile su NixOS/Replit) per piena affidabilità
  # con numero di riga e testo multi-riga.
  python3 - "$NIGHTLY_SCRIPT" "$out" "$root" "$FLAG_LOG_LINE" "$WARN_LINE" "$FUNC_START" "$FUNC_END" "$CACHE_DIR_LINE" <<'PYEOF'
import sys

src_path, dst_path, root, flag_log_line, warn_line, func_start, func_end, cache_dir_line = sys.argv[1:]
flag_log_line = int(flag_log_line)
warn_line     = int(warn_line)
func_start    = int(func_start)
func_end      = int(func_end)
cache_dir_line = int(cache_dir_line)

with open(src_path) as f:
    lines = f.readlines()  # 1-based: lines[i] = line i+1

out_lines = []
i = 0
while i < len(lines):
    lineno = i + 1  # 1-based

    # P4 — Override METRO_CACHE_DIR
    if lineno == cache_dir_line:
        out_lines.append(f'METRO_CACHE_DIR="{root}/.metro-cache"\n')
        i += 1
        continue

    # P3 — Replace seconds_until_0100_utc() body with mock
    if lineno == func_start:
        out_lines.append('seconds_until_0100_utc() {\n')
        out_lines.append('  echo 0\n')
        out_lines.append('  return\n')
        out_lines.append('}\n')
        # Skip lines func_start..func_end (inclusive)
        i = func_end  # after this loop body, i+1 = func_end+1
        continue

    # P2 — Insert RUNNING=0 before the WARN+continue block
    if lineno == warn_line:
        out_lines.append('  RUNNING=0\n')
        out_lines.append(lines[i])
        i += 1
        continue

    # P1 — Insert RUNNING=0 after "Flag scritto" (successful purge path)
    if lineno == flag_log_line:
        out_lines.append(lines[i])
        out_lines.append('  RUNNING=0\n')
        i += 1
        continue

    out_lines.append(lines[i])
    i += 1

with open(dst_path, 'w') as f:
    f.writelines(out_lines)
PYEOF

  chmod +x "$out"
}

# ── Funzione helper: esegue la pipeline cerbero.sh ───────────────────────────
# Replica esatta della pipeline in cerbero.sh righe 95-101:
#   { echo $BASHPID > pid_file; exec bash script } 2>&1 |
#   while IFS= read -r line; do printf '[TS] [TESTA 2 NIGHTLY] %s\n' "$line" >> log; done &
run_pipeline() {
  local patched_script="$1"
  local log_file="$2"
  local pid_file="$3"
  local timeout_secs="${4:-15}"

  {
    echo $BASHPID > "$pid_file"
    exec bash "$patched_script"
  } 2>&1 | \
    while IFS= read -r _cerbero_nightly_line; do
      printf '[%s] [TESTA 2 NIGHTLY] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$_cerbero_nightly_line" >> "$log_file"
    done &
  local pipeline_pid=$!

  local waited=0
  while kill -0 "$pipeline_pid" 2>/dev/null && [ "$waited" -lt "$timeout_secs" ]; do
    sleep 0.5
    waited=$(( waited + 1 ))
  done

  if kill -0 "$pipeline_pid" 2>/dev/null; then
    local _npid
    _npid=$(cat "$pid_file" 2>/dev/null || true)
    [ -n "$_npid" ] && kill -TERM "$_npid" 2>/dev/null || true
    kill -TERM "$pipeline_pid" 2>/dev/null || true
    wait "$pipeline_pid" 2>/dev/null || true
    return 1
  fi

  wait "$pipeline_pid" 2>/dev/null || true
  return 0
}

# ══════════════════════════════════════════════════════════════════════════════
section "Test 1 — ciclo purge normale: righe [TESTA 2 NIGHTLY] in cerbero.log"
# ══════════════════════════════════════════════════════════════════════════════
ROOT1="$TMP/root1"
mkdir -p "$ROOT1/logs"
SCRIPT1="$TMP/nightly-patch1.sh"
LOG1="$ROOT1/logs/cerbero.log"
PID1="$TMP/nightly-prod1.pid"

make_patched_nightly "$ROOT1" "$SCRIPT1" "normal"

# Verifica che la copia patchata sia sintatticamente valida prima di eseguirla
if bash -n "$SCRIPT1" 2>/dev/null; then
  info "copia patchata: sintassi bash OK"
else
  nok "copia patchata ha errori di sintassi bash — il test non può proseguire"
  bash -n "$SCRIPT1" 2>&1 | head -5 | sed 's/^/    /'
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  Risultato: $PASS PASS, $FAIL FAIL"
  echo "════════════════════════════════════════════════════════════"
  echo "❌ Test pipeline [TESTA 2 NIGHTLY] FALLITO."
  exit 1
fi

METRO_CACHE_PURGE_FLAG="$TMP/purge-flag-1" \
METRO_LOCK_FILE="$TMP/nonexistent-lock-1" \
CERBERO_LOG_FILE="$LOG1" \
  run_pipeline "$SCRIPT1" "$LOG1" "$PID1" 20
RUN_EXIT=$?

if [ "$RUN_EXIT" -eq 0 ]; then
  ok "pipeline completata entro il timeout (purge one-shot)"
else
  nok "pipeline NON completata entro il timeout (script bloccato?)"
fi

# (a) Almeno una riga [TESTA 2 NIGHTLY] nel log
if [ -f "$LOG1" ] && grep -q '\[TESTA 2 NIGHTLY\]' "$LOG1"; then
  COUNT=$(grep -c '\[TESTA 2 NIGHTLY\]' "$LOG1")
  ok "cerbero.log contiene $COUNT righe con [TESTA 2 NIGHTLY]"
else
  nok "cerbero.log NON contiene righe [TESTA 2 NIGHTLY]"
  info "Contenuto log: $(cat "$LOG1" 2>/dev/null || echo '(vuoto)')"
fi

# (b) Tutte le righe [TESTA 2 NIGHTLY] rispettano il formato:
#     [YYYY-MM-DD HH:MM:SS] [TESTA 2 NIGHTLY] [metro-cache-nightly] testo
FORMAT_ERR=0
if [ -f "$LOG1" ]; then
  while IFS= read -r raw_line; do
    if ! echo "$raw_line" | grep -qE '^\[20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\] \[TESTA 2 NIGHTLY\] \[metro-cache-nightly\]'; then
      FORMAT_ERR=$((FORMAT_ERR + 1))
      info "riga fuori-formato: $raw_line"
    fi
  done < <(grep '\[TESTA 2 NIGHTLY\]' "$LOG1")
fi
if [ "$FORMAT_ERR" -eq 0 ] && [ -f "$LOG1" ] && grep -q '\[TESTA 2 NIGHTLY\]' "$LOG1"; then
  ok "tutte le righe [TESTA 2 NIGHTLY] rispettano il formato [TIMESTAMP] [TESTA 2 NIGHTLY] [metro-cache-nightly]"
elif [ "$FORMAT_ERR" -gt 0 ]; then
  nok "$FORMAT_ERR righe [TESTA 2 NIGHTLY] NON rispettano il formato atteso"
fi

# (c) La riga di avvio daemon è prefissata
if [ -f "$LOG1" ] && grep -q '\[TESTA 2 NIGHTLY\].*\[metro-cache-nightly\].*Avviato' "$LOG1"; then
  ok "riga di avvio daemon prefissata con [TESTA 2 NIGHTLY]"
else
  nok "riga di avvio daemon NON trovata come prefissata in cerbero.log"
  info "Contenuto log:"
  cat "$LOG1" 2>/dev/null | sed 's/^/    /' || true
fi

# (d) La riga di purge completata (OK o INFO) è prefissata
if [ -f "$LOG1" ] && grep -qE '\[TESTA 2 NIGHTLY\].*\[metro-cache-nightly\].*(OK: .metro-cache|INFO: .metro-cache)' "$LOG1"; then
  ok "riga di esito purge (OK/INFO) prefissata con [TESTA 2 NIGHTLY]"
else
  nok "riga di esito purge NON trovata come prefissata in cerbero.log"
fi

# (f) La riga di arresto daemon è prefissata
if [ -f "$LOG1" ] && grep -q '\[TESTA 2 NIGHTLY\].*\[metro-cache-nightly\].*Arresto completato' "$LOG1"; then
  ok "riga di arresto daemon prefissata con [TESTA 2 NIGHTLY]"
else
  nok "riga di arresto daemon NON trovata come prefissata in cerbero.log"
fi

# (g) Nessuna riga [metro-cache-nightly] NON prefissata
if [ -f "$LOG1" ]; then
  RAW_LINES=$(grep '\[metro-cache-nightly\]' "$LOG1" | grep -v '\[TESTA 2 NIGHTLY\]' || true)
  if [ -z "$RAW_LINES" ]; then
    ok "nessuna riga [metro-cache-nightly] appare NON prefissata in cerbero.log"
  else
    nok "alcune righe [metro-cache-nightly] NON prefissate trovate:"
    echo "$RAW_LINES" | head -5 | sed 's/^/    /'
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 2 — errore rimozione (.metro-cache/ chmod 000): riga WARN prefissata"
# ══════════════════════════════════════════════════════════════════════════════
ROOT2="$TMP/root2"
mkdir -p "$ROOT2/logs"
SCRIPT2="$TMP/nightly-patch2.sh"
LOG2="$ROOT2/logs/cerbero.log"
PID2="$TMP/nightly-prod2.pid"

make_patched_nightly "$ROOT2" "$SCRIPT2" "error"

if bash -n "$SCRIPT2" 2>/dev/null; then
  info "copia patchata (error): sintassi bash OK"
else
  nok "copia patchata (error) ha errori di sintassi bash"
fi

METRO_CACHE_PURGE_FLAG="$TMP/purge-flag-2" \
METRO_LOCK_FILE="$TMP/nonexistent-lock-2" \
CERBERO_LOG_FILE="$LOG2" \
  run_pipeline "$SCRIPT2" "$LOG2" "$PID2" 20
RUN2_EXIT=$?

if [ "$RUN2_EXIT" -eq 0 ]; then
  ok "pipeline (error) completata entro il timeout"
else
  nok "pipeline (error) NON completata entro il timeout"
fi

# (e) La riga WARN di errore rimozione è prefissata
if [ -f "$LOG2" ] && grep -q '\[TESTA 2 NIGHTLY\].*\[metro-cache-nightly\].*WARN.*errore' "$LOG2"; then
  ok "riga WARN di errore rimozione prefissata con [TESTA 2 NIGHTLY]"
else
  nok "riga WARN di errore rimozione NON trovata come prefissata in cerbero.log"
  info "Log errore:"
  cat "$LOG2" 2>/dev/null | sed 's/^/    /' || true
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 3 — verifica strutturale: cerbero.sh usa la pipeline attesa"
# ══════════════════════════════════════════════════════════════════════════════
if grep -q '\[TESTA 2 NIGHTLY\]' "$CERBERO_SH"; then
  ok "cerbero.sh contiene il tag [TESTA 2 NIGHTLY] nel sorgente"
else
  nok "cerbero.sh NON contiene il tag [TESTA 2 NIGHTLY] (pipeline mancante)"
fi

if grep -A2 'TESTA 2 NIGHTLY' "$CERBERO_SH" | grep -q "printf"; then
  ok "cerbero.sh usa printf per costruire le righe [TESTA 2 NIGHTLY]"
else
  nok "cerbero.sh NON usa printf per [TESTA 2 NIGHTLY] (formato potrebbe divergere)"
fi

if grep -A2 'TESTA 2 NIGHTLY' "$CERBERO_SH" | grep -q "date '+%Y-%m-%d %H:%M:%S'"; then
  ok "cerbero.sh usa date '+%Y-%m-%d %H:%M:%S' per il timestamp in [TESTA 2 NIGHTLY]"
else
  nok "cerbero.sh NON usa il formato data atteso per [TESTA 2 NIGHTLY]"
fi

if grep -B5 'TESTA 2 NIGHTLY' "$CERBERO_SH" | grep -q 'metro-cache-nightly.sh'; then
  ok "cerbero.sh aggancia la pipeline [TESTA 2 NIGHTLY] all'output di metro-cache-nightly.sh"
else
  nok "cerbero.sh NON aggancia [TESTA 2 NIGHTLY] a metro-cache-nightly.sh (wiring rotto)"
fi

# metro-cache-nightly.sh NON deve scrivere direttamente su cerbero.log
# (log() scrive SOLO su stdout; il chiamante cerbero.sh prefissa e redirige)
if grep -v '^\s*#' "$NIGHTLY_SCRIPT" | grep -q '>>\s*"\?.*cerbero\.log'; then
  nok "metro-cache-nightly.sh scrive direttamente su cerbero.log (doppia-scrittura!)"
else
  ok "metro-cache-nightly.sh NON scrive direttamente su cerbero.log (solo stdout — corretto)"
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Test 4 — purge flag scritto correttamente durante il ciclo"
# ══════════════════════════════════════════════════════════════════════════════
PURGE_FLAG1="$TMP/purge-flag-1"
if [ -f "$PURGE_FLAG1" ]; then
  ok "il flag di purge ($PURGE_FLAG1) è stato scritto durante il ciclo normale"
else
  # Verifica tramite log: il flag potrebbe essere in un percorso diverso
  if [ -f "$LOG1" ] && grep -q '\[TESTA 2 NIGHTLY\].*Flag scritto' "$LOG1"; then
    ok "la riga 'Flag scritto' è presente nel log (purge completata con successo)"
  else
    nok "il flag di purge non scritto e non compare nel log (purge non eseguita?)"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Risultato: $PASS PASS, $FAIL FAIL"
echo "════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  echo "❌ Test pipeline [TESTA 2 NIGHTLY] FALLITO."
  exit 1
fi
echo "✅ Test pipeline [TESTA 2 NIGHTLY]: tutte le asserzioni superate."
exit 0
