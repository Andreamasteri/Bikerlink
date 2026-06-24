#!/bin/bash
# metro-crash-summary.sh — Riepilogo e verdetto dei crash Metro registrati.
#
# Legge /tmp/metro-crash-diag.jsonl e classifica la causa dominante dei crash:
#   platform_recycle  — SIGTERM esterno (riciclo Replit, il più atteso)
#   sigkill_oom       — SIGKILL o evidenza OOM del kernel
#   internal_crash    — crash interno JS Metro (exit code senza segnale)
#
# Uso:
#   bash scripts/metro-crash-summary.sh          # tutte le voci
#   bash scripts/metro-crash-summary.sh --last N # ultimi N eventi
#
# Opzionale: --raw stampa il JSONL grezzo.

set -uo pipefail

METRO_DIAG_LOG="${METRO_DIAG_LOG:-/tmp/metro-crash-diag.jsonl}"

usage() {
  echo "Uso: $0 [--last N] [--raw]"
  echo "  --last N   mostra solo gli ultimi N eventi (default: tutti)"
  echo "  --raw      stampa il JSONL grezzo invece del riepilogo"
  exit 0
}

LAST_N=0
RAW=0
while [ $# -gt 0 ]; do
  case "$1" in
    --last)   LAST_N="${2:-10}"; shift 2 ;;
    --raw)    RAW=1; shift ;;
    --help|-h) usage ;;
    *)        shift ;;
  esac
done

if [ ! -f "$METRO_DIAG_LOG" ]; then
  echo "Nessun file di diagnosi trovato: $METRO_DIAG_LOG"
  echo "(Nessun crash Metro registrato ancora, oppure cerbero/start-expo non ancora avviati con la nuova versione.)"
  exit 0
fi

if [ "$RAW" -eq 1 ]; then
  if [ "$LAST_N" -gt 0 ]; then
    tail -n "$LAST_N" "$METRO_DIAG_LOG"
  else
    cat "$METRO_DIAG_LOG"
  fi
  exit 0
fi

# ── Leggi il JSONL ────────────────────────────────────────────────────────────
if [ "$LAST_N" -gt 0 ]; then
  DATA=$(tail -n "$LAST_N" "$METRO_DIAG_LOG" 2>/dev/null || true)
else
  DATA=$(cat "$METRO_DIAG_LOG" 2>/dev/null || true)
fi

if [ -z "$DATA" ]; then
  echo "File di diagnosi vuoto."
  exit 0
fi

# ── Conta eventi per tipo ─────────────────────────────────────────────────────
total_records=$(echo "$DATA" | wc -l)
crash_records=$(echo "$DATA" | grep '"type":"crash"' | wc -l)
snapshot_records=$(echo "$DATA" | grep '"type":"snapshot"' | wc -l)

# Verdetti crash (base dal tipo di segnale)
platform_recycle=$(echo "$DATA" | grep '"type":"crash"' | grep '"verdict":"platform_recycle"' | wc -l)
sigkill_oom=$(echo "$DATA"      | grep '"type":"crash"' | grep '"verdict":"sigkill_oom"' | wc -l)
internal_crash=$(echo "$DATA"   | grep '"type":"crash"' | grep '"verdict":"internal_crash"' | wc -l)
clean_exit=$(echo "$DATA"       | grep '"type":"crash"' | grep '"verdict":"clean_exit"' | wc -l)

# Snapshot con OOM: costruisci insieme di session_id con oom_found=1
oom_snapshots=$(echo "$DATA" | grep '"type":"snapshot"' | grep '"oom_found":1' | wc -l)
oom_session_ids=$(echo "$DATA" | grep '"type":"snapshot"' | grep '"oom_found":1' \
  | sed 's/.*"session_id":"\([^"]*\)".*/\1/' | sort -u | tr '\n' ' ')

# Ricalcola sigkill_oom integrando evidenza OOM dagli snapshot:
# Per ogni session_id con oom_found=1, conta SEPARATAMENTE quante crash
# appartengono al bucket platform_recycle e quante a internal_crash, e sottrai
# solo dai bucket corretti. Evita la sottrazione globale che accorcia entrambi.
if [ -n "$oom_session_ids" ] && [ "$crash_records" -gt 0 ]; then
  for sid in $oom_session_ids; do
    [ -z "$sid" ] && continue
    # Crash di tipo platform_recycle per questa sessione OOM
    oom_pr=$(echo "$DATA" | grep '"type":"crash"' \
      | grep "\"session_id\":\"${sid}\"" \
      | grep '"verdict":"platform_recycle"' | wc -l)
    # Crash di tipo internal_crash per questa sessione OOM
    oom_ic=$(echo "$DATA" | grep '"type":"crash"' \
      | grep "\"session_id\":\"${sid}\"" \
      | grep '"verdict":"internal_crash"' | wc -l)
    upgraded=$(( oom_pr + oom_ic ))
    if [ "$upgraded" -gt 0 ]; then
      sigkill_oom=$(( sigkill_oom + upgraded ))
      platform_recycle=$(( platform_recycle > oom_pr ? platform_recycle - oom_pr : 0 ))
      internal_crash=$(( internal_crash > oom_ic ? internal_crash - oom_ic : 0 ))
    fi
  done
fi

# Timestamp primo e ultimo evento
first_ts=$(echo "$DATA" | grep '"ts"' | head -1 | sed 's/.*"ts":"\([^"]*\)".*/\1/' || true)
last_ts=$(echo "$DATA"  | grep '"ts"' | tail -1 | sed 's/.*"ts":"\([^"]*\)".*/\1/' || true)

# ── Calcola verdetto dominante ────────────────────────────────────────────────
# Incorpora l'evidenza OOM degli snapshot nel conteggio sigkill_oom (già fatto
# sopra nella riclassificazione). Il verdetto riflette quindi entrambi i segnali.
dominant="N/D"
dominant_pct=0
if [ "$crash_records" -gt 0 ]; then
  max_count=0
  if [ "$platform_recycle" -gt "$max_count" ]; then
    max_count=$platform_recycle; dominant="PLATFORM_RECYCLE (SIGTERM esterno)"
  fi
  if [ "$sigkill_oom" -gt "$max_count" ]; then
    max_count=$sigkill_oom; dominant="SIGKILL/OOM (confermato da snapshot)"
  fi
  if [ "$internal_crash" -gt "$max_count" ]; then
    max_count=$internal_crash; dominant="INTERNAL_CRASH (exit senza segnale)"
  fi
  if [ "$max_count" -gt 0 ]; then
    dominant_pct=$(( max_count * 100 / crash_records ))
  fi
fi

# ── Stampa riepilogo ──────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  RIEPILOGO CRASH METRO — $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════════"
echo ""
echo "  File:          $METRO_DIAG_LOG"
echo "  Primo evento:  ${first_ts:-—}"
echo "  Ultimo evento: ${last_ts:-—}"
echo "  Record totali: $total_records  (crash: $crash_records | snapshot: $snapshot_records)"
echo ""
echo "  ── Classificazione crash ──────────────────────────"
echo "  platform_recycle (SIGTERM): $platform_recycle"
echo "  sigkill_oom (SIGKILL/OOM):  $sigkill_oom"
echo "  internal_crash (JS/altro):  $internal_crash"
echo "  clean_exit (exit 0):        $clean_exit"
echo ""
echo "  ── Snapshot OOM kernel ────────────────────────────"
if [ "$oom_snapshots" -gt 0 ]; then
  echo "  ⚠️  OOM rilevato in $oom_snapshots snapshot su $snapshot_records"
else
  echo "  Nessuna evidenza OOM nei ${snapshot_records} snapshot"
fi
echo ""
echo "  ── Verdetto dominante ─────────────────────────────"
if [ "$crash_records" -eq 0 ]; then
  echo "  Nessun crash registrato ancora."
elif [ "$dominant_pct" -ge 70 ]; then
  echo "  ✅ CAUSA PROBABILE: $dominant"
  echo "     (${dominant_pct}% dei crash, $crash_records eventi totali)"
elif [ "$dominant_pct" -ge 40 ]; then
  echo "  ⚠️  CAUSA PREVALENTE ma non esclusiva: $dominant"
  echo "     (${dominant_pct}% dei crash, $crash_records eventi totali)"
  echo "     → Raccogliere altri cicli per conferma."
else
  echo "  ❓ CAUSA INCERTA — distribuzione frammentata tra i tipi."
  echo "     → Raccogliere altri cicli prima di un verdetto definitivo."
fi
echo ""
echo "══════════════════════════════════════════════════════"
echo ""

# ── Ultimi 5 crash con dettaglio ─────────────────────────────────────────────
echo "  Ultimi crash (max 5):"
echo "  ──────────────────────────────────────────────────"
echo "$DATA" | grep '"type":"crash"' | tail -5 | while IFS= read -r line; do
  ts=$(echo "$line"      | sed 's/.*"ts":"\([^"]*\)".*/\1/')
  exit_c=$(echo "$line"  | sed 's/.*"exit_code":\([0-9]*\).*/\1/')
  sig=$(echo "$line"     | sed 's/.*"signal_name":"\([^"]*\)".*/\1/')
  verdict=$(echo "$line" | sed 's/.*"verdict":"\([^"]*\)".*/\1/')
  uptime=$(echo "$line"  | sed 's/.*"uptime_secs":\([0-9]*\).*/\1/')
  eid=$(echo "$line"     | sed 's/.*"session_id":"\([^"]*\)".*/\1/')
  eid_short=$(printf '%.8s' "$eid")
  [ -n "$eid_short" ] && corr=" [evt:${eid_short}]" || corr=" [no-snapshot]"
  echo "    $ts | exit=$exit_c sig=$sig uptime=${uptime}s → $verdict${corr}"
done

# ── Ultimi 5 snapshot con dettaglio ──────────────────────────────────────────
echo ""
echo "  Ultimi snapshot (max 5) — session_id correla crash e snapshot dello stesso evento:"
echo "  ──────────────────────────────────────────────────"
echo "$DATA" | grep '"type":"snapshot"' | tail -5 | while IFS= read -r line; do
  ts=$(echo "$line"       | sed 's/.*"ts":"\([^"]*\)".*/\1/')
  pid=$(echo "$line"      | sed 's/.*"metro_pid":"\([^"]*\)".*/\1/')
  state=$(echo "$line"    | sed 's/.*"pid_state":"\([^"]*\)".*/\1/')
  mem_f=$(echo "$line"    | sed 's/.*"mem_free_mb":\([0-9]*\).*/\1/')
  mem_t=$(echo "$line"    | sed 's/.*"mem_total_mb":\([0-9]*\).*/\1/')
  load=$(echo "$line"     | sed 's/.*"load_1min":"\([^"]*\)".*/\1/')
  oom=$(echo "$line"      | sed 's/.*"oom_found":\([0-9]*\).*/\1/')
  eid=$(echo "$line"      | sed 's/.*"session_id":"\([^"]*\)".*/\1/')
  eid_short=$(printf '%.8s' "$eid")
  oom_flag=""
  [ "$oom" = "1" ] && oom_flag=" ⚠️OOM"
  echo "    $ts | pid=${pid:-—} state=$state mem_free=${mem_f}/${mem_t}MB load=$load${oom_flag} [evt:${eid_short}]"
done

echo ""
