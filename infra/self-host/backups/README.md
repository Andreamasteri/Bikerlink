# Redis → DragonflyDB cutover backups

Backups of the ThinkCentre `bikerlink-selfhost_redisdata` Docker volume, taken
before the Redis → DragonflyDB cutover (Task #5244, Step 1). Stored here (off
the ThinkCentre, in the repo) so a rollback is possible even if the home
server's disk is wiped or the volume is deleted during the cutover.

## Current backup

| File | Taken | Source volume | SHA-256 |
|---|---|---|---|
| `redisdata-backup-20260630-194436.tar.gz` | 2026-06-30 19:44 UTC | `bikerlink-selfhost_redisdata` (on ThinkCentre, container `bikerlink-redis`, image `redis:7-alpine`) | `fa553c4affc0206e7e29f9b765bb3822352f850d4e2b48ad2290b50b6292a1c9` |

Contents verified with `tar tzf`: `data/dump.rdb`, `data/appendonlydir/` (AOF
base + incr + manifest). Volume was small (136 KB) — this is the
production-state cache/queue/heartbeat data at backup time, not a sized-down
sample.

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
  alpine sh -c "rm -rf /data/* && tar xzf /backup/redisdata-backup-20260630-194436.tar.gz -C /"

docker compose -f infra/self-host/docker-compose.yml up -d redis  # or: dragonfly
```

## Cutover state at backup time

As of this backup, the ThinkCentre (`/home/andrea/bikerlink`) had **not yet
pulled** the `dragonfly` service definition from `docker-compose.yml` — it was
still running the old `bikerlink-redis` container (`redis:7-alpine`, healthy,
volume `bikerlink-selfhost_redisdata`). This backup must be taken (or
refreshed) again immediately before `docker compose up` is actually run on the
ThinkCentre to recreate the stack with `dragonfly`/`dragonflydata`, if
meaningful time passes or the data changes between now and then.

Per the migration plan: do **not** remove the old `bikerlink-redis`
container/volume until the new `bikerlink-dragonfly` container has been
verified healthy (see the companion smoke-test follow-up task).
