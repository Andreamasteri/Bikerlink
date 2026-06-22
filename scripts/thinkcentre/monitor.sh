#!/usr/bin/env bash
# BikerLink ThinkCentre — Live Monitor
#
# Leggerissimo: docker events (idle ≈ 0 CPU), status ogni 5 min, rotation 50 MB.
# Avvio automatico: @reboot in crontab (install: bash scripts/thinkcentre/monitor-install.sh)
#
# Lettura live:  tail -f ~/bikerlink-monitor/live.log
# Stato:         screen -ls | grep tc-monitor
# Stop manuale:  kill $(cat ~/bikerlink-monitor/monitor.lock)

LOG_DIR="$HOME/bikerlink-monitor"
LOG_FILE="$LOG_DIR/live.log"
LOCK="$LOG_DIR/monitor.lock"
MAX_BYTES=52428800   # 50 MB → ruota
KEEP_ARCHIVES=5      # quante versioni storiche tenere

mkdir -p "$LOG_DIR"

# ── Istanza unica ──────────────────────────────────────────────────────────────
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "Monitor già attivo (PID $(cat "$LOCK" 2>/dev/null)). Uscita." >&2
  exit 1
fi
echo $$ > "$LOCK"

# ── Helpers ───────────────────────────────────────────────────────────────────
ts()  { date '+%Y-%m-%d %H:%M:%S'; }

wr() {
  # ruota se > MAX_BYTES
  local sz; sz=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$sz" -gt "$MAX_BYTES" ]; then
    mv "$LOG_FILE" "$LOG_DIR/live-$(date '+%Y%m%d-%H%M%S').log"
    # rimuovi archivi eccedenti
    ls -t "$LOG_DIR"/live-*.log 2>/dev/null | tail -n +"$((KEEP_ARCHIVES + 1))" | xargs rm -f 2>/dev/null || true
    echo "[$(ts)] [MONITOR] Log ruotato." >> "$LOG_FILE"
  fi
  echo "[$(ts)] $*" >> "$LOG_FILE"
}

containers_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | sort | tr '\n' ',' | sed 's/,$//'
}

# ── Cleanup su segnale ────────────────────────────────────────────────────────
cleanup() {
  wr "[MONITOR] STOP (segnale ricevuto — PID $$)"
  kill "$STATUS_PID" 2>/dev/null
  flock -u 9
  rm -f "$LOCK"
  exit 0
}
trap cleanup TERM INT HUP

# ── Avvio ─────────────────────────────────────────────────────────────────────
wr "[MONITOR] === START (PID $$) ==="
wr "[MONITOR] Containers attivi: $(containers_running)"

# ── Status periodico (ogni 5 min) ─────────────────────────────────────────────
(
  while true; do
    sleep 300
    RUNNING=$(docker ps --format '{{.Names}}' 2>/dev/null | wc -l)
    wr "[STATUS] ${RUNNING} container up: $(containers_running)"
  done
) &
STATUS_PID=$!

# ── Stream docker events ──────────────────────────────────────────────────────
# Formato: [DOCKER] container_name → action (type) exitCode=N
docker events \
  --format '{{.Actor.Attributes.name}} → {{.Action}} ({{.Type}}){{if .Actor.Attributes.exitCode}} exit={{.Actor.Attributes.exitCode}}{{end}}' \
  2>/dev/null | while IFS= read -r line; do
  wr "[DOCKER] $line"
done

wr "[MONITOR] docker events stream terminato. STOP."
kill "$STATUS_PID" 2>/dev/null
flock -u 9
rm -f "$LOCK"
