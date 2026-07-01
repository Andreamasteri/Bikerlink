---
name: Persona intro poem pattern (Bowie/Horus/Ares)
description: How the AI assistant emits a one-time poetic greeting per persona on its true first turn, without persisting it or letting the model repeat it.
---

Each AI persona gets a one-time poetic greeting on its true first appearance in a conversation — never re-triggered on later re-entries, never persisted to the DB as model output, and identical across streaming and non-streaming callers.

**Why:** "First turn" can't be derived from the persona-resolution reason, nor from comparing only against the immediately-previous *sticky* persona (a Bowie→Horus→Bowie→Horus cycle would look like a repeat first-turn). It also can't be tied to whether the persona stays sticky afterward: if a persona's first response already contains a farewell (common — prompts hand back to the default persona once done), a stickiness-gated "mark as shown" never fires and the poem repeats next time.

**How to apply:** track "shown" as a persisted, union-only list, independent from the sticky active-persona field, and never delete that state except on session TTL expiry. Mark a persona shown whenever it produces the effective response for a turn — regardless of whether that same turn also ends in a farewell; only the *stickiness* field (not the shown-list) should depend on farewell. On the streaming side, don't emit the greeting speculatively before the model call — emit it lazily on the first real provider delta, so streaming and non-streaming callers see it (or its absence, on total provider failure) identically.
