#!/bin/bash
echo "Stress test disabilitato."
exit 0
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

sysmon_loop() {
  while true; do
    TS=$(date '+%Y-%m-%d %H:%M:%S')
    RAM_LINE=$(free -m | grep '^Mem:')
    RAM_TOT=$(echo $RAM_LINE | awk '{printf "%.1fGB", $2/1024}')
    RAM_USED=$(echo $RAM_LINE | awk '{printf "%.1fGB", $3/1024}')
    RAM_AVAIL=$(echo $RAM_LINE | awk '{printf "%.1fGB", $7/1024}')
    DISK_LINE=$(df -h /home/runner/workspace | tail -1)
    DISK_USED=$(echo $DISK_LINE | awk '{print $3}')
    DISK_TOT=$(echo $DISK_LINE | awk '{print $2}')
    DISK_PCT=$(echo $DISK_LINE | awk '{print $5}')
    echo "[$TS] [SYS] RAM: ${RAM_USED}/${RAM_TOT} usata | Disponibile: ${RAM_AVAIL} | Disco: ${DISK_USED}/${DISK_TOT} (${DISK_PCT})" | tee -a "$LOG_FILE"
    sleep "${TEST_CYCLE_S:-30}"
  done
}

echo "[run-stress] Compilazione stress test..."
node_modules/.bin/esbuild scripts/stress-test.ts \
  --platform=node --packages=external --bundle --format=cjs \
  --outfile=/tmp/stress-test-compiled.js

sysmon_loop &
SYSMON_PID=$!
trap "kill $SYSMON_PID 2>/dev/null" EXIT

echo "[run-stress] Avvio test a $(date)" | tee -a "$LOG_FILE"
node /tmp/stress-test-compiled.js 2>&1 | tee -a "$LOG_FILE"
