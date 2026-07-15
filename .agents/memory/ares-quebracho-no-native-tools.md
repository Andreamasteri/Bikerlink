---
name: Ares/Quebracho lack native tool-calling
description: Why Ares and Quebracho need pre-composition message interception instead of AI-SDK tools, and where that pattern lives.
---

Ares and Quebracho do NOT run through `streamText` in `server/ai/assistant/agent.ts` — they use
dedicated direct-HTTP clients (`ares-client.ts` / `quebracho-client.ts`) with a single question
composed upfront (`composeAresQuestion` / `composeQuebrachoQuestion`). Only Bowie and Horus go
through `streamText`, so only they can expose in-chat AI-SDK tools (e.g. `review_task_plan` via
`buildReviewTaskPlanTool`).

**Why:** Ares/Quebracho's personas are deliberately isolated to a single dedicated-hardware HTTP
call per turn (no server-side tool loop, no `maxSteps`), so giving them "tool" capabilities in chat
requires intercepting the admin's raw message BEFORE composition and branching to the target
capability directly, rather than adding a `tool()` definition.

**How to apply:** To give Ares/Quebracho any new in-chat capability, add a detection heuristic
(pure function, keyword/pattern based) run on `opts.message` at the top of their branch in
`agent.ts`, before `composeAresQuestion`/`composeQuebrachoQuestion` are called; if it matches, call
the target function directly and emit the result exactly like a streamed reply, then fall through to
the existing composition path if it doesn't match. See `detectPlanReviewRequest` in
`server/ai/assistant/task-review.ts` for the reference implementation (task plan review in-chat for
Ares/Quebracho).
