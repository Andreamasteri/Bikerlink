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
  // Task #2762 — LIVELLO 1 di difesa PostGIS.
  // extensionsFilters è l'opzione ufficiale drizzle-kit ≥ 0.30 per escludere
  // completamente le tabelle PostGIS (spatial_ref_sys, geography_columns,
  // geometry_columns) durante l'introspection. Con questo flag abilitato,
  // drizzle-kit non genera MAI statement DDL su quegli oggetti, risolvendo
  // la causa radice del bug ricorrente:
  //   ALTER TABLE "spatial_ref_sys" ADD PRIMARY KEY ("srid");
  //   must be owner of table spatial_ref_sys
  // Task #2778 — NOTA: extensionsFilters non è affidabile al 100% in
  // drizzle-kit 0.31.x (regressione osservata in produzione). Per questo
  // motivo coesiste con le voci esplicite nel tablesFilter qui sotto (livello 2).
  // I due approcci si completano a vicenda: extensionsFilters è il filtro
  // ufficiale; tablesFilter è la difesa esplicita di fallback.
  extensionsFilters: ["postgis"],
  // Task #2678 — tablesFilter (LIVELLO 2 di difesa) keeps drizzle-kit's
  // "missingItems" list empty so promptNamedWithSchemasConflict (which requires
  // a TTY) is never triggered.
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
  //
  // Task #2778 — PostGIS objects (spatial_ref_sys, geography_columns,
  // geometry_columns) sono aggiunti ANCHE qui come difesa esplicita parallela.
  // extensionsFilters (livello 1) dovrebbe già escluderli, ma in drizzle-kit
  // 0.31.x si sono osservate regressioni in cui il filtro non veniva applicato.
  // Le due opzioni coesistono intenzionalmente: livello 1 (extensionsFilters)
  // + livello 2 (tablesFilter) + livello 3 (db-push-safe.sh).
  tablesFilter: [
    "!session",
    "!integrity_runs",
    "!integrity_violations",
    "!integrity_quarantine",
    "!schema_migrations",
    // Task #2778 — PostGIS system objects: espliciti come fallback per
    // il caso in cui extensionsFilters fallisca in drizzle-kit 0.31.x.
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
