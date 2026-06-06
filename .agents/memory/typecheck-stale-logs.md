---
name: Typecheck workflow stale logs
description: Why the typecheck / typecheck-client workflows show stale failed status after restart, and how to get ground truth.
---

The `typecheck` and `typecheck-client` workflows are run-once TypeScript checks
(not long-running servers). After `restart_workflow`, the `/tmp/logs/<name>_*.log`
snapshots written by the log-mapping system are NOT regenerated reliably — they
keep showing the previous run's output (same run_id/timestamp), so a fixed error
still appears as "failed".

**Why:** the log snapshot files are captured by `refresh_all_logs`, not by the
workflow restart itself; run-once check workflows finish too fast / don't re-emit
to the same mapped file.

**How to apply:** to verify type errors are actually fixed, run the compiler
directly instead of trusting the workflow status or `/tmp/logs`:
- server:  `npx tsc --noEmit --project server/tsconfig.json`
- client:  `npx tsc --noEmit --project tsconfig.json`
- scripts: `npx tsc --noEmit --project scripts/tsconfig.json`
Exit 0 = clean. The client check is slow (>60s) — give it a long timeout.
