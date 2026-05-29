# Replit Support Request — PostGIS `spatial_ref_sys` ownership mismatch after automatic Neon→Helium dev DB upgrade; production databases still provisioned on Neon

## Subject (paste into the support form)

PostGIS owner mismatch (dev=Helium/`postgres`, prod=Neon/`cloud_admin`) causes intermittent 42501 on publish — even a full prod DB deletion + recreation still provisions Neon for production. Please align infra or exclude PostGIS system tables from the schema diff.

---

## TL;DR

After Replit automatically upgraded my **development** database from Neon to Helium, the owner of the PostGIS system table `spatial_ref_sys` diverged: development now has it owned by `postgres` (Helium default), production still has it owned by `cloud_admin` (Neon default). The publish-time schema diff detects this as drift and intermittently emits:

```sql
ALTER TABLE "spatial_ref_sys" ADD PRIMARY KEY ("srid");
```

which **always fails** in production with `42501 must be owner of table spatial_ref_sys`.

I have spent **over 24 hours** isolating and attempting to fix this. I have exhausted every user-accessible workaround, including **completely deleting the production database and recreating it from scratch via the Publish flow** — yet Replit still provisions the new production database on Neon (`neondb`, owner `cloud_admin`), so the owner mismatch persists. **This is not fixable from the user side.** I need platform-level intervention.

---

## App / environment details

- **App name:** BikerLink
- **Production URL:** https://biker-link.replit.app
- **Stack:** Expo (SDK 56) frontend + Express/TypeScript backend
- **Deploy target:** Autoscale
- **Database:** PostgreSQL 16 with the **PostGIS** extension
- **Dev database:** Helium — `DATABASE_URL` host is `helium`, DB name `heliumdb`, user `postgres`, PG version 16.10 x86_64
- **Prod database:** Neon — DB name `neondb`, user `neondb_owner`, PG version 16.14 aarch64
- **Migration system:** custom runner in `server/migrate.ts` (numbered `.sql` files tracked in `schema_migrations`). **`drizzle-kit` has been fully removed** from the project.

---

## The exact error

During publish/deploy the pipeline runs a schema diff between development and production and emits:

```sql
ALTER TABLE "spatial_ref_sys" ADD PRIMARY KEY ("srid");
```

Result:

```
ERROR: must be owner of table spatial_ref_sys
SQLSTATE: 42501 (insufficient_privilege)
```

`spatial_ref_sys` is a **PostGIS system table** (~8,500 EPSG rows) created automatically by `CREATE EXTENSION postgis`. No application role owns it and none can, so any `ALTER` on it is always rejected.

---

## Root cause (with evidence)

I queried both environments directly. The primary key **already exists in both** — the only meaningful difference is the **owner role**:

| | Development (Helium) | Production (Neon) |
|---|---|---|
| DB name | `heliumdb` | `neondb` |
| Connected user | `postgres` | `neondb_owner` |
| PostgreSQL version | 16.10 x86_64 (Helium) | 16.14 aarch64 (Neon) |
| Has PK on `srid` | ✅ yes | ✅ yes |
| Row count | 8,500 | 8,500 |
| **`spatial_ref_sys` owner** | **`postgres`** | **`cloud_admin`** |

Query used (identical in both environments):

```sql
SELECT
  current_database() AS db,
  current_user AS usr,
  (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE relname = 'spatial_ref_sys') AS srs_owner,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'spatial_ref_sys'::regclass AND contype = 'p') AS has_pk,
  (SELECT count(*) FROM spatial_ref_sys) AS rows,
  version() AS ver;
```

### Why this happened

- The Neon→Helium dev DB upgrade is automatic. On the new **Helium** dev DB, PostGIS is installed under the `postgres` superuser → `spatial_ref_sys` owner = `postgres`.
- On **Neon** (both the old prod DB and every new prod DB Replit provisions), PostGIS is installed under a different role → `spatial_ref_sys` owner = `cloud_admin`.
- **Production was never upgraded to Helium** — it stayed on Neon throughout, and even when I deleted and recreated the prod DB, Replit still provisioned a new Neon DB for production.

Result: an owner mismatch on a PostGIS system table that no application role can fix.

### Timeline

- **May 19–28:** All publishes succeeded — dev and prod were both on Neon, same `cloud_admin` owner, diff produced nothing for `spatial_ref_sys`.
- **May 29 (morning):** Dev DB auto-upgraded to Helium. Publishes started failing with `42501` on `ALTER TABLE spatial_ref_sys ADD PRIMARY KEY`.
- **May 29 (afternoon):** Deleted the production database entirely ("Remove database") and republished with *Create production database* + *Set up with development data* enabled — Replit provisioned a **new Neon** database for production (confirmed: `neondb`, owner `cloud_admin`, PG 16.14 aarch64). Owner mismatch unchanged.

### Additional anomaly

Your upgrade documentation states that after a completed upgrade `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` are removed and the old string is saved as `NEON_DATABASE_URL`. In my environment:

- `DATABASE_URL` points to Helium ✅
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` are **still present** ⚠️
- `NEON_DATABASE_URL` is **not present** ⚠️

This suggests the upgrade may have completed only partially.

---

## What I have already tried and ruled out

- ❌ No `ALTER TABLE spatial_ref_sys` / `ADD PRIMARY KEY` anywhere in migrations, server code, or scripts (full-repo search).
- ❌ `drizzle-kit` fully removed — not in `package.json`, `node_modules`, `scripts/deploy-build.sh`, or `scripts/post-merge.sh`.
- ❌ `scripts/deploy-build.sh` does **not** run any schema sync — only cleans assets and builds TypeScript.
- ❌ The PK is not missing in production — it already exists in both environments. The diff is purely about **owner**, not about the key itself.
- ✅ My migration runner (`server/migrate.ts`) guards `42501` on PostGIS system tables — but it cannot intercept DDL generated by Replit's own publish pipeline.
- ❌ **Deleted the production database and recreated it from scratch** via the Publish UI (*Create production database* + *Set up with development data*) — Replit still provisioned a new Neon DB for production. Owner `cloud_admin`. Mismatch persists. **This is the definitive proof that the problem is not fixable from the user side.**

### This is NOT the "shared database" scenario

I have reviewed https://docs.replit.com/references/data-and-storage/shared-database-migration — it does not apply:

- My app is not a fork/remix — no shared dev database.
- My production database is separate (its own Neon instance).
- Production serves correctly — the live deployment works. The failure is only at publish time, in the schema-diff step.

### The platform contradicts itself here

Your shared-database migration guide instructs data transfers to use `--no-owner --no-privileges`, deliberately stripping ownership to avoid conflicts. Yet the publish-time schema diff does the opposite: it emits an ownership-sensitive `ALTER` against a PostGIS system table. The diff should apply the same `--no-owner` philosophy and skip extension-owned system objects.

---

## What I need from support

1. **Stop the publish-time schema diff from touching PostGIS system objects.** Exclude `spatial_ref_sys`, `geometry_columns`, `geography_columns` (and `raster_columns`, `raster_overviews` if present) — these are extension-owned system tables that no application role can or should `ALTER`.
2. **Provision production databases on Helium** (same as development), so `spatial_ref_sys` has the same owner in both environments and the diff produces no statement — or tell me how to move the production DB to Helium myself.
3. **Confirm whether my dev DB upgrade completed correctly**, given that `PGHOST/PGPORT/PGUSER/PGPASSWORD` are still set and `NEON_DATABASE_URL` is missing.

---

## Impact / urgency

- Production deploys are **intermittently blocked** by this single statement. Every publish is a lottery.
- I spent **more than 24 hours** isolating this before tracing it to the database upgrade.
- I have now **exhausted all user-accessible workarounds**, including a full production database recreation.
- Your docs note legacy Neon databases are scheduled for shutdown on **June 1, 2026** — if the production database is not migrated to Helium by then, the production app will lose its database entirely.

Thank you — happy to provide my Repl ID, deploy logs, or run any additional read-only queries you need.
