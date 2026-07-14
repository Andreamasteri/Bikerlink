---
name: AI SDK v6 → v7 migration
description: What actually breaks vs. what is a soft deprecation when upgrading `ai` v6→v7 and `@ai-sdk/*` v3→v4 in this backend.
---

# AI SDK v6 → v7 (and @ai-sdk/* v3 → v4) migration

**Rule:** Migrate empirically — bump packages, run both typechecks, fix only what the compiler flags. Most v6→v7 changes are renames that keep working via deprecated aliases, so a blind codemod is unnecessary churn.

**Why:** The only things that actually FAILED to compile were:
- explicit `tool<INPUT, OUTPUT>()` generics — v7 removed them; use plain `tool({...})` and let types infer.
- `as never` / `as Record<string,never>` casts on `tools` passed to `streamText`/`generateText` — build the tools object `as ToolSet` instead (import `type ToolSet` from `"ai"`).

**Soft deprecations (old name still works, but we migrated to the new one):**
- `system:` → `instructions:` (top-level option on generateText/streamText/generateObject/streamObject).
- `stepCountIs(n)` → `isStepCount(n)`.
- streamText `onFinish` → `onEnd` (same event shape). Also `onStepFinish`→`onStepEnd`, `onFinish`(step)→`onEnd`.

**How to apply / gotchas:**
- `generateStructured(...)` is OUR internal wrapper (server/ai/moderation/provider.ts). Its `system` param and the `RouteAiOptions.system` field are NOT the SDK option — do NOT rename them. Only rename `system:`→`instructions:` at the ACTUAL `generateObject/generateText/streamText` call site (inside the wrapper it becomes `instructions: opts.system`).
- If you rename `stepCountIs`→`isStepCount` in agent.ts, update the `ai` module mocks + assertions in the agent test suites in lockstep (they mock/assert on the exact export name).
- Provider factories unchanged: `createOpenAI/createGoogleGenerativeAI/createGroq/createOllama` (ollama-ai-provider-v2 v4) all still take the same config. `@ai-sdk/provider` v4 still exports `LanguageModelV2`.
- We use `.textStream` (still valid). We do NOT use `.fullStream`/`toTextStreamResponse`/`toUIMessageStreamResponse`/`customTool` — the v7 deprecations there don't touch us.
- **Node engine:** v7 packages declare `engines.node >=22`; this repl/deploy runs Node 20. It's EBADENGINE warnings only — imports, provider factories, and a full backend boot all work fine on Node 20 (verified). Don't panic-bump Node for this.
- ollama-ai-provider-v2 is coupled: its v4 peer-requires `ai@^7` + zod `^4`, so bump it together with `ai`.
