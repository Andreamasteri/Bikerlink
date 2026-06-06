#!/usr/bin/env bash
# bikerlink-update.sh — git pull automatico ogni 5 minuti
# Logga esito + timestamp in ~/bikerlink-update.log (max 500 righe)

set -euo pipefail

REPO_DIR="$HOME/bikerlink"
LOG_FILE="$HOME/bikerlink-update.log"
MAX_LINES=500
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() {
    echo "[$TIMESTAMP] $*" >> "$LOG_FILE"
}

rotate_log() {
    if [ -f "$LOG_FILE" ]; then
        local lines
        lines=$(wc -l < "$LOG_FILE")
        if [ "$lines" -gt "$MAX_LINES" ]; then
            tail -n "$MAX_LINES" "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
        fi
    fi
}

if [ ! -d "$REPO_DIR/.git" ]; then
    log "ERRORE: $REPO_DIR non è un repository git."
    exit 1
fi

cd "$REPO_DIR"

OUTPUT=$(git pull --ff-only 2>&1) && RC=0 || RC=$?

if [ $RC -eq 0 ]; then
    log "OK: $OUTPUT"
else
    log "ERRORE (rc=$RC): $OUTPUT"
fi

rotate_log

exit 0
