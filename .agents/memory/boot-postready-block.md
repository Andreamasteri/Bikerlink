---
name: Boot post-READY block (non-blocking, non-fatal)
description: Critical boot path vs post-READY work; no process.exit after READY or you get a crash-loop.
---

# Boot post-READY block

The boot is split into a CRITICAL path (must finish before serving) and a POST-READY
block that runs async, non-blocking, non-fatal after the server already declared READY.

- CRITICAL (stays FATAL, may `applyCrashBackoff()` + `process.exit(1)`): listen,
  migrations, schema-drift guard, DB init, seed + matching engine + WS attach.
- POST-READY (`runPostReady()` in `server/boot-sequence.ts`): schedulers (Phase 5),
  competitor PDF, index-drift check, embedding-coverage check, fake-user seed.

**Why:** any `process.exit` AFTER READY restarts a server that already served requests
→ crash-loop. The old index-drift `mode=block` and Phase 5 failure both did this.

**How to apply:**
- Never call `process.exit` in post-READY code. On failure: log + `markDegraded(reason)`.
- The `void runPostReady(...).catch(...)` call MUST keep its `.catch()` — an unhandled
  rejection becomes `unhandledRejection` → `crashExit()` → the same crash-loop.
- index-drift `mode=block` post-READY now marks degraded (no exit); both modes alert in prod.
- `postReadyStarted` flag guards against double execution (schedulers/seed running twice).
