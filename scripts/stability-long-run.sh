#!/usr/bin/env bash
# Task #2661 follow-up #FU-2 — Long-run stability sampler.
# Esegue per DURATION_SEC (default 1800 = 30 min) un loop di health-check + RSS sampling
# su tutti i processi node del workspace. Output: report tabellare a stdout + tmp file.
#
# Usage:
#   bash scripts/stability-long-run.sh              # 30 min default
#   DURATION_SEC=120 bash scripts/stability-long-run.sh   # 2 min burn-in
#   SAMPLE_INTERVAL_SEC=10 DURATION_SEC=300 bash scripts/stability-long-run.sh
set -euo pipefail

DURATION_SEC="${DURATION_SEC:-1800}"
SAMPLE_INTERVAL_SEC="${SAMPLE_INTERVAL_SEC:-30}"
HEALTH_URL="${HEALTH_URL:-http://localhost:5000/api/health}"
REPORT="${REPORT:-/tmp/stability-long-run-$(date +%Y%m%d-%H%M%S).log}"

echo "=== stability-long-run ===" | tee "$REPORT"
echo "  duration:        ${DURATION_SEC}s" | tee -a "$REPORT"
echo "  sample interval: ${SAMPLE_INTERVAL_SEC}s" | tee -a "$REPORT"
echo "  health url:      ${HEALTH_URL}" | tee -a "$REPORT"
echo "  report file:     ${REPORT}" | tee -a "$REPORT"
echo "  started at:      $(date -u +%FT%TZ)" | tee -a "$REPORT"
echo | tee -a "$REPORT"

start_ts=$(date +%s)
end_ts=$((start_ts + DURATION_SEC))
samples=0
health_ok=0
health_fail=0
baseline_rss=""
max_rss=0
min_rss=99999999

printf "%-20s %-10s %-12s %-10s %-10s\n" "timestamp" "health" "rss_total_kb" "node_pids" "elapsed" | tee -a "$REPORT"

while [ "$(date +%s)" -lt "$end_ts" ]; do
  ts=$(date -u +%H:%M:%S)
  http=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" || echo "000")
  if [ "$http" = "200" ]; then
    health_ok=$((health_ok + 1))
    health_str="200"
  else
    health_fail=$((health_fail + 1))
    health_str="FAIL($http)"
  fi

  rss_total=$(ps -A -o rss=,comm= | awk '$2 ~ /node/ { sum += $1 } END { print sum+0 }')
  pids=$(pgrep -f "node" | wc -l | tr -d ' ')
  elapsed=$(($(date +%s) - start_ts))

  if [ -z "$baseline_rss" ] && [ "$rss_total" -gt 0 ]; then baseline_rss="$rss_total"; fi
  if [ "$rss_total" -gt "$max_rss" ]; then max_rss="$rss_total"; fi
  if [ "$rss_total" -lt "$min_rss" ] && [ "$rss_total" -gt 0 ]; then min_rss="$rss_total"; fi

  printf "%-20s %-10s %-12s %-10s %-10s\n" "$ts" "$health_str" "$rss_total" "$pids" "${elapsed}s" | tee -a "$REPORT"

  samples=$((samples + 1))
  sleep "$SAMPLE_INTERVAL_SEC"
done

echo | tee -a "$REPORT"
echo "=== summary ===" | tee -a "$REPORT"
echo "  samples:        $samples" | tee -a "$REPORT"
echo "  health 200:     $health_ok" | tee -a "$REPORT"
echo "  health FAIL:    $health_fail" | tee -a "$REPORT"
echo "  baseline RSS:   ${baseline_rss:-n/a} kB" | tee -a "$REPORT"
echo "  min RSS:        ${min_rss} kB" | tee -a "$REPORT"
echo "  max RSS:        ${max_rss} kB" | tee -a "$REPORT"

if [ -n "$baseline_rss" ] && [ "$baseline_rss" -gt 0 ]; then
  growth=$(( (max_rss - baseline_rss) * 100 / baseline_rss ))
  echo "  growth vs baseline: +${growth}%" | tee -a "$REPORT"
  if [ "$growth" -gt 20 ]; then
    echo "⚠️  WARNING: RSS growth >20% over baseline" | tee -a "$REPORT"
  fi
fi

if [ "$health_fail" -gt 0 ]; then
  echo "❌ FAIL: $health_fail health checks failed" | tee -a "$REPORT"
  exit 1
fi
echo "✅ PASS: 0 health failures, run completato" | tee -a "$REPORT"
