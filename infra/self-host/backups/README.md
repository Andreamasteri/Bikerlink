# Redis → DragonflyDB cutover backups

Backups of the ThinkCentre `bikerlink-selfhost_redisdata` Docker volume, taken
before the Redis → DragonflyDB cutover (Task #5244, Step 1). Stored here (off
the ThinkCentre, in the repo) so a rollback is possible even if the home
server's disk is wiped or the volume is deleted during the cutover.

## Current backup

| File | Taken | Source volume | SHA-256 |
|---|---|---|---|
| `redisdata-backup-20260630-194823.tar.gz` | 2026-06-30 19:48 UTC | `bikerlink-selfhost_redisdata` (on ThinkCentre, container `bikerlink-redis`, image `redis:7-alpine`) | `fa553c4affc0206e7e29f9b765bb3822352f850d4e2b48ad2290b50b6292a1c9` |

Contents verified with `tar tzf`: `data/dump.rdb`, `data/appendonlydir/` (AOF
base + incr + manifest). Volume was small (~7 KB tarball) — this is the
production-state cache/queue/heartbeat data at backup time, not a sized-down
sample.

This snapshot is a **pre-cutover refresh** of the earlier
`redisdata-backup-20260630-194436.tar.gz` (replaced). Re-running the backup
procedure right before the cutover produced a **byte-identical** tarball — same
SHA-256 — confirming the Redis volume data had not changed since the first
snapshot (the `bikerlink-redis` container was still `redis:7-alpine`, healthy,
serving). The earlier tarball was removed since its content is preserved
verbatim here.

## How it was taken (on the ThinkCentre, via SSH)

```bash
mkdir -p /home/andrea/backups
docker run --rm \
  -v bikerlink-selfhost_redisdata:/data \
  -v /home/andrea/backups:/backup \
  alpine tar czf /backup/redisdata-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C / data
```

The tarball was then pulled off the ThinkCentre via SFTP and committed here.

## How to restore (rollback)

```bash
# Stop whichever service is currently using the volume (redis or dragonfly)
docker compose -f infra/self-host/docker-compose.yml stop redis   # or: dragonfly

# Restore into a fresh/empty volume
docker run --rm \
  -v bikerlink-selfhost_redisdata:/data \
  -v $(pwd)/infra/self-host/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/redisdata-backup-20260630-194823.tar.gz -C /"

docker compose -f infra/self-host/docker-compose.yml up -d redis  # or: dragonfly
```

## Cutover state at backup time

As of this **refreshed** backup (2026-06-30 19:48 UTC), the real cutover had
**still not run**: the ThinkCentre was running the old `bikerlink-redis`
container (`redis:7-alpine`, healthy, up ~2 days, volume
`bikerlink-selfhost_redisdata`), and only a `bikerlink-dragonfly-test`
container existed (image `ghcr.io/dragonflydb/dragonfly:v1.38.1`, state
`Created` — never started). The production `bikerlink-dragonfly` service from
`docker-compose.yml` had not yet been brought up.

If meaningful time passes or the data changes between now and the actual
`docker compose up` cutover (recreating the stack with
`dragonfly`/`dragonflydata`), re-run the backup procedure once more immediately
before it. The re-run done for this refresh produced a byte-identical tarball,
so the cache/queue/heartbeat data has been static across the window observed —
but verify again right at cutover time to be safe.

Per the migration plan: do **not** remove the old `bikerlink-redis`
container/volume until the new `bikerlink-dragonfly` container has been
verified healthy (see the companion smoke-test follow-up task).
