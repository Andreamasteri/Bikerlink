---
name: Old Redis retirement on ThinkCentre confirmed safe
description: Verification that the pre-DragonflyDB Redis container/volume can stay retired — what the only fallback is and why no rollback plan is needed.
---

The old `bikerlink-redis` container and its `bikerlink-selfhost_redisdata` volume on the ThinkCentre are fully gone (removed during the DragonflyDB cutover). The ONLY surviving fallback is backup tarballs at `/home/andrea/backups/redisdata-backup-*.tar.gz` — and they are tiny (~6.6K), which means the old Redis held almost nothing at backup time. A dangling empty anonymous docker volume also exists but contains no data (not old Redis).

Confirmed nothing important was dropped in the swap: all real BullMQ queues (embeddings, recap, route-fingerprint, pattern-detect, db-integrity-expensive) had 0 jobs in every state (wait/active/delayed/failed/paused/prioritized), and no `bl:lock:matching` key was held. Live Dragonfly keys were only migration smoke-test residue (`bull:smoke-queue:*`), empty queue scaffolding (`bull:db-integrity-expensive:meta`/`:stalled-check`), and a regenerable cache key (`bl:match-rules:all`).

**Why:** No rollback plan is needed because everything this cache stores is ephemeral by design — the matching lock has a 5-min TTL with an in-memory fallback (`server/cache/matching-lock.ts`), BullMQ jobs are re-enqueued by their schedulers and use removeOnComplete/removeOnFail, and cache keys regenerate. Even a true in-flight loss self-heals.

**How to apply:** Treat the old Redis as safely retired. If asked whether the backup tarballs can be deleted or whether a Redis rollback is required, the answer is the data was non-critical/regenerable — keep the tarballs as cheap insurance but no live volume restore is warranted.
