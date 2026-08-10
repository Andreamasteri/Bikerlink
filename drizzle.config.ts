import { defineConfig } from "drizzle-kit";

const deployEnvironment = (process.env.BIKERLINK_DEPLOY_ENV ?? "development").trim().toLowerCase();
if (!["development", "staging", "production"].includes(deployEnvironment)) {
  throw new Error(`BIKERLINK_DEPLOY_ENV non valido: ${deployEnvironment}`);
}
const databaseEnvVar =
  deployEnvironment === "production"
    ? "DATABASE_URL_PRODUCTION"
    : deployEnvironment === "staging"
      ? "DATABASE_URL_CANDIDATE"
      : "DATABASE_URL_DEV";
const dbUrl = process.env[databaseEnvVar]?.trim();

if (!dbUrl) {
  throw new Error(`${databaseEnvVar} deve essere configurato; DATABASE_URL generica non è accettata.`);
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/db/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
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
    // biker_zavorrina_matches ha un indice funzionale LEAST/GREATEST (migration 0123,
    // Task #4942) che Drizzle non sa confrontare → escluso dal diff publish.
    "!biker_zavorrina_matches",
    "!match_negative_preferences",
    "!pending_auto_suggestions",
    "!ai_messages",
    // app_crash_logs ha GIN trgm indexes su device_brand e device_model (migration 0087)
    // che Drizzle non sa generare con gin_trgm_ops → escludiamo dal diff publish.
    "!app_crash_logs",
    // tags, users, user_motorcycles hanno GIN expression indexes su normalize_text(col)
    // (migration 0042). Drizzle non può gestire expression indexes con operator class
    // personalizzata → escludiamo dal diff publish per prevenire DROP/CREATE errati.
    "!tags",
    "!users",
    "!user_motorcycles",
    // embeddings ha un indice HNSW pgvector (migration 0095) che Drizzle non sa
    // generare con vector_cosine_ops → escludiamo dal diff publish per prevenire
    // un DROP spurio sull'indice HNSW.
    "!embeddings",
    //
    // NOTA: diagnostic_reports e diagnostic_queue (migration 0106) NON sono in
    // questa lista perché il deploy pipeline le crea automaticamente prima che
    // il diff venga calcolato: server/boot-sequence.ts Phase 2 chiama
    // runMigrations() (server/migrate.ts) che applica tutti i file .sql pending,
    // incluso 0106_diagnostic_tables.sql con CREATE TABLE IF NOT EXISTS.
    // I loro indici sono standard (nessun GIN/expression/HNSW) → Drizzle li
    // confronta correttamente senza generare DROP/CREATE spuri.
    // Non aggiungere qui salvo regressioni nel pipeline di migrazione.
  ],
});
