#!/usr/bin/env bash
# Script build EAS — APK release (profile: release-apk, canale: production)
# Output va in /tmp/eas-build-result.log
# Usa bash scripts/eas.sh (node_modules/.bin/eas v20) — NON il globale.

LOG=/tmp/eas-build-result.log
echo "=== EAS BUILD START $(date) ===" > "$LOG"

cd /home/runner/workspace

EAS_NO_VCS=1 EXPO_TOKEN=$EXPO_TOKEN bash scripts/eas.sh build \
  --profile release-apk \
  --platform android \
  --non-interactive \
  2>&1 | tee -a "$LOG"

echo "=== EAS BUILD DONE $(date) EXIT: $? ===" >> "$LOG"
