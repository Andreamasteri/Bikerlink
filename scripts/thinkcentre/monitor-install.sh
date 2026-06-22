#!/usr/bin/env bash
# Installa il monitor live sul ThinkCentre.
# Eseguire DA REMOTO: bash scripts/thinkcentre/monitor-install.sh
# Oppure via SSH:     bash <(cat scripts/thinkcentre/monitor-install.sh)

set -e

SCRIPT_DIR="$HOME/bikerlink-monitor"
MONITOR_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/monitor.sh"

mkdir -p "$SCRIPT_DIR"

# Copia monitor.sh nella home monitor dir
cp "$MONITOR_SRC" "$SCRIPT_DIR/monitor.sh"
chmod +x "$SCRIPT_DIR/monitor.sh"
echo "✅ monitor.sh installato in $SCRIPT_DIR"

# Aggiungi @reboot al crontab (se non già presente)
CRON_LINE="@reboot screen -dmS tc-monitor bash $SCRIPT_DIR/monitor.sh"
if crontab -l 2>/dev/null | grep -qF "$SCRIPT_DIR/monitor.sh"; then
  echo "ℹ️  @reboot già in crontab — nessuna modifica"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "✅ @reboot aggiunto al crontab"
fi

# Avvia subito se non già in esecuzione
if screen -ls 2>/dev/null | grep -q "tc-monitor"; then
  echo "ℹ️  tc-monitor già in esecuzione"
else
  screen -dmS tc-monitor bash "$SCRIPT_DIR/monitor.sh"
  sleep 1
  echo "✅ Monitor avviato (screen tc-monitor)"
fi

echo ""
echo "📋 Comandi utili:"
echo "  tail -f ~/bikerlink-monitor/live.log   # log live"
echo "  screen -r tc-monitor                   # entra nella sessione"
echo "  screen -ls                             # lista sessioni"
echo "  kill \$(cat ~/bikerlink-monitor/monitor.lock)  # stop manuale"
