---
name: Custom migration runner is boot-gated, not publish-diffed
description: migrations/*.sql apply via a homegrown boot-time runner (server/migrate.ts), not Replit's schema-diff-on-publish flow; a single bad file blocks the whole pending batch everywhere.
---

Any pending file in `migrations/` (data backfills included, not just DDL) is applied
by `server/migrate.ts` the next time the Express server boots — in dev when the
"Start Backend" workflow (re)starts, in prod on the next publish/boot. This is
separate from and in addition to Replit's managed schema-diff-on-publish flow
described in the `database` skill.

`runMigrations()` calls `assertNoDuplicateMigrationPrefixes()` before touching the
DB. If two migration files share the same `NNNN` numeric prefix and that prefix
isn't in the historical `KNOWN_DUPLICATE_FILE_SETS` allowlist
(`server/migration-prefix-guard.ts`), the guard throws and `runBootSequence()`
aborts with `[startup] FATAL — Migrations failed, aborting`. This blocks the
**entire pending batch**, not just the offending file — so a brand-new duplicate
prefix silently stalls every migration behind it, in both dev and prod, until an
agent notices the boot is crash-looping ("BACKEND ANCORA GIU'" in the Watchdog log)
and fixes the prefix.

**Why:** dev appeared to be missing the newest migration entirely (fresh backfill
showed zero effect) purely because the server hadn't successfully booted since the
conflicting file was added — nothing wrong with the migration SQL itself.

**How to apply:** when a "recent migration doesn't seem applied" report shows up
(dev OR prod), don't assume the SQL is broken — first check whether the backend
even booted successfully (`Start Backend` workflow log for `[migrate]`/`FATAL`
lines) and run `npx tsx server/scripts/check-migration-prefix-duplicates.ts`.
Fixing a duplicate = rename the newer/unapplied file to the next free `NNNN`
(verify via `schema_migrations` in both dev and prod that neither duplicate
filename was already tracked before renaming, or you'll orphan the tracking row).

## Overlapping-boot race (two processes applying the same pending file)

Because the migration runner re-checks and applies pending files on every
boot, two overlapping boot processes (redeploy overlap, or a
healthcheck-triggered restart racing a still-finishing instance) can both see
the same file as pending and both try to apply it. The loser's final tracking
insert used to be treated as FATAL on conflict — crashing the process and
triggering the anti-crash-loop backoff (a burst of healthcheck 500s).

The durable fix pattern: serialize the whole apply phase behind a dedicated
Postgres advisory lock (its own key, separate from other subsystems' locks) so
the loser blocks instead of racing, then re-checks what's still pending after
acquiring the lock. Layer a race-safe upsert (ON CONFLICT DO NOTHING, treat
zero-rows-affected as "already applied concurrently") as an independent
second safety net, in case the lock is ever bypassed by a future refactor.

**Why:** a lock alone is fragile if someone later adds a code path that
doesn't take it; the idempotent insert is a structural backstop that keeps the
"duplicate application is a warning, not a crash" property true regardless.

**How to apply:** treat any "boot crashed with duplicate key on the migration
tracking table" report as this race, not a data bug — look for two boot
sequences overlapping in time rather than assuming the migration SQL itself
is broken.
