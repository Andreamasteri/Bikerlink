---
name: publish spatial_ref_sys ownership error
description: Why Replit publish (copy dev→prod OFF) fails with "must be owner of table spatial_ref_sys" and the supported fix.
---

# Publish fails on spatial_ref_sys (PostGIS) when copy dev→prod is OFF

When publishing with the "copy development database → production" toggle OFF,
Replit's publish flow computes a schema diff (dev introspection vs prod
introspection) and applies it to prod. With PostGIS installed, that diff emits a
spurious `ALTER TABLE "spatial_ref_sys" ADD PRIMARY KEY ("srid")` even though
both dev and prod already have identical constraints on that table. It fails with
`must be owner of table spatial_ref_sys` because spatial_ref_sys is a PostGIS
system table owned by `cloud_admin` (dev owner is `postgres`), not the app DB user.

- Copy ON = full dev→prod copy, no diff → works, but **overwrites prod data** every deploy.
- Copy OFF = diff → emits the spatial_ref_sys ALTER → deploy blocked.

**Fix:** keep a valid `drizzle.config.ts` at repo root with
`extensionsFilters: ["postgis"]` and an explicit `!spatial_ref_sys`
(plus `!geography_columns`, `!geometry_columns`) in `tablesFilter`. These tell the
introspection diff to skip the PostGIS system objects so copy-OFF publishes
succeed without touching prod data. Requires `drizzle-kit` installed so the config
import resolves.

**Why:** the config was deleted once (drizzle-kit removal effort), which removed
the PostGIS filters and re-exposed this error. The DB-skill anti-patterns
(deploy-time `db:push`, startup DDL in server/migrate.ts, ad-hoc migrations/*.sql
targeting prod) are NOT the right fix — the supported lever is the schema source
of truth (drizzle.config.ts) + re-publish.

**How to apply:** if this error returns at publish, first check `drizzle.config.ts`
still exists with the PostGIS filters. Do NOT add drizzle-kit push to
scripts/deploy-build.sh or DDL to the app entrypoint. Confirming the platform
honors the filters requires an actual copy-OFF publish attempt.
