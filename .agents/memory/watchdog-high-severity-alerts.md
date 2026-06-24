---
name: Watchdog high-severity alerts need a dedicated block
description: Why "high" watchdog signals never push unless alerts.ts has a per-id block
---

In `server/ai/watchdog/alerts.ts`, the generic problem loop only sends admin push for `severity === "critical"` problems. Any `high`-severity signal (e.g. `db.embeddings.hnsw_index`, `maps.health.network_instability`, `db.db.pool.waiting` high) will NEVER produce a push unless you add a **dedicated block** before that loop that matches the problem by `id` and calls `sendSystemAlertPushToAdmins` + `shouldSend(key)` throttle.

**Why:** the critical-only loop is intentional to limit push noise; "high" problems are still visible in the dashboard and fed to the AI proposer, but they don't auto-push without an explicit carve-out. Several dedicated blocks already exist (pool exhaustion, network instability, HNSW index) and follow the same shape.

**How to apply:** when a new collector emits a `high` signal that admins must be notified about, (1) add a `title`/`suggestion` case in `aggregator.ts deriveProblems` (problem id = `${source}.${metric}`), and (2) add a dedicated `snap.problems.find(p => p.id === "..." && p.severity === "high")` block in `alerts.ts` with its own `shouldSend` throttle key. The AI proposer auto-includes any high/critical non-maps problem, so proposer guidance is optional prompt text in `proposer.ts SYSTEM`.
