---
name: qwen3 think:false for self-hosted personas
description: Bowie and Horus both run qwen3 (which reasons by default) — every Ollama call must pass think:false or <think> blocks pollute chat/JSON.
---

# qwen3 lineup + mandatory think:false

BikerLink's self-hosted assistant lineup (Ollama on ThinkCentre): **Horus = `qwen3:4b`, Bowie = `qwen3:1.7b`**. Bowie was previously on `mistral-nemo:latest` (custom `bikerlink` model) with hardcoded fallbacks to `llama3.2:3b`/`mistral-nemo:latest`; it was realigned to `qwen3:1.7b`.

## Rule
Every Ollama call for Bowie or Horus MUST pass `providerOptions: { ollama: { think: false } }`.

**Why:** qwen3 models emit explicit `<think>…</think>` reasoning by default. In chat it pollutes the visible reply; in structured JSON generation it breaks the parse entirely.

**How to apply:** the paths that need it are the assistant stream (`agent.ts` streamWith), the group round-table turn (`group-conversation.ts`), the shared client (`ollama-client.ts` `callOllamaChat`, both generateText and generateObject), and structured generation (`provider.ts` `generateStructured` injects it whenever `m.id === "ollama"`). Apply to ALL Ollama calls (gate on `isOllama`), not just Horus — it's innocuous for non-reasoning models. Ares/Quebracho use separate dedicated endpoints, not these paths.

## Secret reminder
The live model is chosen by the `BOWIE_OLLAMA_MODEL` secret (default fallback in code is now `qwen3:1.7b`). After deploying the new base model on the ThinkCentre, the secret must be updated **manually** in Replit Secrets — the agent cannot modify existing secrets. Base model is `FROM qwen3:1.7b` in `BikerLink-Bowie.Modelfile`; `CHAT_MODEL` default in `setup-ollama-server.sh` is `qwen3:1.7b`.
