#!/usr/bin/env bash
# config-valhalla — fonte unica dei parametri di SERVE di Valhalla
#
# NON genera valhalla.json e NON tocca concurrency/costing: è solo un wrapper
# riusabile dei parametri di serve (porta, percorsi tiles/data, immagine Docker),
# così che 05.sh e 99.sh non duplichino valori hardcoded.
#
# Due modi d'uso:
#   1. Sorgente (consigliato negli altri script):
#        source "$(dirname "$0")/config-valhalla.sh"
#      → imposta le variabili VALHALLA_* SENZA alterare le opzioni della shell
#        chiamante e SENZA sovrascrivere valori già presenti nell'ambiente
#        (override via env: `VALHALLA_PORT=9002 ./05.sh`).
#   2. Eseguito direttamente:
#        ./config-valhalla.sh
#      → applica `set -euo pipefail` e stampa la configurazione effettiva.
#
# Retro-compatibile: i default coincidono con i valori finora hardcoded.

# --- Parametri di serve (default = valori storici) ---
# NOTA: nessun VALHALLA_URL qui. L'URL pubblico è gestito altrove (nginx/env app)
# e mescolarlo coi parametri locali farebbe puntare i boot-check (99.sh) fuori da
# localhost. Qui restano solo i parametri di SERVE locali: porta, tiles/data, immagine.
: "${VALHALLA_DATA_DIR:=$HOME/valhalla/data}"
: "${VALHALLA_TILES_DIR:=$VALHALLA_DATA_DIR/valhalla_tiles}"
: "${VALHALLA_PORT:=8002}"
: "${VALHALLA_IMAGE:=ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"

export VALHALLA_DATA_DIR VALHALLA_TILES_DIR VALHALLA_PORT VALHALLA_IMAGE

# Eseguito direttamente (non sorgente): stampa la config in modo verboso.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  set -euo pipefail
  echo "=== CONFIG VALHALLA (parametri di serve) ==="
  echo ""
  echo "  VALHALLA_DATA_DIR  = $VALHALLA_DATA_DIR"
  echo "  VALHALLA_TILES_DIR = $VALHALLA_TILES_DIR"
  echo "  VALHALLA_PORT      = $VALHALLA_PORT"
  echo "  VALHALLA_IMAGE     = $VALHALLA_IMAGE"
  echo ""
  echo "Sorgi questo file negli altri script con:"
  echo "  source \"\$(dirname \"\$0\")/config-valhalla.sh\""
  echo ""
  echo "Override puntuale via env, es.:"
  echo "  VALHALLA_PORT=9002 ./05.sh"
fi
