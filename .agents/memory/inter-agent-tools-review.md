---
name: Inter-agent tools + task-plan review invariants
description: Durable design constraints for AI-assistant tools that consult another agent mid-conversation, persist per-agent memory, or review a task plan — the decisions that must survive refactors.
---

# Inter-agent tools, agent memory, shared task-plan review

Complementary channel to persona-handoff (roster.ts stays the primary "hand the
whole conversation to another persona" path). These tools let an agent consult
another AI or review a plan WITHOUT changing the active persona.

## Tool gating must stay three-layered
Capability (service configured) → persona/role (who may see the tool) →
contextual keyword selection (attach only what the message needs).
**Why:** full tool prefill costs enough tokens to risk the ~100s Cloudflare
tunnel timeout on CPU Ollama; a plain greeting must attach zero tools.
**How to apply:** contextual selection may only *narrow* the per-persona/role
set — it must never *widen* it (keyword matching keeps existing tools, never
adds ungated ones). The sentinel retry re-runs with the full per-persona set, so
new tools are auto-covered without special handling.

## Never put an 8s tool-execution guard around a heavy-model tool
Tools that call another LLM (self-hosted or Ares) take tens of seconds. The
generic tool guard's short timeout would kill every call. Such tools own their
timeout internally and return courtesy text on failure so the model never sees a
stack trace.
**Why:** a client that only accepts an abort signal (no timeoutMs) will hang
indefinitely under a degraded local model — enforce the cap with a composite
signal (caller signal + internal timer) and surface a clear "took too long".

## File-reading tools exposed in chat are an arbitrary-file-read vector
A plan-review tool that accepts a raw file path and streams the contents back to
the user is a confidentiality risk once it is reachable from a normal (non-admin)
chat turn.
**Why:** prompt-driven absolute paths / `..` traversal → local file disclosure.
**How to apply:** (1) confine every path to the project root — reject absolute
paths and any resolved path escaping the root; (2) gate disk reads to admin
sessions, leaving pasted-text review available to everyone; (3) keep a regression
test proving a non-admin turn cannot trigger a file read.

## Review routes to the invoking persona's agent; the module stays DB-free
The shared review module imports no DB so a one-shot CLI can run it without
booting the backend. Reviews are single-cycle (one at a time, lock released in
`finally`) and preflight-fail (empty plan / missing or disallowed file /
unconfigured agent) BEFORE contacting any model. Invariant regardless of caller:
"proposes, never applies changes" — no write tools in the review path.

## No formal "technical-supervision backlog" exists in this repo
The Ares consult tool composes its prompt from the current conversation context
instead of advancing a backlog entity. If a real backlog is added later, swap the
context-composition for it.

## Per-agent persistent memory path must be read lazily
The memory-file path is resolved on each call (env override else a default under
a git-ignored dir), not captured in a module-level const — otherwise tests can't
redirect it and would write into the real repo. Don't revert to a const.

## A GLOBAL persistent-memory note is a cross-user injection/PII channel
Horus memory is a single global file injected into the system prompt of EVERY
future Horus conversation. That shared surface means any writer can affect every
other user's session.
**Why:** completion code review rejected an early version where any (non-admin)
user could write the global note → cross-user prompt-poisoning + PII leakage.
**How to apply:** (1) gate the write tool to admin sessions only — non-admin
turns must not even see it; (2) reject secrets on the RAW text (matchesSensitive)
BEFORE PII redaction, then redactPII before persisting; (3) keep regression tests
proving non-admin can't write and that secrets/PII never reach disk. If true
per-user isolation is later added, scope the file by userId instead of admin-gating.
