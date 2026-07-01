---
name: Matching Coordinator control plane
description: Single-authority gate for "can a matching cycle run now", Horus decisional authority, Bowie read-only relay
---

# Matching Coordinator control plane

A single module owns "can a matching cycle run now?" — do not let any other
call site (scheduler, admin actions, watchdog proposer) independently decide
kill-switch/pause/stop policy again; route new policy checks through this
module's exported gate/helpers instead of re-reading the underlying signals
(DB pool health, AppSettings) directly elsewhere.

**Why:** before this existed, the same decision was made in 3 unrelated
places (scheduler sync guard, AI watchdog proposer, DB kill-switch check),
which drifted and made it unclear who had final say. A code review caught a
regression during implementation: gating the *entire* cycle (including
cleanup phases) on every non-"running" state broke deterministic parity —
an admin-disabled state should only skip the matching phases, not cleanup,
matching pre-existing behavior. Lesson: when centralizing a policy gate that
replaces several inline checks, enumerate each state's original blast radius
individually — don't assume "not allowed" always means "skip everything."

**Authority split — do not blur this boundary:** the self-hosted decisional
AI is the only actor allowed real write authority over this kind of gate
(pause/resume/force directives), applied through one explicit "apply
directive" entrypoint. A user-facing/cloud-reachable assistant must stay
strictly read-only and can only *relay* a natural-language request to the
decisional AI — it must never fall back to a cloud LLM to make the actual
decision on the authoritative AI's behalf. If the self-hosted AI is
unreachable, the correct behavior is "no action taken," not "let a
substitute model decide while claiming to be the authority."

**Fallback contract:** if the decisional AI/its host is unreachable, an
active "pause" directive must be transparently ignored and the system must
fall through to deterministic behavior — never block waiting on an
unreachable authority. Log each fallback transition, but throttle it (e.g.
once per few minutes) to avoid log storms from repeated gate checks.

**Naming collision gotcha:** if a codebase already has an "AI Coordinator"
concept for a different concern (e.g. AI *provider* policy/routing/audit),
a new domain-specific coordinator (e.g. for matching-cycle policy) can be
confused with it by name alone despite zero code overlap — worth a one-line
disambiguation comment at both call sites so future greps don't conflate them.

**Test mock gotcha found while verifying:** a login-flow test's `db` module
mock only exported `{db, pool}`, but the login route also calls
`isPoolHealthy()` directly from that same module — an incomplete mock made
every login in that test file 500 rather than exercising real logic. Predates
and is unrelated to coordinator work; worth fixing generally whenever a
module's mock is extended for one feature but silently omits an export a
sibling route already depends on.
