---
name: AI audit logging pattern
description: How logAiUsage() works, where it's called, and the proposer groq-only model routing fix
---

# AI audit logging pattern

`server/ai/audit.ts` exports:
- `logAiUsage(subsystem, model, usage, trigger)` — emits `[AI-AUDIT]` line and upserts daily JSONB counter in `app_settings.valueJson` at key `ai_token_audit_YYYY-MM-DD`. Use 3rd arg (valueJson) for the upsert — not 2nd — per the AppSetting valueJson rule.
- `getAiTokenAudit(date?)` — returns `AiTokenAuditData | null` for the given date (default today).

**Why:** all AI calls must be audited for daily quota visibility; JSONB structure is `{ subsystems: { [name]: { calls, tokensIn, tokensOut, total, lastAt, lastTrigger } } }`.

## Proposer Groq-only model routing

`forcedModelId` in `runWithFallback` applies to ALL providers in the chain. Groq-only model names (llama-*, openai/gpt-oss-*) don't exist on Google/OpenAI — passing them as `forcedModelId` causes fallback providers to fail too.

**Fix:** detect Groq-only model names with `/^(llama-3\.|llama-3\d|meta-llama\/|openai\/gpt-oss)/i`; if Groq-only, pass as `forcedModelId` to Groq only via `preferredProvider: "groq"`, not as global `forcedModelId`.

**Llama + json mode (AI SDK v6):** `mode` was REMOVED from `generateObject` in AI SDK v6 — passing `mode:"json"` is silently ignored, so llama-3.x on Groq still gets a `json_schema` and Groq rejects it. The proposer `callModel` no longer passes `mode`; instead it delegates to `generateStructured` (in `server/ai/moderation/provider.ts`), which routes `objectMode:"json"` models through `generateObject({ output: "no-schema" })` + manual Zod validation. Still detect non-strict models via BOTH `mm.objectMode === "json"` AND `/^(llama-3\.|meta-llama\/llama)/i.test(mm.modelId)`. Do NOT reintroduce `mode`.

## Watchdog proposer skip logic

Two guards before the AI call in `proposer.ts`:
1. **Fingerprint skip** — if `hiSev` problem list unchanged since last run, skip (no new info for AI).
2. **Known-offline skip** — if ALL high/crit problems match `KNOWN_OFFLINE_PATTERNS` (includes `/graphhopper/i`, `/valhalla/i`, `/thinkcentre/i`, etc.), skip (AI can't help with infra being offline).

Problem IDs from aggregator: `${s.source}.${s.metric}` e.g. `maps.routing.engine_down.graphhopper`, `maps.health.engine.valhalla`.
