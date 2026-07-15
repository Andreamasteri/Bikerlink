---
name: AI visible-turn language enforcement
description: How BikerLink forces AI replies into the user's language on visible channels, and where internal comms stay unconstrained.
---

# AI visible-turn language enforcement

Every AI turn VISIBLE to the user must be in the user's app language
(`AppLanguageCode`). Internal, non-visible comms (tool calls, inter-agent API,
background consult/coordination) stay language-free.

**Rule / how to apply:**
- A visible channel means: 1:1 persona chat (all personas), the group
  "tavola rotonda", and any non-streaming visible reply (e.g. notification
  quick-reply). Each such entrypoint must thread the user's language all the way
  into system-prompt generation — not just into RAG/tool filtering.
- The reply-language directive in each system-prompt builder is dynamic and
  defaults to `SOURCE_APP_LANGUAGE` (Italian) when language is absent, so legacy
  clients and admin paths keep the historical Italian behavior with no
  regression.
- In the group turn, the constraint covers the WHOLE visible turn: a persona
  must use the user's language both when addressing the user and when addressing
  the other agents.

**Gotchas:**
- There are several visible entrypoints, not one. When adding a new visible AI
  route, audit that it passes language explicitly — a builder that silently
  defaults to Italian will otherwise reply in the wrong language for non-IT
  users and typecheck won't catch it (it's a behavioral gap, not a type error).
- Group chat persists the language on the conversation row so a resume
  regenerates turns in the same language as the start, rather than re-deriving
  per request.

**Why (think separation):** qwen3 personas (Bowie/Horus) default-reason in
English; with think:false that reasoning is dumped into the visible text and
there is no time to strip it on a live stream. Both the 1:1 and group paths must
keep think:true (reasoning routed to the separate channel) so visible output
stays clean and in-language. Keep the two paths in lockstep — if one flips to
think:false, English reasoning leaks on that surface only.
