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
  // !spatial_ref_sys      — PostGIS system table (owned by `postgres`, not the
  //                         app user → `ALTER TABLE` su questa fallisce in prod
  //                         con "must be owner of table spatial_ref_sys" e
  //                         blocca il publish). Task #2700.
  // !geography_columns    — PostGIS view, idem
  // !geometry_columns     — PostGIS view, idem
  //
  // Task #2700 — i pattern sono duplicati anche schema-qualified
  // (`!public.spatial_ref_sys`) perché alcune versioni di drizzle-kit
  // applicano il filtro solo dopo aver costruito il diff schema-qualified,
  // lasciando passare uno statement `ALTER TABLE spatial_ref_sys ADD
  // PRIMARY KEY` che fa fallire il deploy. Defense-in-depth: anche
  // `scripts/db-push-safe.sh` intercetta eventuali errori di ownership
  // residui sui tre oggetti PostGIS.
  tablesFilter: [
    "!session",
    "!integrity_runs",
    "!integrity_violations",
    "!integrity_quarantine",
    "!schema_migrations",
    "!spatial_ref_sys",
    "!geography_columns",
    "!geometry_columns",
    "!public.spatial_ref_sys",
    "!public.geography_columns",
    "!public.geometry_columns",
    // Task #2680 — Expression-index flickering fix.
    // drizzle-kit cannot compare expression indexes (LEAST/GREATEST, ::text cast, GIN
    // trgm) and always generates DROP+CREATE for them on every push. The GIN index and
    // the long-FK-triggered internal names also cause spurious diffs. Excluding these
    // four tables from drizzle-kit management stops the noise; the indexes already
    // exist in the DB and are preserved unchanged. Any future DDL changes for these
    // tables must go through a numbered SQL migration in migrations/.
    // Task #2682 — defense-in-depth: queste 4 tabelle sono già escluse dal
    // grafo di drizzle-schema.ts (spostate in matching-drizzle-excluded.ts e
    // ai-console-messages.ts, non re-exportate dai moduli inclusi). Le
    // riaggiungiamo a tablesFilter come ulteriore safeguard: se un futuro
    // refactor reintroducesse un re-export accidentale, tablesFilter
    // continuerebbe comunque a impedirne la gestione da parte di drizzle-kit.
    "!biker_biker_matches",
    "!match_negative_preferences",
    "!pending_auto_suggestions",
    "!ai_messages",
  ],
});
