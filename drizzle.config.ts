import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  // Task #2678 — Use drizzle-schema.ts (excludes integrity.ts) to avoid the
  // promptNamedWithSchemasConflict TTY crash. See shared/db/drizzle-schema.ts for
  // the full explanation. App code continues to use shared/db/index.ts.
  schema: "./shared/db/drizzle-schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Task #2678 — tablesFilter keeps drizzle-kit's "missingItems" list empty so
  // promptNamedWithSchemasConflict (which requires a TTY) is never triggered.
  //
  // Background: promptNamedWithSchemasConflict fires for every "to-create" table
  // whenever ANY "DB-only" (to-delete) table exists, regardless of structural
  // similarity. In non-TTY CI it always throws. Solution: exclude every DB table
  // that is not managed by drizzle-kit.
  //
  // !session              — express-session table, not in TS schema
  // !integrity_*          — legacy app-integrity tables (task #2537), already in
  //                         DB and excluded from drizzle-schema.ts to prevent the
  //                         integrity_* → db_integrity_* rename conflict
  // !schema_migrations    — external migration tracking table, not in TS schema
  // !spatial_ref_sys      — PostGIS system table, not in TS schema
  // !geography_columns    — PostGIS view, not in TS schema
  // !geometry_columns     — PostGIS view, not in TS schema
  tablesFilter: [
    "!session",
    "!integrity_runs",
    "!integrity_violations",
    "!integrity_quarantine",
    "!schema_migrations",
    "!spatial_ref_sys",
    "!geography_columns",
    "!geometry_columns",
    // Task #2680 — Expression-index flickering fix.
    // drizzle-kit cannot compare expression indexes (LEAST/GREATEST, ::text cast, GIN
    // trgm) and always generates DROP+CREATE for them on every push. The GIN index and
    // the long-FK-triggered internal names also cause spurious diffs. Excluding these
    // four tables from drizzle-kit management stops the noise; the indexes already
    // exist in the DB and are preserved unchanged. Any future DDL changes for these
    // tables must go through a numbered SQL migration in migrations/.
    "!biker_biker_matches",
    "!match_negative_preferences",
    "!pending_auto_suggestions",
    "!ai_messages",
    // Task #2682 — Tabelle definite in shared/db/*.ts ma MANCANTI sia in dev DB
    // sia in migrations/*.sql. I sottosistemi che le usano (ai/*, db-integrity/*,
    // weekly recaps/*) sono wirati con try/catch non-fatal in server/index.ts,
    // quindi il boot non fallisce. Escluderle qui evita che drizzle-kit push
    // tenti di crearle in dev (e collida con il prompt rename ambiguo).
    // Follow-up: creare migration SQL dedicata per ciascuna prima di abilitare
    // i relativi sottosistemi in produzione.
    "!db_integrity_runs",
    "!db_integrity_violations",
    "!db_integrity_quarantine",
    "!ai_conversations",
    "!ai_pinned_insights",
    "!ai_watchdog_log",
    "!system_health_snapshot",
    "!system_signals",
    "!user_time_profile",
    "!weekly_recaps",
    "!weekly_system_reports",
  ],
});
