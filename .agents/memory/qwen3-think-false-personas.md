---
name: qwen3 think:false for self-hosted personas
description: Bowie and Horus both run qwen3 (which reasons by default) — every Ollama call must pass think:false or <think> blocks pollute chat/JSON.
---

# qwen3 lineup + mandatory think:false

BikerLink's self-hosted assistant lineup (Ollama on ThinkCentre): **Horus = `qwen3:4b`, Bowie = `qwen3:1.7b`**. Bowie was previously on `mistral-nemo:latest` (custom `bikerlink` model) with hardcoded fallbacks to `llama3.2:3b`/`mistral-nemo:latest`; it was realigned to `qwen3:1.7b`.

## Rule — two DIFFERENT values depending on the path

**Streaming persona path** (`agent.ts` streamWith): pass `think: true` for BOTH Bowie and Horus (`ollamaThinkSeparated = true`).
- Reasoning goes to the `thinking` channel → `reasoning-delta` parts of fullStream, NEVER the textStream consumed by the streaming loop. Verified live; `think:false` on qwen3 causes raw English reasoning to pollute visible chat (Task #122 fix).

**Non-streaming / JSON paths** (all other Ollama calls): pass `think: false` + run `stripThink()` post-hoc.
- `ollama-client.ts` callOllamaChat, `group-conversation.ts`, `provider.ts` generateStructured.

**Why:** qwen3 models emit `<think>…</think>` reasoning by default. In streaming, a post-hoc stripper is useless (deltas already sent); in buffered calls, `think:false` is safe because we can strip the orphan `</think>` before returning.

**How to apply:** Ares/Quebracho use separate dedicated endpoints, not these paths. Innocuous for non-reasoning models.

## Secret reminder
The live model is chosen by the `BOWIE_OLLAMA_MODEL` secret (default fallback in code is now `qwen3:1.7b`). After deploying the new base model on the ThinkCentre, the secret must be updated **manually** in Replit Secrets — the agent cannot modify existing secrets. Base model is `FROM qwen3:1.7b` in `BikerLink-Bowie.Modelfile`; `CHAT_MODEL` default in `setup-ollama-server.sh` is `qwen3:1.7b`.
