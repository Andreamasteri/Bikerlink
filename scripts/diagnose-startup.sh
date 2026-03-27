#!/bin/bash
# diagnose-startup.sh — Diagnosi rapida degli script di avvio e dello stato del server.
# Mostra: diff degli script di avvio, stato delle porte 5000 e 8081, ultimi log.
#
# Uso:
#   bash scripts/diagnose-startup.sh          # diff troncato a 80 righe
#   bash scripts/diagnose-startup.sh --full   # diff completo senza troncamento

FULL_DIFF=0
if [ "${1:-}" = "--full" ]; then
  FULL_DIFF=1
fi

# ── Colori ANSI ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

section() {
  echo ""
  echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${RESET}"
  echo -e "${CYAN}${BOLD}  $1${RESET}"
  echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${RESET}"
}

ok()   { echo -e "  ${GREEN}✔  $1${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠  $1${RESET}"; }
err()  { echo -e "  ${RED}✖  $1${RESET}"; }
info() { echo -e "  ${BOLD}$1${RESET}"; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        DIAGNOSI AVVIO — $(date '+%Y-%m-%d %H:%M:%S')          ║${RESET}"
if [ $FULL_DIFF -eq 1 ]; then
echo -e "${BOLD}║        Modalità: FULL (diff senza troncamento)               ║${RESET}"
fi
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"

# ── 1. File cambiati nell'ultima sessione (git diff --stat HEAD~1 HEAD) ────────
section "1. FILE CAMBIATI NELL'ULTIMA SESSIONE (git diff --stat)"

KEY_FILES=(
  "scripts/start-backend.sh"
  "scripts/start-expo.sh"
  "scripts/watchdog.sh"
  "scripts/diagnose-startup.sh"
  "server/index.ts"
  "metro.config.js"
  "package.json"
)

HAS_GIT=0
HAS_PREV=0

if git rev-parse --git-dir >/dev/null 2>&1; then
  HAS_GIT=1
  PREV_COMMIT=$(git rev-parse HEAD~1 2>/dev/null)
  if [ -n "$PREV_COMMIT" ]; then
    HAS_PREV=1
  fi
fi

if [ $HAS_GIT -eq 0 ]; then
  warn "Directory corrente non è un repository git."
elif [ $HAS_PREV -eq 0 ]; then
  warn "Nessun commit precedente trovato (repository con un solo commit)."
else
  CHANGED=$(git diff --stat HEAD~1 HEAD 2>/dev/null)
  if [ -z "$CHANGED" ]; then
    ok "Nessun file cambiato tra HEAD~1 e HEAD."
  else
    echo ""
    git diff --stat HEAD~1 HEAD 2>/dev/null | sed 's/^/    /'
  fi

  echo ""
  info "Verifica file chiave:"
  for f in "${KEY_FILES[@]}"; do
    if git diff --quiet HEAD~1 HEAD -- "$f" 2>/dev/null; then
      ok "$f — invariato"
    else
      FILE_STAT=$(git diff --stat HEAD~1 HEAD -- "$f" 2>/dev/null | grep "|" | sed 's/^[[:space:]]*//')
      if [ -n "$FILE_STAT" ]; then
        warn "$f — MODIFICATO  ($FILE_STAT)"
      else
        warn "$f — MODIFICATO"
      fi
    fi
  done
fi

# ── 2. Diff esteso degli script di avvio (HEAD~1 → HEAD) ─────────────────────
section "2. DIFF ESTESO SCRIPT DI AVVIO (HEAD~1 → HEAD)"

STARTUP_SCRIPTS=(
  "scripts/start-backend.sh"
  "scripts/start-expo.sh"
  "scripts/watchdog.sh"
)

if [ $HAS_GIT -eq 1 ] && [ $HAS_PREV -eq 1 ]; then
  for script in "${STARTUP_SCRIPTS[@]}"; do
    DIFF_OUT=$(git diff HEAD~1 HEAD -- "$script" 2>/dev/null)
    if [ -n "$DIFF_OUT" ]; then
      echo ""
      echo -e "  ${YELLOW}${BOLD}── $script ──${RESET}"
      TOTAL_LINES=$(echo "$DIFF_OUT" | wc -l)
      if [ $FULL_DIFF -eq 1 ] || [ "$TOTAL_LINES" -le 80 ]; then
        echo "$DIFF_OUT" | sed 's/^+/    +/; s/^-/    -/; s/^@/    @/'
      else
        echo "$DIFF_OUT" | sed 's/^+/    +/; s/^-/    -/; s/^@/    @/' | head -80
        warn "(diff troncato a 80 righe; totale: $TOTAL_LINES — usa --full per vedere tutto)"
      fi
    else
      ok "$script — nessuna modifica"
    fi
  done
else
  warn "Impossibile eseguire diff (nessun commit precedente o repository non git)."
fi

# ── 3. Stato delle porte ──────────────────────────────────────────────────────
section "3. STATO DELLE PORTE"

check_port() {
  local port=$1
  local label=$2

  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null)

  if [ -n "$pids" ]; then
    local procs
    procs=$(echo "$pids" | while read pid; do
      cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "?")
      echo "PID $pid ($cmd)"
    done | tr '\n' ', ' | sed 's/, $//')
    ok "Porta $port ($label): OCCUPATA — $procs"

    local http_ok=0
    if curl -s --max-time 2 -o /dev/null "http://localhost:$port/" 2>/dev/null; then
      http_ok=1
    fi
    if [ $http_ok -eq 1 ]; then
      ok "  HTTP su :$port — risponde"
    else
      warn "  HTTP su :$port — nessuna risposta HTTP (processo attivo ma non pronto?)"
    fi
  else
    err "Porta $port ($label): LIBERA (nessun processo in ascolto)"
  fi
}

check_port 5000 "Backend Express"
check_port 8081 "Frontend Metro/Expo"

# ── 4. Ultimi log backend ─────────────────────────────────────────────────────
section "4. ULTIMI 20 LOG BACKEND (/tmp/logs/)"

BACKEND_LOG=$(ls -t /tmp/logs/*backend* /tmp/logs/*Backend* 2>/dev/null | head -1)
if [ -n "$BACKEND_LOG" ]; then
  info "File: $BACKEND_LOG"
  echo ""
  tail -20 "$BACKEND_LOG" 2>/dev/null | sed 's/^/    /' || warn "Impossibile leggere $BACKEND_LOG"
else
  warn "Nessun log backend trovato in /tmp/logs/ (pattern: *backend* / *Backend*)"
  info "File disponibili in /tmp/logs/:"
  ls /tmp/logs/ 2>/dev/null | sed 's/^/    /' || echo "    (directory vuota o inesistente)"
fi

# ── 5. Ultimi log frontend ────────────────────────────────────────────────────
section "5. ULTIMI 20 LOG FRONTEND (/tmp/logs/ e /tmp/metro-opt-cycle*.log)"

FRONTEND_LOG=$(ls -t /tmp/logs/*frontend* /tmp/logs/*Frontend* /tmp/metro-opt-cycle*.log 2>/dev/null | head -1)
if [ -n "$FRONTEND_LOG" ]; then
  info "File: $FRONTEND_LOG"
  echo ""
  tail -20 "$FRONTEND_LOG" 2>/dev/null | sed 's/^/    /' || warn "Impossibile leggere $FRONTEND_LOG"
else
  warn "Nessun log frontend trovato in /tmp/logs/ o /tmp/metro-opt-cycle*.log"
  info "File disponibili in /tmp/logs/:"
  ls /tmp/logs/ 2>/dev/null | sed 's/^/    /' || echo "    (directory vuota o inesistente)"
fi

# ── 6. Uptime reset log ───────────────────────────────────────────────────────
section "6. UPTIME RESET LOG — ultimi 30 eventi (logs/uptime-resets.log)"

UPTIME_LOG="$(pwd)/logs/uptime-resets.log"
if [ -f "$UPTIME_LOG" ]; then
  LINE_COUNT=$(wc -l < "$UPTIME_LOG" 2>/dev/null || echo 0)
  info "File: $UPTIME_LOG ($LINE_COUNT righe totali)"
  echo ""
  tail -30 "$UPTIME_LOG" 2>/dev/null | sed 's/^/    /' || warn "Impossibile leggere $UPTIME_LOG"
else
  warn "Nessun evento registrato — il file non esiste ancora."
  info "Il file verrà creato al prossimo avvio del backend."
fi

# ── Fine ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║              DIAGNOSI COMPLETATA                             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
