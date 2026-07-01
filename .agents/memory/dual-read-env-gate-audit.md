---
name: dual-read env gate audit
description: When renaming a secret with a dual-read fallback, audit EVERY direct process.env gate, not just the URL-reader wrapper.
---

# Dual-read env fallback must cover every direct gate

When introducing a dual-read fallback for a renamed secret (e.g. `TC_DRAGONFLY_URL ?? TC_REDIS_URL`), the URL-reader wrapper (`getRedisUrl()` in `server/cache/redis.ts`) is NOT the only place that decides behavior. Independent code paths gate on the raw env var directly with their own `if (process.env.OLD_NAME)`.

**Why:** during the Redis→DragonflyDB rename, the AI coordinator pub/sub path (`server/ai/coordinator/index.ts`) had its own `if (process.env.TC_REDIS_URL)` gate. If a user sets only the NEW secret, that gate stays false and pub/sub never starts even though the datastore is configured — a silent functional gap the wrapper's dual-read didn't cover.

**How to apply:** after adding a dual-read to the wrapper, `grep -rn 'process\.env\.OLD_NAME'` across server/ and shared/ and make every direct gate use the same `NEW ?? OLD` form. Confirm with a grep that no bare `process.env.OLD_NAME` (without the `??`) remains.
