#!/bin/bash
# build-server.sh — Compila il server con cache incrementale basata su checksum SHA256.
# Exit 0 = build OK (o cache hit). Exit non-zero = build fallita.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_ROOT/server_dist"
CACHE_FILE="$DIST_DIR/.build-cache"
PHASE_START=$(date +%s)

log_phase() {
  local elapsed=$(( $(date +%s) - PHASE_START ))
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] [1/4] $1 — ${elapsed}s elapsed"
}

cd "$PROJECT_ROOT"

mkdir -p "$DIST_DIR"

compute_checksum() {
  find server/ shared/ -name '*.ts' -not -path '*/node_modules/*' 2>/dev/null \
    | sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}'
}

CURRENT_CHECKSUM=$(compute_checksum)

if [ -f "$CACHE_FILE" ] && [ -f "$DIST_DIR/index.js" ]; then
  CACHED_CHECKSUM=$(cat "$CACHE_FILE" 2>/dev/null || echo "")
  if [ "$CURRENT_CHECKSUM" = "$CACHED_CHECKSUM" ]; then
    log_phase "Build skipped — cache hit (checksum: ${CURRENT_CHECKSUM:0:8}...)"
    exit 0
  fi
  log_phase "Cache miss — checksum cambiato, rebuild in corso..."
else
  log_phase "Prima build o artefatto mancante — compilazione in corso..."
fi

log_phase "Esecuzione esbuild..."

npx esbuild server/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=cjs \
  --outdir="$DIST_DIR" \
  --alias:@shared/schema=./shared/schema \
  --alias:@shared/privacy-policy-it=./shared/privacy-policy-it \
  2>&1

if [ $? -ne 0 ]; then
  log_phase "ERRORE: esbuild fallito"
  exit 1
fi

echo "$CURRENT_CHECKSUM" > "$CACHE_FILE"
log_phase "Build completata — checksum salvato (${CURRENT_CHECKSUM:0:8}...)"
