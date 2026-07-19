#!/usr/bin/env bash
# check-replit-ports.sh — Gate: verifica il mapping canonico [[ports]] in .replit
#
# Regola immutabile:
#   localPort=5000  → externalPort=80    (Express API, traffico pubblico)
#   localPort=8081  → externalPort=8081  (probe deploy interno)
#   [deployment] run DEVE contenere PORT=5000 (non PORT=8081)
#
# Exit 0 → mapping corretto
# Exit 1 → mapping invertito o mancante
#
# Soppressione: nessuna — il mapping porte è invariante di sistema.
# Vedi: .agents/memory/port-mapping-probe-vs-express.md

set -euo pipefail

REPLIT_FILE="${REPLIT_FILE:-.replit}"

if [[ ! -f "$REPLIT_FILE" ]]; then
  echo "❌ check-replit-ports: file non trovato: $REPLIT_FILE"
  exit 1
fi

# Normalizza rimuovendo spazi attorno a = (TOML inline, es. "localPort = 5000")
_NORM=$(tr -d ' ' < "$REPLIT_FILE")

PORT_OK=true

# ── Check 1: localPort=5000 → externalPort=80 ───────────────────────────────
if printf '%s\n' "$_NORM" | grep -A1 'localPort=5000' | grep -q 'externalPort=80$'; then
  echo "✅ [[ports]] localPort=5000 → externalPort=80: OK"
else
  echo "❌ ERRORE [[ports]]: localPort=5000 deve avere externalPort=80 (trovato mapping errato o mancante)"
  PORT_OK=false
fi

# ── Check 2: localPort=8081 → externalPort=8081 ─────────────────────────────
if printf '%s\n' "$_NORM" | grep -A1 'localPort=8081' | grep -q 'externalPort=8081$'; then
  echo "✅ [[ports]] localPort=8081 → externalPort=8081: OK"
else
  echo "❌ ERRORE [[ports]]: localPort=8081 deve avere externalPort=8081 (trovato mapping errato o mancante)"
  PORT_OK=false
fi

# ── Check 3: [deployment] run contiene PORT=5000, non PORT=8081 ──────────────
if grep -q 'PORT=8081' "$REPLIT_FILE" 2>/dev/null; then
  echo "❌ ERRORE deploy: .replit contiene PORT=8081 nel comando run (deve essere PORT=5000)"
  PORT_OK=false
fi
if ! grep -q 'PORT=5000' "$REPLIT_FILE" 2>/dev/null; then
  echo "❌ ERRORE deploy: .replit non contiene PORT=5000 nel comando run"
  PORT_OK=false
fi

if [ "$PORT_OK" = true ]; then
  echo "✅ Porte .replit corrette: mapping canonico + deploy PORT=5000."
  exit 0
else
  echo ""
  echo "⛔ PORTE ERRATE — correggere .replit prima di procedere."
  echo "   Configurazione canonica richiesta:"
  echo "     [[ports]] localPort=5000  → externalPort=80"
  echo "     [[ports]] localPort=8081  → externalPort=8081"
  echo "     [deployment] run → PORT=5000"
  echo ""
  echo "   Questa regressione ha mandato giù prod in passato."
  echo "   Vedi: .agents/memory/port-mapping-probe-vs-express.md"
  exit 1
fi
