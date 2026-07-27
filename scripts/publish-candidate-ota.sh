#!/usr/bin/env bash
# Publish exactly one frozen candidate to the internal staging/admin OTA channel.
# This script cannot publish to production.
set -euo pipefail

fail() { echo "[candidate-ota] ERROR: $*" >&2; exit 1; }
info() { echo "[candidate-ota] $*"; }

RELEASE_ID=""
MESSAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
    --message|-m) MESSAGE="${2:-}"; shift 2 ;;
    *) fail "Unknown argument: $1. Usage: $0 --release-id ID --message MESSAGE" ;;
  esac
done

[[ -n "$RELEASE_ID" ]] || fail "--release-id is required"
[[ -n "$MESSAGE" ]] || fail "--message is required"
[[ -n "${EAS_TOKEN:-}" ]] || fail "EAS_TOKEN is required"
[[ -n "${EXPO_PUBLIC_DOMAIN:-}" ]] || fail "EXPO_PUBLIC_DOMAIN must be the HTTPS staging backend domain"
[[ "$EXPO_PUBLIC_DOMAIN" != "bikerlink.replit.app" ]] || fail "The production domain is forbidden for a candidate OTA"

MANIFEST="releases/candidates/${RELEASE_ID}.json"
[[ -f "$MANIFEST" ]] || fail "Missing frozen manifest: $MANIFEST"

CANDIDATE_COMMIT="$(node -e '
const fs=require("fs");
const r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
if (r.release_id !== process.argv[2]) throw new Error("release_id mismatch");
if (r.status !== "db_validated_waiting_staging_backend" && r.status !== "staging_ready") throw new Error("release status is not publishable to staging");
if (r.eas?.channel !== "staging" || r.eas?.environment !== "preview") throw new Error("manifest is not a staging candidate");
console.log(r.candidate_commit_sha);
' "$MANIFEST" "$RELEASE_ID")"

HEAD="$(git rev-parse HEAD)"
[[ "$HEAD" == "$CANDIDATE_COMMIT" ]] || fail "HEAD ($HEAD) differs from frozen candidate ($CANDIDATE_COMMIT). Create a new candidate instead."

info "Frozen release: $RELEASE_ID @ $CANDIDATE_COMMIT"
info "Exporting Android bundle for staging..."
rm -rf dist-ota-candidate
EXPO_PUBLIC_BUILD_PROFILE=staging npx expo export --platform android --output-dir dist-ota-candidate

info "Uploading to EAS channel staging (environment preview)..."
EAS_NO_VCS=1 EAS_SKIP_AUTO_FINGERPRINT=1 EXPO_TOKEN="$EAS_TOKEN" bash scripts/eas.sh update \
  --channel staging \
  --environment preview \
  --message "$MESSAGE" \
  --input-dir dist-ota-candidate \
  --skip-bundler \
  --non-interactive

info "Candidate OTA uploaded. Record EAS update/group IDs in $MANIFEST; do not promote it automatically."
