#!/usr/bin/env bash
# Script build EAS v53 — APK release (profile: release-apk, canale: production)
# Output va in /tmp/eas-build-v53-result.log

LOG=/tmp/eas-build-v53-result.log
echo "=== EAS BUILD v53 START $(date) ===" > "$LOG"

cd /home/runner/workspace

EAS_NO_VCS=1 EXPO_TOKEN=$EXPO_TOKEN eas build \
  --profile release-apk \
  --platform android \
  --non-interactive \
  2>&1 | tee -a "$LOG"

echo "=== EAS BUILD DONE $(date) EXIT: $? ===" >> "$LOG"
