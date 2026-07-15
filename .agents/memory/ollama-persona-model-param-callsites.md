---
name: Ollama persona vs model param — every call site needs auditing
description: callOllamaChat's `persona` only picks the endpoint, not the model; each new/legacy Horus call site must be checked individually for an explicit `model`.
---

`callOllamaChat(prompt, schema, { persona: "horus" })` in `server/lib/ollama-client.ts` uses `persona`
ONLY to select which URL/token endpoint to hit — it does NOT change which model runs. Without an
explicit `model:` override, every Horus-persona call silently runs on Bowie's model
(`BOWIE_OLLAMA_MODEL`, qwen3:1.7b) instead of Horus's own `qwen3:4b`, and any persisted `modelId`
lying about which model actually ran.

**Why:** This bug was fixed once in `horus-scanner.ts`/`horus-scanner-finalize.ts` (Task #92) but a
sibling, pre-existing call site (`horus-analyzer.ts`, the scheduled/autonomous analyzer) had the exact
same pattern and was missed because it's a separate file with no shared helper — grep for
`persona: "horus"` doesn't tell you whether `model:` is also present on the same call.

**How to apply:** Whenever you touch or add a Horus (or any non-default-persona) Ollama call, grep
`grep -rn 'persona: "horus"' server/` and check EVERY hit for a sibling `model: HORUS_MODEL_ID` (or
`process.env.HORUS_OLLAMA_MODEL?.trim() || "qwen3:4b"`) on the same call — do not assume a fix in one
file covers others with the same pattern. Same applies to whatever persisted `modelId`/`model` field
records provenance: it must be set from the same explicit model constant, not from
`getOllamaModelId(persona)` (which also ignores persona and always returns Bowie's model).
