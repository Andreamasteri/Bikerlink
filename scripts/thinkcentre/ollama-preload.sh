#!/usr/bin/env bash
# ollama-preload.sh — Preload always-on BikerLink AI models into Ollama GPU memory.
#
# Run as ExecStart in ollama-preload.service (oneshot, after ollama.service).
# Canonical source: scripts/thinkcentre/ollama-preload.sh in the BikerLink repo.
# Deploy:  sudo cp scripts/thinkcentre/ollama-preload.sh /usr/local/bin/ollama-preload.sh
#          sudo chmod 755 /usr/local/bin/ollama-preload.sh
#          sudo systemctl daemon-reload
#
# Resident models (keep_alive:-1 = Forever, 100% GPU):
#   qwen3:1.7b      → Bowie      (generate, GPU)
#   qwen3:4b        → Horus      (generate, GPU)
#   all-minilm      → Nadir      (embed, GPU)
#
# RETIRED (do NOT re-add without a matching coordinator):
#   llama3.2:3b     — old Bowie model
#   granite4:tiny-h — old Quebracho model (unified into Horus, Task #591)
#
# NOTE: All Ollama interactions go through the HTTP API (curl) — not the CLI.
# The CLI (ollama pull / ollama list) panics without $HOME set, which is not
# available in the systemd oneshot service environment.

set -euo pipefail

API="http://localhost:11434"

# ── Wait for Ollama API to become available ─────────────────────────────────
wait_api() {
  local tries=0
  echo "[ollama-preload] waiting for Ollama API..."
  while ! curl -sf "$API/api/ps" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      echo "[ollama-preload] WARNING: Ollama API never came up after 60s"
      return 1
    fi
    sleep 2
  done
  echo "[ollama-preload] API ready (after ${tries}x 2s waits)"
}

# ── Check whether a model exists in the local library (via /api/tags) ────────
model_exists() {
  local model="$1"
  # Match both "name" (e.g. "qwen3:1.7b") and "name:latest" (e.g. "all-minilm:latest")
  curl -s "$API/api/tags" | python3 -c "
import json, sys
d = json.load(sys.stdin)
names = [m['name'] for m in d.get('models', [])]
target = '$model'
sys.exit(0 if target in names or (not ':' in target and target + ':latest' in names) else 1)
" 2>/dev/null
}

# ── Pull a model via the API (no CLI / no \$HOME needed) ──────────────────────
pull_model() {
  local model="$1"
  echo "[ollama-preload] pulling $model via API..."
  # stream:false waits for completion; --max-time 600 allows large downloads
  local http_code
  http_code=$(curl -s -o /tmp/ollama-pull-$$.json \
    -w "%{http_code}" \
    --max-time 600 \
    -X POST "$API/api/pull" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"stream\":false}" 2>/dev/null)
  rm -f /tmp/ollama-pull-$$.json
  echo "[ollama-preload] pull $model http=$http_code"
}

# ── Ensure a model is available locally, pulling if missing ──────────────────
ensure_available() {
  local model="$1"
  if model_exists "$model"; then
    echo "[ollama-preload] $model already present locally"
  else
    pull_model "$model"
  fi
}

# ── Load a generate-capable model (qwen3, llama, etc.) ──────────────────────
load_generate() {
  local model="$1"
  curl -s -X POST "$API/api/generate" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"prompt\":\"\",\"keep_alive\":-1}" \
    -o /dev/null -w "  $model  http=%{http_code}\n"
}

# ── Load an embedding model ──────────────────────────────────────────────────
load_embed() {
  local model="$1"
  curl -s -X POST "$API/api/embed" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"input\":\"warmup\",\"keep_alive\":-1}" \
    -o /dev/null -w "  $model  http=%{http_code}\n"
}

# ── Check whether a model is resident in /api/ps ────────────────────────────
resident_has() {
  local model="$1"
  curl -s "$API/api/ps" | python3 -c "
import json, sys
d = json.load(sys.stdin)
names = [m['name'] for m in d.get('models', [])]
target = '$model'
sys.exit(0 if target in names or target + ':latest' in names else 1)
" 2>/dev/null
}

# ────────────────────────────────────────────────────────────────────────────

wait_api

echo "[ollama-preload] ensuring models are available locally..."
ensure_available "qwen3:1.7b"
ensure_available "qwen3:4b"
ensure_available "all-minilm"

echo "[ollama-preload] first pass — loading into GPU memory..."
load_generate "qwen3:1.7b"   # Bowie
load_generate "qwen3:4b"     # Horus
load_embed    "all-minilm"   # Nadir

sleep 2

echo "[ollama-preload] verification pass — reloading any evicted model..."

for model in "qwen3:1.7b" "qwen3:4b"; do
  if ! resident_has "$model"; then
    echo "[ollama-preload] $model missing → reloading..."
    load_generate "$model"
    sleep 2
  fi
done

if ! resident_has "all-minilm"; then
  echo "[ollama-preload] all-minilm missing → reloading..."
  load_embed "all-minilm"
fi

echo "[ollama-preload] done. Resident models:"
curl -s "$API/api/ps" | python3 -c "
import json, sys

# Agent label lookup by model name
AGENT_MAP = {
    'qwen3:1.7b':        'Bowie',
    'qwen3:4b':          'Horus',
    'all-minilm':        'Nadir',
    'all-minilm:latest': 'Nadir',
}

d = json.load(sys.stdin)
for m in d.get('models', []):
    name    = m['name']
    agent   = AGENT_MAP.get(name, '(unknown)')
    vram_gb = round(m.get('size_vram', 0) / 1e9, 2)
    until   = m.get('expires_at', 'unknown')
    proc    = '100% GPU' if m.get('size_vram', 0) > 0 else 'CPU'
    print(f'  {agent:<8} {name:<22} vram={vram_gb}GB  processor={proc}  until={until[:4] if until else \"?\"}')
"
