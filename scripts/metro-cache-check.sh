#!/bin/bash
# metro-cache-check.sh — Controlla il flag di pulizia notturna Metro.
#
# UTILIZZO: usare con `source` (non come script standalone) all'interno di
#           start-expo.sh, dopo l'acquisizione del lock e prima della logica
#           di reset-cache. Imposta FORCE_RESET=1 se il flag è presente.
#
# Uso manuale (agente/debug):
#   touch /tmp/.metro-cache-purged   → simula la pulizia notturna
#   Poi riavvia il workflow "Start App" → Metro partirà con --reset-cache
#
# Path del flag sovrascrivibile via env (utile nei test):
#   METRO_CACHE_PURGE_FLAG=/tmp/test-purge-flag source scripts/metro-cache-check.sh

METRO_CACHE_PURGE_FLAG="${METRO_CACHE_PURGE_FLAG:-/tmp/.metro-cache-purged}"

if [ -f "$METRO_CACHE_PURGE_FLAG" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [metro-cache-check] Flag pulizia notturna rilevato ($METRO_CACHE_PURGE_FLAG) — imposto FORCE_RESET=1"
  FORCE_RESET=1
  rm -f "$METRO_CACHE_PURGE_FLAG"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [metro-cache-check] Flag rimosso — avvio Metro con --reset-cache"
else
  FORCE_RESET="${FORCE_RESET:-0}"
fi
