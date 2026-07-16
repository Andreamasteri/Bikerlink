#!/usr/bin/env bash
# Installa il monitor live sul ThinkCentre.
# Eseguire DA REMOTO: bash scripts/thinkcentre/monitor-install.sh
# Oppure via SSH:     bash <(cat scripts/thinkcentre/monitor-install.sh)
#
# NOTA: stats-server.js (porta 9199) è stato sostituito dall'agente TC
# (thinkcentre-agent/server.js, pm2 bikerlink-agent). Questo script NON
# avvia più stats-server per non collidere con l'agente canonico.

set -e

SCRIPT_DIR="$HOME/bikerlink-monitor"
SCRIPTS_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$SCRIPT_DIR"

# ── monitor.sh ────────────────────────────────────────────────────────────
cp "$SCRIPTS_SRC/monitor.sh" "$SCRIPT_DIR/monitor.sh"
chmod +x "$SCRIPT_DIR/monitor.sh"
echo "✅ monitor.sh installato in $SCRIPT_DIR"

# ── UFW: apri porta 9199 (usata dall'agente TC bikerlink-agent) ───────────
if command -v ufw &>/dev/null; then
  if ! ufw status | grep -q "9199"; then
    ufw allow 9199/tcp comment "BikerLink TC agent" 2>/dev/null || true
    echo "✅ UFW: porta 9199/tcp aperta"
  else
    echo "ℹ️  UFW: porta 9199 già aperta"
  fi
else
  echo "ℹ️  UFW non trovato — verifica manualmente la porta 9199"
fi

# ── Pulizia sessione tc-stats legacy (se ancora in esecuzione) ────────────
# stats-server.js è obsoleto; l'agente TC (pm2 bikerlink-agent) gestisce
# la porta 9199. Se tc-stats è rimasto da un'installazione precedente,
# fermalo per evitare conflitti di porta.
if screen -ls 2>/dev/null | grep -q "tc-stats"; then
  screen -S tc-stats -X quit 2>/dev/null || true
  echo "✅ Sessione tc-stats legacy fermata (superseded da bikerlink-agent)"
fi

# ── Pulizia crontab @reboot legacy ───────────────────────────────────────
CURRENT_CRON=$(crontab -l 2>/dev/null || true)
if echo "$CURRENT_CRON" | grep -q "stats-server.js"; then
  # grep -v ritorna exit 1 quando TUTTE le righe combaciano (crontab vuoto dopo
  # la rimozione) → con set -e il comando fallirebbe. || true lo previene.
  NEW_CRON=$(echo "$CURRENT_CRON" | grep -v "stats-server.js" || true)
  echo "$NEW_CRON" | crontab -
  echo "✅ Voce crontab stats-server.js rimossa"
fi

# ── Crontab @reboot ───────────────────────────────────────────────────────
CRON_MONITOR="@reboot screen -dmS tc-monitor bash $SCRIPT_DIR/monitor.sh"

CURRENT_CRON=$(crontab -l 2>/dev/null || true)

if echo "$CURRENT_CRON" | grep -qF "$SCRIPT_DIR/monitor.sh"; then
  echo "ℹ️  @reboot monitor già in crontab"
else
  (echo "$CURRENT_CRON"; echo "$CRON_MONITOR") | crontab -
  echo "✅ @reboot monitor aggiunto al crontab"
fi

# ── Avvia subito se non già in esecuzione ─────────────────────────────────
if screen -ls 2>/dev/null | grep -q "tc-monitor"; then
  echo "ℹ️  tc-monitor già in esecuzione"
else
  screen -dmS tc-monitor bash "$SCRIPT_DIR/monitor.sh"
  sleep 1
  echo "✅ Monitor avviato (screen tc-monitor)"
fi

echo ""
echo "📋 Comandi utili:"
echo "  curl http://localhost:9199/sys-metrics    # test locale metriche (via bikerlink-agent)"
echo "  pm2 status bikerlink-agent               # stato agente TC"
echo "  pm2 logs bikerlink-agent                 # log agente TC"
echo "  screen -r tc-monitor                     # log monitor docker"
echo "  screen -ls                               # lista sessioni"
echo "  kill \$(cat ~/bikerlink-monitor/monitor.lock)  # stop monitor"
