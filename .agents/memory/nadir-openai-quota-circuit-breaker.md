---
name: Nadir reindex OpenAI quota retry storm — circuit breaker fix
description: how the OpenAI→local embedding fallback avoids retrying an exhausted quota 3x per chunk during a Nadir reindex run.
---

`server/embeddings/client.ts` tries OpenAI first for every embedding, falling back to the local
Xenova model on failure. Before the fix, a quota-exhausted OpenAI account (429 "insufficient_quota")
was treated as a generic retryable error: `isRetryable()` retried ANY 429 with pRetry backoff, so
every chunk of a Nadir reindex (`server/ai/nadir/reindex.ts`) independently burned 3 retries against
OpenAI before falling back — 40+ chunks × 3 retries turned a ~1min local-only reindex into many
minutes.

**Why:** Quota exhaustion is permanent for the current billing window — retrying it per-chunk is pure
waste, unlike a transient 429 rate-limit or 5xx blip which genuinely benefits from backoff.

**How to apply:** `isQuotaExhaustedError()` in `client.ts` distinguishes quota-exhausted 429s (body
mentions "quota"/"insufficient_quota"/billing) from generic 429/5xx. On first detection it opens a
module-level circuit breaker (`openOpenAiCircuitBreaker`, 10min TTL) via `isOpenAiCircuitOpen()`/
`getOpenAiCircuitBreakerStatus()`; while open, `generateEmbedding`/`generateEmbeddings` skip the
OpenAI branch entirely (no log spam, one warning at open time) and go straight to local. The breaker
is process-wide, not scoped to a single reindex run — reuse it as-is rather than threading a run-scoped
flag through call sites. `reindexNadir()` persists `openAiFallbackActive`/`openAiFallbackReason` on
`NadirIndexStatus` (surfaced on the admin Nadir screen + a watchdog log) so admins see when a run used
local-only fallback due to OpenAI being unavailable, distinct from the tolerated per-source reindex
failures already logged there.
