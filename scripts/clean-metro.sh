#!/bin/bash
# clean-metro.sh — Pulizia profonda Metro prima di ogni avvio del dev server
# Rimuove: .expo/, node_modules/.cache/metro-*, .metro-cache/, /tmp/metro-*, /tmp/haste-map-*
# Idempotente: nessun errore se le directory non esistono.
# Uso: bash scripts/clean-metro.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

remove_path() {
  local path="$1"
  local label="$2"
  if [ -e "$path" ]; then
    rm -rf "$path"
    echo "  [OK]   $label"
  else
    echo "  [SKIP] $label (non presente)"
  fi
}

echo "[$TIMESTAMP] === Pulizia profonda Metro ==="

# 1. Cartella .expo/ (stato interno Expo: manifest, sessione, cache bundler)
# Preserva .expo/types/ — contiene router.d.ts generato da expo-router,
# non fa parte della cache Metro e serve al typecheck TypeScript.
if [ -d "$PROJECT_ROOT/.expo" ]; then
  # Backup types/ se presente
  if [ -d "$PROJECT_ROOT/.expo/types" ]; then
    cp -r "$PROJECT_ROOT/.expo/types" /tmp/_expo_types_backup 2>/dev/null || true
  fi
  rm -rf "$PROJECT_ROOT/.expo"
  echo "  [OK]   .expo/"
  # Ripristina types/
  if [ -d /tmp/_expo_types_backup ]; then
    mkdir -p "$PROJECT_ROOT/.expo/types"
    cp -r /tmp/_expo_types_backup/. "$PROJECT_ROOT/.expo/types/"
    rm -rf /tmp/_expo_types_backup
    # Rimuovi eventuali sottocartelle spurie (es. types/types/ generata per errore da task agents)
    rm -rf "$PROJECT_ROOT/.expo/types/types"
    echo "  [OK]   .expo/types/ ripristinata (router.d.ts preservato)"
  fi
else
  echo "  [SKIP] .expo/ (non presente)"
fi

# 2. Cache Metro dentro node_modules (solo le sottodirectory metro-*)
if [ -d "$PROJECT_ROOT/node_modules/.cache" ]; then
  for metro_dir in "$PROJECT_ROOT/node_modules/.cache"/metro-*; do
    [ -e "$metro_dir" ] && remove_path "$metro_dir" "node_modules/.cache/$(basename "$metro_dir")"
  done
  # Svuota anche la cache generica di Metro se presente con nomi diversi
  for metro_dir in "$PROJECT_ROOT/node_modules/.cache"/jest-haste-map-* \
                   "$PROJECT_ROOT/node_modules/.cache"/react-native-packager-cache-*; do
    [ -e "$metro_dir" ] && remove_path "$metro_dir" "node_modules/.cache/$(basename "$metro_dir")"
  done
else
  echo "  [SKIP] node_modules/.cache/ (non presente)"
fi

# 3. Cache Metro principale nella root del progetto
remove_path "$PROJECT_ROOT/.metro-cache" ".metro-cache/"

# 4. File temporanei Metro/Haste in /tmp
for tmp_dir in /tmp/metro-* /tmp/haste-map-* /tmp/react-native-packager-cache-*; do
  [ -e "$tmp_dir" ] && remove_path "$tmp_dir" "/tmp/$(basename "$tmp_dir")"
done

echo "[$TIMESTAMP] === Pulizia completata — Metro ripartirà da zero ==="
