---
name: DragonflyDB cluster_mode=emulated breaks BullMQ without allow-undeclared-keys
description: BullMQ Lua scripts fail on DragonflyDB unless --default_lua_flags=allow-undeclared-keys is set alongside cluster_mode=emulated
---

DragonflyDB (tested v1.38.1) with `--cluster_mode=emulated` (required for BullMQ in general) still enforces the "all touched keys must be declared in KEYS[]" rule that real Redis Cluster enforces — but BullMQ's own scripts (e.g. `addJob`) intentionally touch keys derived from a prefix passed via ARGV, not declared in KEYS. Real standalone Redis never enforced this, so BullMQ "just works" there; Dragonfly in emulated mode does enforce it and fails every job-add with:
`ERR ...script tried accessing undeclared key, key: bull:<queue>:<id>`

**Why:** Discovered while validating a Redis→DragonflyDB migration on a self-hosted box — connectivity/SET-GET/pub-sub all passed fine, only BullMQ job creation failed, making it easy to miss if you don't smoke-test BullMQ specifically (not just basic ioredis ops).

**How to apply:** Any DragonflyDB deployment intended as a drop-in for an app using BullMQ MUST pass `--default_lua_flags=allow-undeclared-keys` in addition to `--cluster_mode=emulated`. Verify with an end-to-end smoke test that actually calls `Queue.add()` + a `Worker` processing the job (not just ioredis SET/GET/pub-sub), using the exact ioredis/bullmq versions the app uses, before cutting over from Redis.
