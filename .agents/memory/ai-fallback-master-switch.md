---
name: AI fallback master switch
description: Global admin toggle forcing self-hosted-only (ThinkCentre) vs allowing paid cloud fallback — the design decisions and the non-obvious gotchas.
---

# AI fallback master switch ("Fallback AI")

Global admin toggle deciding whether the app may fall back from self-hosted
ThinkCentre (Ollama) to paid cloud providers (Groq/Gemini/OpenAI). Setting key
`ai_fallback_enabled` in AppSetting (`"true"`/`"false"` string), accessor in
`server/ai/fallback-switch.ts`.

## Decisions & why

- **Default OFF (self-hosted-only) when unset.** OFF is the safe direction: in
  doubt the app must never spend money on a cloud provider. Cache read-failure
  also fails to OFF for the same reason.
- **Gate at the shared choke points, not per-consumer.** Nearly every AI consumer
  funnels through `runWithFallback()` and `resolveModel()` in
  `server/ai/moderation/provider.ts`, so gating those two covers assistant /
  moderation / watchdog / console / translations / OTA without touching each file.
  Only the paths that bypass those two need their own gate: the routing
  ai-engine-decider cloud phase, the route-provider chain resolver (which the
  waypoints NL parser iterates), and the admin provider-test endpoint.
  **How to apply:** before adding a new cloud call site, route it through
  `runWithFallback`/`resolveModel`; if it can't, add an explicit switch check.
- **OFF semantics in `runWithFallback`:** ignore `skipOllama`, attempt Ollama-only,
  and on failure throw a clear self-hosted-unavailable error rather than entering
  the cloud loop. This satisfies both "always try self-hosted" and "never cloud".
- **`setAiFallbackEnabled` must fail-fast.** Persist first, update the in-memory
  cache only after a successful DB write, and let write errors propagate so the
  admin endpoint returns 5xx. **Why:** swallowing the error made the API report
  success while DB state was unchanged, so behavior silently reverted on restart /
  on other instances — an operator would believe a global cost switch had flipped
  when it hadn't.
- **Conscious exclusion:** the embeddings provider has its own local fallback and
  is not a text-generation cloud fallback, so it is intentionally not gated.

## Gotcha: default-OFF breaks cloud-cascade tests

Any test that exercises the cloud cascade must mock the switch **ON**, otherwise
Ollama-first-only kicks in and no cloud provider is ever reached — the assertions
about Groq/Gemini/OpenAI ordering will fail. Mock `../ai/fallback-switch` with all
accessors returning enabled=true. Tests of the OFF behavior instead drive the real
module via a storage `getAppSetting` mock keyed on `ai_fallback_enabled`.
