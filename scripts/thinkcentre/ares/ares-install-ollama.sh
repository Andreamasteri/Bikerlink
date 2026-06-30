#!/usr/bin/env bash
# Step 3 — Installa/aggiorna Ollama su Ares-Linux e configura il keep-in-RAM.
# Idempotente. Eseguito dall'agente via SSH (sudo NOPASSWD durante il setup).
#
#   ARES_MODEL  modello da ripullare (default: qwen3-coder:30b — vedi DIAG_OLLAMA_MODEL)
#
# Note:
#   • Ollama ascolta SOLO 127.0.0.1:11434: l'esposizione pubblica è il tunnel
#     Cloudflare (ares-cloudflared.sh), non un bind 0.0.0.0.
#   • OLLAMA_KEEP_ALIVE=-1 tiene il modello caricato in RAM tra una richiesta e
#     l'altra (Ares è CPU-only: ricaricare ogni volta è lentissimo).
set -euo pipefail
ARES_MODEL="${ARES_MODEL:-qwen3-coder:30b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "==> Installazione Ollama (script ufficiale)"
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "==> Ollama già presente: $(ollama --version 2>/dev/null || echo '?')"
fi

echo "==> systemd override (bind locale + keep-alive in RAM)"
install -d -m 755 /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<'EOF'
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_KEEP_ALIVE=-1"
EOF
systemctl daemon-reload
systemctl enable --now ollama
sleep 2

echo "==> Pull modello: $ARES_MODEL"
ollama pull "$ARES_MODEL"

echo "==> Warm-up + verifica che il modello stia in RAM (no swap)"
ollama run "$ARES_MODEL" "ok" >/dev/null 2>&1 || true
echo "--- ollama ps (PROCESSOR deve essere 100% CPU, niente GPU) ---"
ollama ps || true
echo "--- free -h (Swap used deve restare ~0) ---"
free -h
echo
echo "OK: se 'ollama ps' mostra il modello e 'Swap used' è ~0, il modello gira in RAM."
