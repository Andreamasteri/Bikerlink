#!/bin/bash
set -e

BASE_URL="${BASE_URL:-http://localhost:5000}"
CONCURRENT="${CONCURRENT:-10}"
REQUESTS="${REQUESTS:-100}"

echo "[StressTest] Starting stress test — $(date)"
echo "[StressTest] Target: $BASE_URL — Concurrent: $CONCURRENT — Requests: $REQUESTS"

for i in $(seq 1 $REQUESTS); do
  curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/updates/check" &
  if (( i % CONCURRENT == 0 )); then wait; fi
done
wait

echo "[StressTest] Done — $(date)"
