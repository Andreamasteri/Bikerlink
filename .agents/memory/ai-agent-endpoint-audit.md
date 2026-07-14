---
name: AI agent (Bowie/Horus/Ares/Quebracho) endpoint audit method + findings
description: How to verify the 4-agent Ollama contract end-to-end without an admin session, and what was actually wrong vs. assumed.
---

## Method: verify without an admin HTTP session
`/api/admin/ai/test-ollama` requires an authenticated admin session (401 otherwise). To verify
the real client behavior end-to-end, write a throwaway `tsx` script that imports
`isOllamaConfigured/isOllamaReachable/callOllamaChat/getOllamaDiagnostics` from
`server/lib/ollama-client.ts` and `isAresConfigured/getAresModelId/streamAresChat` from
`server/lib/ares-client.ts` directly, and run it with `npx tsx`. This bypasses HTTP auth
entirely and calls the exact same functions the app uses — far more trustworthy than curling
the TC directly (which only proves network reachability, not that the app's env vars/model
names are correct).

## `cf-access.ts` is the only CF Access mechanism — don't trust "per-agent CF token" claims
`server/lib/cf-access.ts` reads only the generic `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET`
and is shared by Bowie/Horus (`ollama-client.ts`) and Ares (`ares-client.ts`, gated on hostname
ending `.biker-link.net`). There is no separate `DIAG_OLLAMA_CF_CLIENT_ID/SECRET` pair in this
repo — an explore subagent hallucinated that name once. `DIAG_OLLAMA_*` env vars belong only to
the offline CLI `scripts/ollama-diagnose.ts`, unrelated to the in-app agent clients.

## Model-name defaults hardcoded in code are frequently stale — verify against `ollama list`
Hardcoded fallback defaults found in code (`mistral-nemo:latest` for Bowie, `bikerlink-routing`
for Horus, `qwen3-coder:30b` for Ares) matched **none** of the actual tags on the ThinkCentre
(`ollama list`: `bikerlink:latest`, `devstral:latest`, `qwen3:14b/4b/1.7b`, `granite4:tiny-h`,
`llama3.2:3b`, `all-minilm:latest`). Always cross-check a hardcoded model-name default against
the live `ollama list` on the host before trusting it — a stale comment/default is not evidence
a model exists.

## `bikerlink:latest` custom model is qwen3:4b, not mistral-nemo (comment is stale)
`ollama show bikerlink --modelfile` reveals its blob digest matches `qwen3:4b` exactly (same
`ollama list` ID prefix). The comment in `ollama-client.ts` describing it as "based on
mistral-nemo:latest" is stale/wrong — the model was rebuilt at some point without updating the
comment. `bikerlink` is a Qwen-tool-calling-template wrapper, and is the value the code comment
itself recommends via secret (`BOWIE_OLLAMA_MODEL=bikerlink`) — confirmed working end-to-end.

## `think:false` was documented as a "critical pattern to preserve" but was never implemented
No file in this repo (`ollama-client.ts`, `ares-client.ts`, `agent.ts`) ever sends a `think`
parameter to Ollama, and there is no `<think>` stripping anywhere. Verified live: real replies
from Bowie/Horus/Ares contain the raw `<think>...</think>` reasoning block. This is not a
regression to "watch for" — it is a real, currently-shipping gap. Fix needs both `think:false`
in the request body (if the Ollama version/model honors it) AND a server-side regex strip as a
safety net, since flag support varies by Ollama version.

**Why this matters:** any task description that says "preserve pattern X" should be treated as
a claim to verify, not a fact — it can describe an intended architecture that was never actually
built.

## Placeholder secrets sit silently until end-to-end tested
`BOWIE_OLLAMA_URL` contained the literal string `"non ho questo valore...va fatto"` (someone's
TODO note, not a URL) and passed a mere existence check (`Boolean(BOWIE_OLLAMA_URL)` →
`isOllamaConfigured: true`). Only a real network call ("Failed to parse URL from...") surfaced
it. `viewEnvVars`/existence checks are not sufficient to confirm a secret is functional — always
make a real call through the code path that consumes it.
