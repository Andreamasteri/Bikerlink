#!/usr/bin/env bash
# =============================================================================
# BikerLink — monitor-build-graphs.sh
# Monitor di avanzamento per build-graphs-sequential.sh.
# Legge il file di stato scritto dall'orchestratore e mostra a colpo d'occhio:
#   - Area corrente e fase in corso
#   - Tempo trascorso dall'avvio
#   - Stato ✓/✗/🔄/⏳ per ogni area
#   - Dimensione grafo prodotto (dove disponibile)
#   - Utilizzo RAM e swap in tempo reale
#
# Uso (in un secondo terminale mentre build-graphs-sequential.sh gira):
#   ./monitor-build-graphs.sh
#   STATE_FILE=/tmp/altro-path.txt ./monitor-build-graphs.sh
#   REFRESH=10 ./monitor-build-graphs.sh   # aggiorna ogni 10s (default: 5s)
#
# Il monitor esce automaticamente quando lo script orchestratore ha finito.
# Per uscire prima: Ctrl+C.
# =============================================================================

STATE_FILE="${STATE_FILE:-/tmp/bk-build-graphs-state.txt}"
LOG_FILE="${LOG_FILE:-/tmp/bk-build-graphs.log}"
REFRESH="${REFRESH:-5}"

# Colori
RESET="\033[0m"
BOLD="\033[1m"
GREEN="\033[32m"
RED="\033[31m"
YELLOW="\033[33m"
CYAN="\033[36m"
BLUE="\033[34m"
MAGENTA="\033[35m"
DIM="\033[2m"

clear_screen() { printf "\033[2J\033[H"; }

format_seconds() {
  local secs="$1"
  local h=$(( secs / 3600 ))
  local m=$(( (secs % 3600) / 60 ))
  local s=$(( secs % 60 ))
  if (( h > 0 )); then
    printf "%dh %02dm %02ds" "$h" "$m" "$s"
  elif (( m > 0 )); then
    printf "%dm %02ds" "$m" "$s"
  else
    printf "%ds" "$s"
  fi
}

# Lettura RAM e swap da /proc/meminfo
read_mem() {
  awk '
    /MemTotal/    { total=$2 }
    /MemAvailable/{ avail=$2 }
    /SwapTotal/   { stot=$2  }
    /SwapFree/    { sfree=$2 }
    END {
      used   = total - avail
      sused  = stot - sfree
      printf "RAM: %.1f/%.1f GB usati (%.0f%% libera)\n",
             used/1048576, total/1048576, avail*100/total
      if (stot > 0)
        printf "Swap: %.1f/%.1f GB usati\n", sused/1048576, stot/1048576
      else
        printf "Swap: non attiva\n"
    }
  ' /proc/meminfo 2>/dev/null || echo "RAM: n/d"
}

# Carica il file di stato in variabili
load_state() {
  STATE_STATUS=""
  STATE_STARTED=""
  STATE_CURRENT_AREA=""
  STATE_CURRENT_PHASE=""
  STATE_TOTAL=""
  STATE_DONE=""
  declare -gA STATE_AREAS=()

  [[ -f "$STATE_FILE" ]] || return 1

  while IFS='=' read -r key val; do
    case "$key" in
      STATUS)        STATE_STATUS="$val"       ;;
      STARTED)       STATE_STARTED="$val"      ;;
      CURRENT_AREA)  STATE_CURRENT_AREA="$val" ;;
      CURRENT_PHASE) STATE_CURRENT_PHASE="$val";;
      TOTAL_AREAS)   STATE_TOTAL="$val"        ;;
      DONE_COUNT)    STATE_DONE="$val"         ;;
      AREA_*)
        local area_key="${key#AREA_}"
        # Converti underscore in trattino per i nomi composti (arco_alpino → arco-alpino)
        area_key="${area_key//_/-}"
        STATE_AREAS["$area_key"]="$val"
        ;;
    esac
  done < "$STATE_FILE"
  return 0
}

# Icona di stato per un'area
area_icon() {
  local status="$1"
  case "${status%%|*}" in
    ok)      echo -e "${GREEN}✓${RESET}" ;;
    fail)    echo -e "${RED}✗${RESET}"   ;;
    running) echo -e "${CYAN}🔄${RESET}" ;;
    pending) echo -e "${DIM}⏳${RESET}"  ;;
    *)       echo -e "${DIM}?${RESET}"   ;;
  esac
}

# Testo dello stato per un'area
area_label() {
  local status="$1"
  local base="${status%%|*}"
  local detail="${status#*|}"
  [[ "$detail" == "$base" ]] && detail=""

  case "$base" in
    ok)      echo -e "${GREEN}completato${RESET}${detail:+  ${DIM}(${detail})${RESET}}" ;;
    fail)    echo -e "${RED}FALLITO${RESET}${detail:+  ${DIM}(${detail})${RESET}}"     ;;
    running) echo -e "${CYAN}in corso...${RESET}"                                        ;;
    pending) echo -e "${DIM}in attesa${RESET}"                                           ;;
    *)       echo -e "${DIM}${status}${RESET}"                                           ;;
  esac
}

# Traduzione della fase corrente
phase_label() {
  case "$1" in
    "stop-all")          echo "Arresto tutte le istanze GH" ;;
    "cleanup")           echo "Pulizia graph-cache precedente" ;;
    "check-risorse")     echo "Controllo RAM/disco" ;;
    "swap")              echo "Attivazione swap NVMe" ;;
    "import")            echo "⚙  --import in corso (può durare ore)" ;;
    "verifica")          echo "Verifica artefatti grafo" ;;
    "avvio-container")   echo "Avvio container + attesa /health" ;;
    "test-funzionale")   echo "Test /route profile=motorcycle" ;;
    "stop-container")    echo "Arresto container" ;;
    "completato")        echo "✓ Area completata" ;;
    "")                  echo "" ;;
    *)                   echo "$1" ;;
  esac
}

# Ultime N righe del log (filtra ANSI e verboso)
tail_log() {
  local n="${1:-8}"
  if [[ -f "$LOG_FILE" ]]; then
    tail -n "$n" "$LOG_FILE" | sed 's/\x1b\[[0-9;]*m//g'
  fi
}

# Loop principale
FIRST_SEEN_DONE=0
while true; do
  clear_screen

  local_now=$(date '+%s')

  # Header
  echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${BLUE}║  BikerLink — Build Grafi GraphHopper — Monitor${RESET}               ${BOLD}${BLUE}║${RESET}"
  echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""

  if ! load_state; then
    echo -e "${YELLOW}Attesa file di stato: ${STATE_FILE}${RESET}"
    echo -e "${DIM}Lancia build-graphs-sequential.sh per iniziare.${RESET}"
    sleep "$REFRESH"
    continue
  fi

  # Tempo trascorso
  local_elapsed=$(( local_now - ${STATE_STARTED:-$local_now} ))
  local_elapsed_fmt=$(format_seconds "$local_elapsed")

  # Stato globale
  case "$STATE_STATUS" in
    running)
      echo -e "  Stato:     ${CYAN}${BOLD}IN CORSO${RESET}"
      ;;
    done)
      echo -e "  Stato:     ${GREEN}${BOLD}COMPLETATO ✅${RESET}"
      ;;
    error)
      echo -e "  Stato:     ${RED}${BOLD}ERRORE ⚠${RESET}"
      ;;
    *)
      echo -e "  Stato:     ${DIM}${STATE_STATUS}${RESET}"
      ;;
  esac

  echo -e "  Avanzamento: ${BOLD}${STATE_DONE:-0}/${STATE_TOTAL:-?}${RESET} aree completate"
  echo -e "  Trascorso:   ${BOLD}${local_elapsed_fmt}${RESET}"
  echo ""

  # Area corrente
  if [[ -n "$STATE_CURRENT_AREA" && "$STATE_STATUS" == "running" ]]; then
    local_phase_label=$(phase_label "$STATE_CURRENT_PHASE")
    echo -e "  ${BOLD}Area corrente:${RESET} ${MAGENTA}${STATE_CURRENT_AREA}${RESET}"
    [[ -n "$local_phase_label" ]] && \
      echo -e "  ${BOLD}Fase:${RESET}          ${local_phase_label}"
    echo ""
  fi

  # ── Tabella aree ────────────────────────────────────────────────────────────
  echo -e "  ${BOLD}Area                 Stato                  Grafo${RESET}"
  echo -e "  ──────────────────────────────────────────────────────────"

  local_order="ecuador grecia balcani est iberia arco-alpino germania-centro francia-benelux"
  for area in $local_order; do
    local_ast="${STATE_AREAS[$area]:-}"
    [[ -z "$local_ast" ]] && continue

    local_icon=$(area_icon "$local_ast")
    local_lbl=$(area_label "$local_ast")

    # Dimensione grafo (parte dopo il | se status=ok)
    local_size=""
    if [[ "${local_ast%%|*}" == "ok" ]]; then
      local_size="${local_ast#*|}"
      [[ "$local_size" == "${local_ast}" ]] && local_size=""
    fi

    printf "  %-21s " "$area"
    echo -e "${local_icon} ${local_lbl}"
  done

  echo ""

  # ── Utilizzo memoria ─────────────────────────────────────────────────────────
  echo -e "  ${BOLD}Sistema:${RESET}"
  read_mem | while IFS= read -r line; do echo "    $line"; done
  echo ""

  # ── Ultime righe del log ─────────────────────────────────────────────────────
  if [[ -f "$LOG_FILE" ]]; then
    echo -e "  ${BOLD}Log recente (${LOG_FILE}):${RESET}"
    echo -e "  ──────────────────────────────────────────────────────────"
    tail_log 8 | while IFS= read -r line; do
      echo "  $line"
    done
    echo ""
  fi

  # Footer
  echo -e "  ${DIM}Aggiornamento ogni ${REFRESH}s — Ctrl+C per uscire${RESET}"

  # Esce automaticamente quando il build è terminato (dopo un ultimo aggiornamento)
  if [[ "$STATE_STATUS" == "done" || "$STATE_STATUS" == "error" ]]; then
    if (( FIRST_SEEN_DONE == 0 )); then
      FIRST_SEEN_DONE=1
    else
      echo ""
      if [[ "$STATE_STATUS" == "done" ]]; then
        echo -e "  ${GREEN}${BOLD}BUILD COMPLETATO CON SUCCESSO ✅${RESET}"
      else
        echo -e "  ${RED}${BOLD}BUILD TERMINATO CON ERRORI ⚠ — controlla: ${LOG_FILE}${RESET}"
      fi
      echo ""
      break
    fi
  fi

  sleep "$REFRESH"
done
