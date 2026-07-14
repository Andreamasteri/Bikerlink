---
name: Quebracho job-registry DirectiveIssuer scope
description: What the coordinator job-gate/job-registry snapshot does and does not expose, and why Horus stays a read-only observer instead of a third directive issuer.
---

`getCoordinatorJobsSnapshot()` (server/ai/coordinator/job-gate.ts) does not surface the
internal `lastError` text field of a job entry — only `lastErrorAt`. Anything built on
top of the snapshot (status bridges, admin UIs) can only report *that* a job last
failed and *when*, not the error text, unless it reads the registry more directly.

`DirectiveIssuer` (server/ai/coordinator/job-registry.ts) only supports `"quebracho"`
and `"admin_manual"`. There is no `"horus"` issuer: Horus can only *read* coordinator
health via a bridge (server/ai/assistant/quebracho-bridge.ts, read-only aggregate used
for chat status lines) and can suggest an assessment during escalation
(server/ai/coordinator/escalation.ts), but cannot pause/resume/force a job itself.

**Why:** the original Quebracho-hardening task scoped "Horus fully autonomous" as an
API-level status/coordination concern, not a mandate to let Horus mutate job state;
extending the type was deferred to keep the task bounded (tracked as a follow-up task,
"Let Horus pause a misbehaving job on its own, without waiting on an admin").

**How to apply:** before building anything that assumes Horus can issue directives, or
that the snapshot exposes error text, check whether that follow-up has landed. If
extending `DirectiveIssuer`, mirror the existing `"quebracho"` fallback behavior (a
directive from an issuer is ignored if that issuer's backing service is unreachable) so
it can never leave a job stuck paused after an outage.
