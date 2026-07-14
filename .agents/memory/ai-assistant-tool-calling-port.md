---
name: AI assistant tool-calling port (BikerBlog → BikerLink)
description: Which BikerBlog tool-calling bugs apply to BikerLink's Vercel AI SDK assistant and how they were adapted.
---

# AI assistant tool-calling hardening

BikerLink's assistant (`server/ai/assistant/agent.ts`) runs on **Vercel AI SDK
`streamText`** with structured `tool()` defs + `stopWhen: isStepCount(3)` — the SDK
handles tool-calling natively. BikerBlog uses a raw Ollama `chatRaw` loop with
manual tool parsing. **Ports must be adapted (pure helpers), not copied.**

**Rule:** new tool-calling logic goes into pure, unit-testable helpers in
`server/ai/assistant/tool-calling.ts`, wired minimally into `agent.ts`. Never
inline model-output parsing into the stream loop.

**Why:** the two repos have fundamentally different tool-calling runtimes; a
literal copy of BikerBlog's manual-parse code would be dead/harmful under the SDK.

## Which BikerBlog bugs apply here
- **Applicable (ported):** textual tool-call fallback, missing-tool sentinel,
  contextual + capability-gated tool selection, tool-linked cloud-fallback guard.
- **keep_alive:** already correct in `ollama-client.ts` (`normalizeKeepAlive`:
  integer strings → number so `-1` = never-unload; a *string* `"-1"` would mean 0s).
  Locked with a regression test only.
- **N/A to BikerLink's architecture** (would require building new features):
  chat-mode leak (no group/single `mode` param in the route), group-conversation
  filter (no server-side multi-agent group chat; handoff marker stripping already
  exists), deep GitHub read (no interactive `github_read`/dir-listing tool —
  `github-context.ts` fetches a fixed file list), agent-name recognition (no
  inter-agent forwarding *tools*; named invocation handled at persona level via
  `parse{Horus,Ares,Quebracho}Invocation` in `roster.ts`).

## Cloud-fallback guard (the non-obvious one)
Cloud fallback runs **without tools** (`streamWith(model, false)`). So if a turn
*needs* tools but Ollama/ThinkCentre is down, falling back to cloud yields a
plausible answer with **no real data**. Guard: when the contextual selection is
non-empty, no images, and nothing streamed yet → degrade with an explicit ⚠️
message instead of hitting toolless cloud. Conversational turns (empty selection)
and the vision path still fall back normally.
