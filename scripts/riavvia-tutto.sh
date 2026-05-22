#!/bin/bash
echo "============================================"
echo "  RIAVVIA TUTTO - BikerLink"
echo "============================================"
echo ""

echo ">>> Massacro tutti i processi backend..."
fuser -k -9 5000/tcp 2>/dev/null || true
pkill -9 -f "tsx server" 2>/dev/null || true
pkill -9 -f "node server_dist/index.js" 2>/dev/null || true
sleep 1

echo ">>> Pulizia lock e temp orfani..."
rm -f /tmp/start-backend.lock /tmp/start-backend.flock 2>/dev/null
rm -f /tmp/watchdog.flock 2>/dev/null
echo "    Lock e temp eliminati!"

echo ">>> Verifica porte..."
if fuser 5000/tcp 2>/dev/null; then
  echo "    ATTENZIONE: porta 5000 ancora occupata"
else
  echo "    Porta 5000 libera"
fi

echo ""
echo ">>> Processi terminati, lock rimossi."
echo ">>> Riavvia il workflow 'Start App' per completare."
echo "============================================"
