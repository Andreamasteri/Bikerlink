---
name: AI agent reconnection = code model defaults
description: Why the 4 AI agents "disconnect" and the real fix — code default models must match `ollama list` on the ThinkCentre.
---

# AI agent reconnection: the fix is the default model string, not the wiring

When a BikerLink AI agent (Bowie/Horus/Ares/Quebracho) appears "disconnected" while the
Ollama endpoint is reachable (HTTP 200), the usual root cause is that the **code default
model name does not exist on the ThinkCentre**. Every persona has a `*_OLLAMA_MODEL` env
override, but those secrets are typically **unset**, so the hardcoded default in the client
is what actually runs. If that default was never pulled on the TC, the call fails.

**Why:** at one point the defaults were `mistral-nemo:latest` (Bowie), `bikerlink-routing`
(Horus), `qwen3-coder:30b` (Ares) — none of which were present in `ollama list`. Endpoints
answered 200 on `/api/tags` but chat failed on the missing model. Rewiring auth (CF Access)
was NOT the fix; the CF probes were already working.

**How to apply:** before touching auth/transport, run `ollama list` on the TC (all four
agents point at the SAME host, e.g. `ollama-tc.biker-link.net`) and make each client's
default model a name that actually exists. Confirm the model accepts `think:false` at HTTP
200 (Qwen3 models "think" by default — pass `providerOptions.ollama.think=false` on the SDK
path, or `think:false` in the direct-HTTP body). keep_alive must be sent as a **number**
(`-1`), never the string `"-1"` (which Ollama reads as 0s = immediate unload).

Direct-HTTP agents (Ares, Quebracho) follow the dedicated-client pattern (their own
`*-client.ts` + `*-question.ts`), are admin-only, and degrade to a Bowie message when
offline — never a cloud fallback. SDK agents (Bowie, Horus) go through the Ollama→cloud
provider chain.
