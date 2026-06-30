---
name: DragonflyDB flag compatibility
description: Redis-only CLI flags that DragonflyDB rejects at startup, and the minimum memory needed to boot.
---

DragonflyDB (tested v1.38.1) is mostly Redis-protocol-compatible but its binary does NOT accept several common Redis server CLI flags — passing them causes an immediate crash-loop ("Unknown command line flag").

Known incompatible flags:
- `--maxmemory-policy` — not supported, omit it.
- `--save` — Redis snapshot scheduling flag; Dragonfly's equivalent is `--snapshot_cron="<cron expr>"` (e.g. `"0 * * * *"` for hourly).
- `--aof_rewrite_min_size` — Redis AOF-specific, not applicable.

Memory floor: Dragonfly allocates ~256MB per IO thread; with the default 4 IO threads it needs `--maxmemory` ≥ 1GiB or it exits immediately on boot. 512MB is not enough.

**Why:** discovered via crash-loop while standing up Dragonfly as a Redis replacement on a self-hosted Docker host — the container would exit instantly with flags copied verbatim from the old Redis service definition.

**How to apply:** when writing or reviewing any Dragonfly docker-compose service or startup script, strip Redis-only flags and ensure `--maxmemory` is ≥1gb (or reduce IO threads if less memory is available).
