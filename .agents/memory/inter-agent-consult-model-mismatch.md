---
name: Inter-agent consult persona/model mismatch
description: callOllamaChat resolved model from persona-default only; any persona-specific consult (Horus/Ares/etc) must pass an explicit model override or it silently hits Bowie's model.
---

`callOllamaChat` (server/lib/ollama-client.ts) took a `persona` arg to pick the
*endpoint* (URL/token) but resolved the *model name* via
`getOllamaModel(undefined, persona)`, which always fell back to
`BOWIE_OLLAMA_MODEL`. Any caller (e.g. `askHorus` in
server/ai/assistant/inter-agent.ts) that didn't pass an explicit `model` was
silently sending Horus's endpoint a request for Bowie's model name.

**Why:** discovered only by live-testing against the real ThinkCentre (Task
#56) — mocked unit tests never notice, because the mock doesn't care which
model name was requested.

**How to apply:** any new persona-specific Ollama consult/tool must pass an
explicit `model` (see the `HORUS_MODEL_ID` pattern already used in
`agent.ts`/`group-conversation.ts`/`horus-proposer.ts`), never rely on the
default parameter.
