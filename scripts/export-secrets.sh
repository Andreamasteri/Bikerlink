#!/usr/bin/env bash
# ============================================================
# BikerLink — Export secrets to .env.backup
# ============================================================
# Esegui questo script dal terminale Replit:
#   bash scripts/export-secrets.sh
#
# Crea .env.backup con tutti i secrets/env correnti.
# Il file è gitignored — NON commitarlo mai.
# Conservalo in un password manager o Google Drive criptato.
# ============================================================
set -euo pipefail

OUT="/home/runner/workspace/BackSecr"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
echo "# Generato: $TIMESTAMP" >> "$OUT"
echo "# ATTENZIONE: file sensibile — non condividere, non committare" >> "$OUT"
echo "" >> "$OUT"

# ── AI / Ollama ─────────────────────────────────────────────
echo "# --- AI / Ollama ---" >> "$OUT"
echo "AI_HUB_GATE_TOKEN=${AI_HUB_GATE_TOKEN:-}" >> "$OUT"
echo "AI_HUB_URL=${AI_HUB_URL:-}" >> "$OUT"
echo "ARES_OLLAMA_MODEL=${ARES_OLLAMA_MODEL:-}" >> "$OUT"
echo "ARES_OLLAMA_TOKEN=${ARES_OLLAMA_TOKEN:-}" >> "$OUT"
echo "ARES_OLLAMA_URL=${ARES_OLLAMA_URL:-}" >> "$OUT"
echo "BOWIE_OLLAMA_MODEL=${BOWIE_OLLAMA_MODEL:-}" >> "$OUT"
echo "BOWIE_OLLAMA_TOKEN=${BOWIE_OLLAMA_TOKEN:-}" >> "$OUT"
echo "BOWIE_OLLAMA_URL=${BOWIE_OLLAMA_URL:-}" >> "$OUT"
echo "HORUS_OLLAMA_MODEL=${HORUS_OLLAMA_MODEL:-}" >> "$OUT"
echo "HORUS_OLLAMA_TOKEN=${HORUS_OLLAMA_TOKEN:-}" >> "$OUT"
echo "HORUS_OLLAMA_URL=${HORUS_OLLAMA_URL:-}" >> "$OUT"
echo "QUEBRACHO_OLLAMA_MODEL=${QUEBRACHO_OLLAMA_MODEL:-}" >> "$OUT"
echo "QUEBRACHO_OLLAMA_TOKEN=${QUEBRACHO_OLLAMA_TOKEN:-}" >> "$OUT"
echo "QUEBRACHO_OLLAMA_URL=${QUEBRACHO_OLLAMA_URL:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Cloud AI APIs ────────────────────────────────────────────
echo "# --- Cloud AI APIs ---" >> "$OUT"
echo "GEMINI_API_KEY=${GEMINI_API_KEY:-}" >> "$OUT"
echo "GROQ_API_KEY=${GROQ_API_KEY:-}" >> "$OUT"
echo "OPENAI_API_KEY=${OPENAI_API_KEY:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Cloudflare ───────────────────────────────────────────────
echo "# --- Cloudflare ---" >> "$OUT"
echo "CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID:-}" >> "$OUT"
echo "CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET:-}" >> "$OUT"
echo "CF_API_TOKEN=${CF_API_TOKEN:-}" >> "$OUT"
echo "" >> "$OUT"

# ── GitHub ───────────────────────────────────────────────────
echo "# --- GitHub ---" >> "$OUT"
echo "GITHUB_PAT=${GITHUB_PAT:-}" >> "$OUT"
echo "GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_PERSONAL_ACCESS_TOKEN:-}" >> "$OUT"
echo "GITHUB_TOKEN=${GITHUB_TOKEN:-}" >> "$OUT"
echo "GITHUB_TOKEN_BIKERBLOG=${GITHUB_TOKEN_BIKERBLOG:-}" >> "$OUT"
echo "BIKERBLOG_GITHUB_TOKEN=${BIKERBLOG_GITHUB_TOKEN:-}" >> "$OUT"
echo "DIAG_GITHUB_TOKEN=${DIAG_GITHUB_TOKEN:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Database / Redis ─────────────────────────────────────────
echo "# --- Database / Redis ---" >> "$OUT"
echo "PROD_DATABASE_URL=${PROD_DATABASE_URL:-}" >> "$OUT"
echo "TC_DRAGONFLY_URL=${TC_DRAGONFLY_URL:-}" >> "$OUT"
echo "TC_REDIS_URL=${TC_REDIS_URL:-}" >> "$OUT"
echo "REDIS_PROBE_HOST=${REDIS_PROBE_HOST:-}" >> "$OUT"
echo "REDIS_PROBE_PORT=${REDIS_PROBE_PORT:-}" >> "$OUT"
echo "REDIS_PROBE_URL=${REDIS_PROBE_URL:-}" >> "$OUT"
echo "REDIS_TUNNEL_HOSTNAME=${REDIS_TUNNEL_HOSTNAME:-}" >> "$OUT"
echo "" >> "$OUT"

# ── ThinkCentre / SSH ────────────────────────────────────────
echo "# --- ThinkCentre / SSH ---" >> "$OUT"
echo "TC_SSH_HOST=${TC_SSH_HOST:-}" >> "$OUT"
echo "TC_SSH_USER=${TC_SSH_USER:-}" >> "$OUT"
echo "TC_SSH_KEY=${TC_SSH_KEY:-}" >> "$OUT"
echo "SSH_PASSWORD=${SSH_PASSWORD:-}" >> "$OUT"
echo "THINKCENTRE_AGENT_TOKEN=${THINKCENTRE_AGENT_TOKEN:-}" >> "$OUT"
echo "THINKCENTRE_METRICS_URL=${THINKCENTRE_METRICS_URL:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Routing / Maps ───────────────────────────────────────────
echo "# --- Routing / Maps ---" >> "$OUT"
echo "GRAPHHOPPER_TOKEN=${GRAPHHOPPER_TOKEN:-}" >> "$OUT"
echo "GRAPHHOPPER_URL=${GRAPHHOPPER_URL:-}" >> "$OUT"
echo "VALHALLA_API_KEY=${VALHALLA_API_KEY:-}" >> "$OUT"
echo "VALHALLA_URL=${VALHALLA_URL:-}" >> "$OUT"
echo "NOMINATIM_TOKEN=${NOMINATIM_TOKEN:-}" >> "$OUT"
echo "PHOTON_TOKEN=${PHOTON_TOKEN:-}" >> "$OUT"
echo "PHOTON_URL=${PHOTON_URL:-}" >> "$OUT"
echo "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Horus / Agenti ───────────────────────────────────────────
echo "# --- Horus / Agenti ---" >> "$OUT"
echo "HORUS_ANALYSIS_URL=${HORUS_ANALYSIS_URL:-}" >> "$OUT"
echo "HORUS_CHAT_PASSWORD=${HORUS_CHAT_PASSWORD:-}" >> "$OUT"
echo "HORUS_HUB_URL=${HORUS_HUB_URL:-}" >> "$OUT"
echo "HORUS_SEARXNG_URL=${HORUS_SEARXNG_URL:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Whisper ──────────────────────────────────────────────────
echo "# --- Whisper ---" >> "$OUT"
echo "WHISPER_HOME_URL=${WHISPER_HOME_URL:-}" >> "$OUT"
echo "WHISPER_TOKEN=${WHISPER_TOKEN:-}" >> "$OUT"
echo "WHISPER_URL=${WHISPER_URL:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Expo / Mobile ────────────────────────────────────────────
echo "# --- Expo / Mobile ---" >> "$OUT"
echo "EXPO_TOKEN=${EXPO_TOKEN:-}" >> "$OUT"
echo "EXPO_PUBLIC_SENTRY_DSN=${EXPO_PUBLIC_SENTRY_DSN:-}" >> "$OUT"
echo "EXPO_PUBLIC_SPOTIFY_CLIENT_ID=${EXPO_PUBLIC_SPOTIFY_CLIENT_ID:-}" >> "$OUT"
echo "APPLE_REVIEWER_PASSWORD=${APPLE_REVIEWER_PASSWORD:-}" >> "$OUT"
echo "GOOGLE_PLAY_REVIEWER_PASSWORD=${GOOGLE_PLAY_REVIEWER_PASSWORD:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Sentry ───────────────────────────────────────────────────
echo "# --- Sentry ---" >> "$OUT"
echo "SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN:-}" >> "$OUT"
echo "SENTRY_BASE_URL=${SENTRY_BASE_URL:-}" >> "$OUT"
echo "SENTRY_DSN=${SENTRY_DSN:-}" >> "$OUT"
echo "SENTRY_ORG=${SENTRY_ORG:-}" >> "$OUT"
echo "SENTRY_PROJECT=${SENTRY_PROJECT:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Monitoring / Infra ───────────────────────────────────────
echo "# --- Monitoring / Infra ---" >> "$OUT"
echo "NGINX_MONITOR_URL=${NGINX_MONITOR_URL:-}" >> "$OUT"
echo "PGADMIN_URL=${PGADMIN_URL:-}" >> "$OUT"
echo "UPTIME_KUMA_URL=${UPTIME_KUMA_URL:-}" >> "$OUT"
echo "UFW_STATUS_URL=${UFW_STATUS_URL:-}" >> "$OUT"
echo "" >> "$OUT"

# ── App / Auth ───────────────────────────────────────────────
echo "# --- App / Auth ---" >> "$OUT"
echo "BIKERLINK_ADMIN_EMAIL=${BIKERLINK_ADMIN_EMAIL:-}" >> "$OUT"
echo "BIKERBLOG_INTERNAL_TOKEN=${BIKERBLOG_INTERNAL_TOKEN:-}" >> "$OUT"
echo "CHAT_EXPORT_TOKEN=${CHAT_EXPORT_TOKEN:-}" >> "$OUT"
echo "SESSION_SECRET=${SESSION_SECRET:-}" >> "$OUT"
echo "" >> "$OUT"

# ── Object Storage ───────────────────────────────────────────
echo "# --- Object Storage ---" >> "$OUT"
echo "DEFAULT_OBJECT_STORAGE_BUCKET_ID=${DEFAULT_OBJECT_STORAGE_BUCKET_ID:-}" >> "$OUT"
echo "PRIVATE_OBJECT_DIR=${PRIVATE_OBJECT_DIR:-}" >> "$OUT"
echo "PUBLIC_OBJECT_SEARCH_PATHS=${PUBLIC_OBJECT_SEARCH_PATHS:-}" >> "$OUT"
echo "SEARXNG_GATE_TOKEN=${SEARXNG_GATE_TOKEN:-}" >> "$OUT"
echo "" >> "$OUT"

# Verifica quanti secrets sono non-vuoti
TOTAL=$(grep -c "^[A-Z]" "$OUT" || true)
EMPTY=$(grep -cE "=$" "$OUT" || true)
FILLED=$(( TOTAL - EMPTY ))

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  BikerLink — Backup secrets completato     ║"
echo "╠════════════════════════════════════════════╣"
printf "║  File       : %-29s║\n" "BackSecr (root progetto)"
printf "║  Secrets    : %-3s compilati / %-3s totali  ║\n" "$FILLED" "$TOTAL"
printf "║  Vuoti      : %-3s (non configurati)       ║\n" "$EMPTY"
echo "╠════════════════════════════════════════════╣"
echo "║  ⚠️  NON committare questo file!            ║"
echo "║  ⚠️  NON condividerlo via chat o email!     ║"
echo "║  ✅  Copia su password manager/Drive        ║"
echo "╚════════════════════════════════════════════╝"
