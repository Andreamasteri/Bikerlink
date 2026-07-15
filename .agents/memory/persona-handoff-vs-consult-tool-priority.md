---
name: Persona full-handoff vs mid-chat consult-tool priority conflict
description: roster.ts's explicit-persona-invocation regexes and tool-calling.ts's call_horus/call_quebracho/call_ares regexes overlap almost completely; roster.ts always wins, which can make a consult tool unreachable for its own designed trigger phrase.
---

`resolveTurnPersona` (server/ai/assistant/roster.ts) decides the *entire
turn's* persona (full handoff, e.g. "chiama Horus" → the whole reply becomes
Horus) and runs *before* any tool selection. `selectToolNamesForMessage`
(server/ai/assistant/tool-calling.ts) decides which extra tools Bowie gets
for a turn where Bowie stays Bowie (mid-chat consult, e.g. `call_horus` —
Bowie relays and incorporates the answer without changing persona). If a
requestedPersona resolves away from "bowie", the Bowie-only consult tools
(`call_horus`/`call_quebracho`/`call_ares`) are never attached — Horus's own
tool set doesn't include them.

**Why:** these two regex sets were written independently (different tasks)
and use nearly the same invocation verbs + entity name, so roster.ts's
`parseHorusInvocation` intercepted the literal example phrase the consult
tool was built for ("chiedi a Horus perché ha scelto questa strada" — an
indirect relay question) and forced a full persona swap instead, making
`call_horus` unreachable for that exact phrasing. Only caught by live testing
(Task #56); the tool-calling unit tests test `selectToolNamesForMessage` in
isolation and never exercise the full `resolveTurnPersona` pipeline in front
of it.

**How to apply:** `parseHorusInvocation` now explicitly excludes
`/\bchied\w*\s+(a\s+)?horus\b/` (an indirect "ask Horus ..." relay, not a
direct address) before checking its other broader alternatives. When adding
or editing any explicit-persona-invocation regex in roster.ts, check it
against the corresponding `call_*` regex in tool-calling.ts for overlap on
the tool's own designed example phrases — same-persona-name + same-verb
overlaps default to full handoff, silently starving the consult tool. Note
`classifyRoutingIntent`'s "strad\w+ panoramic\w+" etc. rule (route-intent,
priority 4) independently routes to full Horus handoff too — a phrase like
"scenic road" will always hand off regardless of the explicit-invocation fix.
