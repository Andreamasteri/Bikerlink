#!/usr/bin/env bash
# Installa il monitor live e lo stats server sul ThinkCentre.
# Eseguire DA REMOTO: bash scripts/thinkcentre/monitor-install.sh
# Oppure via SSH:     bash <(cat scripts/thinkcentre/monitor-install.sh)

set -e

SCRIPT_DIR="$HOME/bikerlink-monitor"
SCRIPTS_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$SCRIPT_DIR"

# ── monitor.sh ────────────────────────────────────────────────────────────
cp "$SCRIPTS_SRC/monitor.sh" "$SCRIPT_DIR/monitor.sh"
chmod +x "$SCRIPT_DIR/monitor.sh"
echo "✅ monitor.sh installato in $SCRIPT_DIR"

# ── stats-server.js ───────────────────────────────────────────────────────
cp "$SCRIPTS_SRC/stats-server.js" "$SCRIPT_DIR/stats-server.js"
chmod +x "$SCRIPT_DIR/stats-server.js"
echo "✅ stats-server.js installato in $SCRIPT_DIR"

# ── UFW: apri porta 9199 ──────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  if ! ufw status | grep -q "9199"; then
    ufw allow 9199/tcp comment "BikerLink stats-server" 2>/dev/null || true
    echo "✅ UFW: porta 9199/tcp aperta"
  else
    echo "ℹ️  UFW: porta 9199 già aperta"
  fi
else
  echo "ℹ️  UFW non trovato — verifica manualmente la porta 9199"
fi

# ── Crontab @reboot ───────────────────────────────────────────────────────
CRON_MONITOR="@reboot screen -dmS tc-monitor bash $SCRIPT_DIR/monitor.sh"
CRON_STATS="@reboot screen -dmS tc-stats node $SCRIPT_DIR/stats-server.js"

CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT_CRON" | grep -qF "$SCRIPT_DIR/monitor.sh"; then
  echo "ℹ️  @reboot monitor già in crontab"
else
  (echo "$CURRENT_CRON"; echo "$CRON_MONITOR") | crontab -
  echo "✅ @reboot monitor aggiunto al crontab"
fi

if echo "$CURRENT_CRON" | grep -qF "$SCRIPT_DIR/stats-server.js"; then
  echo "ℹ️  @reboot stats-server già in crontab"
else
  (crontab -l 2>/dev/null; echo "$CRON_STATS") | crontab -
  echo "✅ @reboot stats-server aggiunto al crontab"
fi

# ── Avvia subito se non già in esecuzione ─────────────────────────────────
if screen -ls 2>/dev/null | grep -q "tc-monitor"; then
  echo "ℹ️  tc-monitor già in esecuzione"
else
  screen -dmS tc-monitor bash "$SCRIPT_DIR/monitor.sh"
  sleep 1
  echo "✅ Monitor avviato (screen tc-monitor)"
fi

if screen -ls 2>/dev/null | grep -q "tc-stats"; then
  echo "ℹ️  tc-stats già in esecuzione — riavvio con nuova versione"
  screen -S tc-stats -X quit 2>/dev/null || true
  sleep 1
fi
screen -dmS tc-stats node "$SCRIPT_DIR/stats-server.js"
sleep 1
echo "✅ Stats server avviato su porta 9199 (screen tc-stats)"

echo ""
echo "📋 Comandi utili:"
echo "  curl http://localhost:9199/sys-metrics    # test locale metriche sistema"
echo "  curl http://localhost:9199/repo-drift     # test locale deriva checkout app"
echo "  screen -r tc-stats                       # log stats server"
echo "  screen -r tc-monitor                     # log monitor docker"
echo "  screen -ls                               # lista sessioni"
echo "  kill \$(cat ~/bikerlink-monitor/monitor.lock)  # stop monitor"
