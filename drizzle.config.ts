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
  // NOTA: drizzle-kit push NON gira più nel deploy (rimosso in Task #2800+).
  // server/migrate.ts gestisce tutte le migration via file .sql numerati.
  // extensionsFilters e tablesFilter restano attivi per l'uso locale
  // (`npm run db:push`) e come documentazione delle esclusioni necessarie.
  //
  // extensionsFilters: esclude le tabelle PostGIS (spatial_ref_sys, ecc.)
  // durante l'introspection — opzione ufficiale drizzle-kit ≥ 0.30.
  extensionsFilters: ["postgis"],
  // tablesFilter: esclude tabelle non gestite da drizzle-kit per evitare
  // il TTY crash (promptNamedWithSchemasConflict) in ambienti non-interattivi.
  //
  // !session              — express-session table, not in TS schema
  // !integrity_*          — legacy app-integrity tables (task #2537)
  // !schema_migrations    — migration tracking table, not in TS schema
  // !spatial_ref_sys etc  — PostGIS system objects (fallback per drizzle-kit 0.31.x)
  // !biker_biker_matches etc — tabelle con expression-index non confrontabili
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
