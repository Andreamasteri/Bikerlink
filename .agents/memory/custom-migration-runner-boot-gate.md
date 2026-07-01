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
