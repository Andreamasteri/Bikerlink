#!/usr/bin/env bash
# Script temporaneo per submit EAS build v50 — OTA attiva
# Output va in /tmp/eas-build-v50-result.log

LOG=/tmp/eas-build-v50-result.log
echo "=== EAS BUILD v50 START $(date) ===" > "$LOG"

cd /home/runner/workspace

EAS_NO_VCS=1 EXPO_TOKEN=$EXPO_TOKEN eas build \
  --profile release-apk \
  --platform android \
  --non-interactive \
  2>&1 | tee -a "$LOG"

echo "=== EAS BUILD DONE $(date) EXIT: $? ===" >> "$LOG"
