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
  ],
});
