---
name: Secret verification blocked by unrelated boot crash
description: What to do when confirming a newly-added secret works is blocked by an unrelated boot-time crash.
---

When a task's acceptance criteria requires confirming a newly added secret is actually being used (e.g. seeing a "connected" log line), a boot crash that happens *before* the code path consuming that secret runs will prevent verification entirely — even if it's unrelated to the secret itself.

**Why:** Boot sequences are staged (HTTP listen → migrations → DB init → schedulers). If a fatal check earlier in the sequence (e.g. a migration-numbering guard) aborts the process, the app never reaches the phase that opens the connection using the new secret, so there's no way to observe success or failure of the secret itself.

**How to apply:** Diagnose the crash first. If it's a small, clearly pre-existing, unrelated issue (e.g. two migration files sharing the same numeric prefix) with no other references to the colliding filename, it's reasonable to fix it as a minimal unblocking step so the acceptance criteria can be verified — call this out explicitly as a deviation in the commit message, since it's outside the original task's scope. Don't fix larger/structural issues found this way; instead note them and let the task owner decide.
