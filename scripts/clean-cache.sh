#!/bin/bash
# EAS Builder Cache Cleanup Script
# Rimuove la cache locale di Expo/Metro/Gradle per garantire una build EAS pulita.
# Idempotente: sicuro da eseguire anche se le cartelle non esistono.
# Uso: bash scripts/clean-cache.sh

cleanup_dir() {
  local dir="$1"
  local label="$2"
  if [ -e "$dir" ]; then
    rm -rf "$dir"
    echo "    [OK] $label rimossa: $dir"
  else
    echo "    [SKIP] $label non presente: $dir"
  fi
}

echo "=== Pulizia Cache EAS Builder ==="
echo ""

# 1. Cache .expo (rimossa interamente — Expo la ricrea automaticamente all'avvio)
echo "[1/4] Pulizia cache .expo..."
cleanup_dir ".expo" "Cache Expo (.expo/)"

# 2. Cache Metro bundler (node_modules/.cache)
echo ""
echo "[2/4] Pulizia cache Metro (node_modules/.cache)..."
cleanup_dir "node_modules/.cache" "Cache Metro (node_modules)"

# 3. Cache Metro principale (.metro-cache)
echo ""
echo "[3/4] Pulizia cache Metro (.metro-cache)..."
cleanup_dir ".metro-cache" "Cache Metro principale"

# 4. Cache Gradle/Android (se presenti)
echo ""
echo "[4/4] Pulizia cache Gradle/Android..."
cleanup_dir ".gradle"           "Cache Gradle locale"
cleanup_dir "android/.gradle"   "Cache Gradle Android"
cleanup_dir "android/app/build" "Build Android"

echo ""
echo "=== Stato cache dopo pulizia ==="
echo ""

if [ -d ".expo" ]; then
  echo ".expo/: ANCORA PRESENTE (verificare)"
else
  echo ".expo/: NON PRESENTE (pulita)"
fi

if [ -d "node_modules/.cache" ]; then
  echo "node_modules/.cache: ANCORA PRESENTE (verificare)"
else
  echo "node_modules/.cache: NON PRESENTE (pulita)"
fi

if [ -d ".metro-cache" ]; then
  echo ".metro-cache: ANCORA PRESENTE (verificare)"
else
  echo ".metro-cache: NON PRESENTE (pulita)"
fi

echo ""
echo "=== Pulizia completata ==="
echo ""
echo "Per pulire anche la cache remota EAS sulla prossima build, usare:"
echo "  bash scripts/eas.sh build --platform android --clear-cache"
echo "  bash scripts/eas.sh build --platform ios --clear-cache"
