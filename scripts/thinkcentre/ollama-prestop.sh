#!/bin/bash
# Scarica tutti i modelli GPU prima che systemd mandi SIGTERM a ollama.
# Eseguito come ExecStop in ollama.service.d/shutdown.conf.
#
# Senza questo hook, i modelli qwen3/devstral restano in GPU e non rispondono
# a SIGTERM → SIGKILL dopo 75s → deadlock cgroup_drain_dying per 600s.
MODELS=$(curl -sf --max-time 3 http://localhost:11434/api/ps 2>/dev/null \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(m["name"]) for m in d.get("models",[])]' \
  2>/dev/null || true)
for model in $MODELS; do
  echo "[ollama-prestop] scarico: $model"
  curl -sf -X POST http://localhost:11434/api/generate \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$model\",\"keep_alive\":0}" \
    --max-time 10 >/dev/null 2>&1 || true
done
echo "[ollama-prestop] completato"
