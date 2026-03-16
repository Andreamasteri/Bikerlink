#!/bin/bash
export TEST_BASE_URL="https://1558ee31-33f2-48d2-a649-5b9204bdca66-00-6o409859b891.worf.replit.dev:5000"
export TEST_USER1_EMAIL="admin@bikerlink.it"
export TEST_USER1_PASSWORD="admin2025!"
export TEST_USER2_EMAIL="mod@bikerlink.it"
export TEST_USER2_PASSWORD="mod2025!"
export TEST_DURATION_H="1"
export TEST_CYCLE_S="30"

LOG_FILE="/home/runner/workspace/logs/stress-test-cumulative.log"
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo ""
  echo "================================================================================"
  echo "  RIAVVIO STRESS TEST: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "================================================================================"
} | tee -a "$LOG_FILE"

echo "[run-stress] Compilazione stress test..."
node_modules/.bin/esbuild scripts/stress-test.ts \
  --platform=node --packages=external --bundle --format=cjs \
  --outfile=/tmp/stress-test-compiled.js

echo "[run-stress] Avvio test a $(date)" | tee -a "$LOG_FILE"
exec node /tmp/stress-test-compiled.js 2>&1 | tee -a "$LOG_FILE"
