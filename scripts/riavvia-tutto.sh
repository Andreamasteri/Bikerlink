#!/bin/bash
echo "============================================"
echo "  RIAVVIA TUTTO - BikerLink"
echo "============================================"
echo ""

echo ">>> Massacro tutti i processi..."
fuser -k -9 8081/tcp 2>/dev/null || true
fuser -k -9 5000/tcp 2>/dev/null || true
pkill -9 -f "expo start|metro|react-native start|tsx server" 2>/dev/null || true
sleep 1

echo ">>> Pulizia cache Metro, Expo, Babel e tmp..."
rm -rf /home/runner/workspace/node_modules/.cache 2>/dev/null
rm -rf /home/runner/workspace/.expo 2>/dev/null
rm -rf /home/runner/workspace/tmp 2>/dev/null
rm -rf /home/runner/workspace/.babel-cache 2>/dev/null
rm -rf /tmp/metro-* 2>/dev/null
rm -rf /tmp/haste-* 2>/dev/null
rm -rf /tmp/react-* 2>/dev/null
rm -rf /tmp/babel-* 2>/dev/null
echo "    Tutte le cache eliminate!"

echo ">>> Verifica porte..."
if fuser 5000/tcp 2>/dev/null; then
  echo "    ATTENZIONE: porta 5000 ancora occupata"
else
  echo "    Porta 5000 libera"
fi
if fuser 8081/tcp 2>/dev/null; then
  echo "    ATTENZIONE: porta 8081 ancora occupata"
else
  echo "    Porta 8081 libera"
fi

echo ""
echo ">>> Cache pulita, processi terminati."
echo ">>> Riavvia i workflow 'Start Backend' e 'Start Frontend' per completare."
echo "============================================"
