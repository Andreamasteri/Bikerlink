import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/db/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // IMPORTANTE — questo file NON serve a far girare `drizzle-kit push` nel deploy.
  // Le migration runtime sono gestite da server/migrate.ts (file .sql numerati).
  // Lo scopo di questa config è la PUBLISH flow di Replit: quando si pubblica con
  // la copia dati dev→prod DISATTIVATA, Replit calcola un diff di schema dev↔prod.
  // Senza questi filtri il diff genera un `ALTER TABLE spatial_ref_sys ADD PRIMARY
  // KEY` su una tabella di sistema PostGIS di proprietà di cloud_admin → fallisce
  // con "must be owner of table spatial_ref_sys" e blocca il deploy.
  //
  // extensionsFilters: esclude le tabelle gestite dall'estensione PostGIS
  // (spatial_ref_sys, geography_columns, geometry_columns) dall'introspection.
  extensionsFilters: ["postgis"],
  // tablesFilter: esclusioni esplicite, sia come fallback per extensionsFilters
  // sia per le tabelle non descritte nello schema TS (session, schema_migrations,
  // integrity_*) e quelle con expression-index non confrontabili dal diff.
  tablesFilter: [
    "!session",
    "!schema_migrations",
    "!integrity_runs",
    "!integrity_violations",
    "!integrity_quarantine",
    // PostGIS system objects — fallback espliciti per extensionsFilters.
    "!spatial_ref_sys",
    "!geography_columns",
    "!geometry_columns",
    // Tabelle con expression-index (LEAST/GREATEST, ::text cast, GIN trgm) che il
    // diff non sa confrontare e per cui genererebbe DROP+CREATE spurî.
    "!biker_biker_matches",
    "!match_negative_preferences",
    "!pending_auto_suggestions",
    "!ai_messages",
    // app_crash_logs ha GIN trgm indexes su device_brand e device_model (migration 0087)
    // che Drizzle non sa generare con gin_trgm_ops → escludiamo dal diff publish.
    "!app_crash_logs",
  ],
});
