#!/bin/bash
# restart-backend.sh — Forza il riavvio del backend Express in isolamento.

# ── LOCK PORTE .replit (merge=ours driver) ───────────────────
git config --global merge.ours.driver true 2>/dev/null || true
# ─────────────────────────────────────────────────────────────
# Usare il workflow "Start Backend" nel pannello Replit per eseguirlo.
# Non tocca Metro/Expo frontend.

LOCK_FILE="/tmp/start-backend.lock"

echo "[restart-backend] Avvio riavvio forzato backend..."

if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && [[ "$LOCK_PID" =~ ^[0-9]+$ ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[restart-backend] Processo backend trovato (PID: $LOCK_PID) — invio SIGTERM..."
    kill -TERM "$LOCK_PID" 2>/dev/null || true
    for i in $(seq 1 8); do
      sleep 1
      if ! kill -0 "$LOCK_PID" 2>/dev/null; then
        echo "[restart-backend] Processo terminato dopo ${i}s."
        break
      fi
    done
    if kill -0 "$LOCK_PID" 2>/dev/null; then
      echo "[restart-backend] SIGTERM ignorato — invio SIGKILL..."
      kill -9 "$LOCK_PID" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "$LOCK_FILE"
  echo "[restart-backend] Lock rimosso."
fi

echo "[restart-backend] Avvio start-backend.sh..."
exec bash scripts/start-backend.sh
